const { EmbedBuilder } = require('discord.js');
const { getUserMoney, setUserMoney, getUserData } = require('../utils/data');
const { makePayment } = require('../utils/loanSystem');

// Work cooldown: 4 hours
const WORK_COOLDOWN = 4 * 60 * 60 * 1000;

const WORK_JOBS = [
    { name: '🍕 Delivered pizzas', pay: [50, 150] },
    { name: '🧹 Cleaned the casino', pay: [75, 125] },
    { name: '🚗 Drove a taxi', pay: [80, 180] },
    { name: '📦 Sorted packages', pay: [60, 140] },
    { name: '💼 Filed paperwork', pay: [70, 130] },
    { name: '🎰 Dealt cards', pay: [90, 160] },
    { name: '🍔 Flipped burgers', pay: [55, 145] },
    { name: '🏗️ Helped construction', pay: [100, 200] },
    { name: '🎨 Created art', pay: [85, 175] },
    { name: '📚 Tutored students', pay: [95, 155] }
];

module.exports = {
    data: {
        name: 'work',
        description: 'Work to earn money (4 hour cooldown)',
        options: []
    },

    async execute(interaction) {
        const userId = interaction.user.id;
        const userData = getUserData(userId);

        if (!userData) {
            return interaction.reply({
                content: '❌ User data not found!',
                ephemeral: true
            });
        }

        // Check cooldown
        const lastWork = userData.lastWork || 0;
        const timeLeft = (lastWork + WORK_COOLDOWN) - Date.now();

        if (timeLeft > 0) {
            const hours = Math.floor(timeLeft / (60 * 60 * 1000));
            const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

            return interaction.reply({
                content: `⏰ You're too tired to work! Come back in ${hours}h ${minutes}m.`,
                ephemeral: true
            });
        }

        // Random job and pay
        const job = WORK_JOBS[Math.floor(Math.random() * WORK_JOBS.length)];
        let earnings = Math.floor(Math.random() * (job.pay[1] - job.pay[0] + 1)) + job.pay[0];

        // Apply VIP work bonus
        const { getVIPWorkBonus } = require('../utils/vip');
        const vipBonus = getVIPWorkBonus(userId);
        let vipBonusAmount = 0;

        if (vipBonus > 0) {
            vipBonusAmount = Math.floor(earnings * vipBonus);
            earnings += vipBonusAmount;
        }

        // Update last work time
        userData.lastWork = Date.now();
        require('../utils/data').saveUserData();

        // Check if has loan
        let loanDeduction = 0;
        let afterLoan = earnings;

        if (userData.activeLoan) {
            const loan = userData.activeLoan;
            const remaining = loan.totalOwed - loan.amountPaid;

            // Take 75% of earnings for loan if overdue, otherwise 50%
            const deductionRate = loan.daysOverdue > 0 ? 0.75 : 0.5;
            loanDeduction = Math.min(Math.floor(earnings * deductionRate), remaining);

            if (loanDeduction > 0) {
                const paymentResult = makePayment(userId, loanDeduction);
                afterLoan = earnings - loanDeduction;
            }
        }

        // Give money
        const currentMoney = await getUserMoney(userId);
        await setUserMoney(userId, currentMoney + afterLoan);

        // Check work achievements and update challenges
        const { checkWorkAchievements } = require('../utils/achievements');
        const { updateChallengeProgress } = require('../utils/challenges');

        await checkWorkAchievements(userId);
        await updateChallengeProgress(userId, { type: 'work' });

        const embed = new EmbedBuilder()
            .setTitle('💼 Work Complete!')
            .setColor(loanDeduction > 0 ? '#FFA500' : '#00FF00')
            .setDescription(`${job.name} and earned **${earnings.toLocaleString()}**!`);

        if (loanDeduction > 0) {
            const updatedUserData = getUserData(userId);
            const stillHasLoan = updatedUserData.activeLoan !== null;

            embed.addFields(
                { name: '💵 Earnings', value: `${earnings.toLocaleString()}`, inline: true },
                { name: '⚠️ Loan Payment', value: `-${loanDeduction.toLocaleString()}`, inline: true },
                { name: '💰 Net Earnings', value: `${afterLoan.toLocaleString()}`, inline: true }
            );

            if (!stillHasLoan) {
                embed.addFields({
                    name: '✅ LOAN PAID OFF!',
                    value: 'Your loan has been fully repaid with this payment!',
                    inline: false
                });
                embed.setColor('#00FF00');
            }
        } else {
            embed.addFields(
                { name: '💰 Earned', value: `${earnings.toLocaleString()}`, inline: true },
                { name: '💵 New Balance', value: `${(currentMoney + afterLoan).toLocaleString()}`, inline: true }
            );
        }

        embed.setFooter({ text: 'You can work again in 4 hours' });
        embed.setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
