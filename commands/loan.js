const { EmbedBuilder } = require('discord.js');
const { getUserMoney, setUserMoney, getUserData } = require('../utils/data');
const {
    canGetLoan,
    createLoan,
    makePayment,
    getMaxLoanAmount,
    getInterestRate,
    getRepaymentDays
} = require('../utils/loanSystem');

module.exports = {
    data: {
        name: 'loan',
        description: 'Manage loans - borrow money with interest',
        options: [
            {
                name: 'request',
                description: 'Request a new loan',
                type: 1, // SUB_COMMAND
                options: [
                    {
                        name: 'amount',
                        description: 'Amount to borrow',
                        type: 4,
                        required: true,
                        min_value: 100
                    }
                ]
            },
            {
                name: 'repay',
                description: 'Make a payment on your loan',
                type: 1,
                options: [
                    {
                        name: 'amount',
                        description: 'Amount to pay (leave empty for full payment)',
                        type: 4,
                        required: false,
                        min_value: 1
                    }
                ]
            },
            {
                name: 'status',
                description: 'Check your current loan status',
                type: 1
            },
            {
                name: 'history',
                description: 'View your loan history',
                type: 1
            }
        ]
    },

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        if (subcommand === 'request') {
            await handleLoanRequest(interaction, userId);
        } else if (subcommand === 'repay') {
            await handleLoanRepayment(interaction, userId);
        } else if (subcommand === 'status') {
            await handleLoanStatus(interaction, userId);
        } else if (subcommand === 'history') {
            await handleLoanHistory(interaction, userId);
        }
    }
};

async function handleLoanRequest(interaction, userId) {
    const amount = interaction.options.getInteger('amount');
    const userData = getUserData(userId);

    if (!userData) {
        return interaction.reply({
            content: '❌ User data not found!',
            ephemeral: true
        });
    }

    // Check if can get loan
    const { canLoan, reason } = canGetLoan(userId);
    if (!canLoan) {
        return interaction.reply({
            content: `❌ ${reason}`,
            ephemeral: true
        });
    }

    // Check max loan amount
    const maxLoan = getMaxLoanAmount(userData.creditScore);
    if (amount > maxLoan) {
        return interaction.reply({
            content: `❌ Your credit score (${userData.creditScore}) only allows loans up to ${maxLoan.toLocaleString()}!`,
            ephemeral: true
        });
    }

    // Create loan
    const interestRate = getInterestRate(userData.creditScore, amount);
    const repaymentDays = getRepaymentDays(amount);
    const loan = createLoan(userId, amount);

    if (!loan) {
        return interaction.reply({
            content: '❌ Error creating loan!',
            ephemeral: true
        });
    }

    // Give money to user
    const currentMoney = await getUserMoney(userId);
    await setUserMoney(userId, currentMoney + amount);

    const embed = new EmbedBuilder()
        .setTitle('💰 Loan Approved!')
        .setColor('#00FF00')
        .setDescription(`Your loan of **${amount.toLocaleString()}** has been approved!`)
        .addFields(
            { name: '💵 Loan Amount', value: `${amount.toLocaleString()}`, inline: true },
            { name: '📈 Interest Rate', value: `${interestRate}%`, inline: true },
            { name: '💸 Interest', value: `${loan.interestAmount.toLocaleString()}`, inline: true },
            { name: '💰 Total to Repay', value: `${loan.totalOwed.toLocaleString()}`, inline: true },
            { name: '📅 Repayment Period', value: `${repaymentDays} days`, inline: true },
            { name: '⚠️ Due Date', value: `<t:${Math.floor(loan.dueDate / 1000)}:R>`, inline: true }
        )
        .setFooter({ text: `Credit Score: ${userData.creditScore} | Failure to repay will result in penalties!` })
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handleLoanRepayment(interaction, userId) {
    const userData = getUserData(userId);

    if (!userData || !userData.activeLoan) {
        return interaction.reply({
            content: '❌ You don\'t have an active loan!',
            ephemeral: true
        });
    }

    const loan = userData.activeLoan;
    const remaining = loan.totalOwed - loan.amountPaid;
    let paymentAmount = interaction.options.getInteger('amount');

    // If no amount specified, pay full remaining
    if (!paymentAmount) {
        paymentAmount = remaining;
    }

    const userMoney = await getUserMoney(userId);

    if (userMoney < paymentAmount) {
        return interaction.reply({
            content: `❌ You don't have enough money! You have ${userMoney.toLocaleString()}, need ${paymentAmount.toLocaleString()}.`,
            ephemeral: true
        });
    }

    // Deduct payment
    await setUserMoney(userId, userMoney - paymentAmount);

    // Make payment
    const result = makePayment(userId, paymentAmount);

    const embed = new EmbedBuilder()
        .setTitle(result.paidOff ? '✅ Loan Paid Off!' : '💵 Payment Made')
        .setColor(result.paidOff ? '#00FF00' : '#0099FF')
        .setDescription(result.paidOff ? 'Congratulations! Your loan has been fully repaid!' : `Payment of **${result.payment.toLocaleString()}** received.`)
        .addFields(
            { name: '💸 Payment Amount', value: `${result.payment.toLocaleString()}`, inline: true },
            { name: '💰 Remaining Balance', value: `${result.remaining.toLocaleString()}`, inline: true }
        );

    if (result.paidOff) {
        const updatedUser = getUserData(userId);
        embed.addFields({ name: '📊 New Credit Score', value: `${updatedUser.creditScore}`, inline: true });
        embed.setFooter({ text: 'Your credit score has been updated!' });
    }

    embed.setTimestamp();
    await interaction.reply({ embeds: [embed] });
}

async function handleLoanStatus(interaction, userId) {
    const userData = getUserData(userId);

    if (!userData) {
        return interaction.reply({ content: '❌ User data not found!', ephemeral: true });
    }

    if (!userData.activeLoan) {
        const maxLoan = getMaxLoanAmount(userData.creditScore);
        const embed = new EmbedBuilder()
            .setTitle('💰 Loan Status')
            .setColor('#0099FF')
            .setDescription('You don\'t have an active loan.')
            .addFields(
                { name: '📊 Credit Score', value: `${userData.creditScore}/1000`, inline: true },
                { name: '💵 Max Loan Available', value: `${maxLoan.toLocaleString()}`, inline: true }
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }

    const loan = userData.activeLoan;
    const remaining = loan.totalOwed - loan.amountPaid;
    const isOverdue = Date.now() > loan.dueDate;

    const embed = new EmbedBuilder()
        .setTitle('💰 Active Loan Status')
        .setColor(isOverdue ? '#FF0000' : loan.daysOverdue > 0 ? '#FFA500' : '#00FF00')
        .addFields(
            { name: '💵 Original Loan', value: `${loan.principalAmount.toLocaleString()}`, inline: true },
            { name: '📈 Interest Rate', value: `${loan.interestRate}%`, inline: true },
            { name: '💸 Interest', value: `${loan.interestAmount.toLocaleString()}`, inline: true },
            { name: '💰 Total Owed', value: `${loan.totalOwed.toLocaleString()}`, inline: true },
            { name: '✅ Amount Paid', value: `${loan.amountPaid.toLocaleString()}`, inline: true },
            { name: '⚠️ Remaining', value: `${remaining.toLocaleString()}`, inline: true },
            { name: '📅 Due Date', value: `<t:${Math.floor(loan.dueDate / 1000)}:R>`, inline: true },
            { name: '📊 Credit Score', value: `${userData.creditScore}/1000`, inline: true }
        );

    if (loan.daysOverdue > 0) {
        embed.addFields({
            name: '🚨 OVERDUE',
            value: `**${loan.daysOverdue} days late!** Additional interest is accruing at 5% per day!`,
            inline: false
        });
    }

    if (loan.daysOverdue >= 3) {
        embed.addFields({
            name: '⛔ ACCOUNT RESTRICTED',
            value: 'You cannot play games until this loan is repaid!',
            inline: false
        });
    }

    embed.setFooter({ text: '50% of all winnings will be automatically deducted for loan repayment' });
    embed.setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handleLoanHistory(interaction, userId) {
    const userData = getUserData(userId);

    if (!userData || !userData.loanHistory || userData.loanHistory.length === 0) {
        return interaction.reply({
            content: '📋 You have no loan history.',
            ephemeral: true
        });
    }

    const embed = new EmbedBuilder()
        .setTitle('📋 Loan History')
        .setColor('#0099FF')
        .setDescription(`**Credit Score:** ${userData.creditScore}/1000\n\n**Past Loans:**`);

    const history = userData.loanHistory.slice(-10); // Last 10 loans

    for (let i = 0; i < history.length; i++) {
        const loan = history[i];
        const status = loan.paidOnTime ? '✅ On Time' : `❌ ${loan.daysOverdue} days late`;
        const date = new Date(loan.date).toLocaleDateString();

        embed.addFields({
            name: `Loan #${userData.loanHistory.length - history.length + i + 1}`,
            value: `Amount: ${loan.amount.toLocaleString()} | ${status} | ${date}`,
            inline: false
        });
    }

    embed.setTimestamp();
    await interaction.reply({ embeds: [embed] });
}
