const { createStatsEmbed } = require('../utils/embeds');
const { getUserMoney, getAllUserData } = require('../utils/data');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    data: {
        name: 'stats',
        description: 'View gambling statistics and leaderboards',
        options: [
            {
                name: 'user',
                description: 'View another user\'s stats',
                type: 1,
                options: [
                    {
                        name: 'target',
                        description: 'The user to view stats for',
                        type: 6,
                        required: false
                    }
                ]
            },
            {
                name: 'debtors',
                description: 'View the debtors leaderboard',
                type: 1
            }
        ]
    },

    async execute(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'debtors') {
                await handleDebtorsLeaderboard(interaction);
            } else {
                // Default 'user' subcommand
                const targetUser = interaction.options.getUser('target') || interaction.user;

                // Ensure the target user has data initialized
                await getUserMoney(targetUser.id);

                // Create and send the stats embed
                const statsEmbed = await createStatsEmbed(targetUser, interaction.client);
                await interaction.reply({ embeds: [statsEmbed] });
            }

        } catch (error) {
            console.error('Error in stats command:', error);
            await interaction.reply({
                content: '❌ An error occurred while retrieving statistics. Please try again.',
                ephemeral: true
            });
        }
    }
};

async function handleDebtorsLeaderboard(interaction) {
    const allUserData = getAllUserData();
    const debtors = [];

    // Collect all users with active loans
    for (const [userId, userData] of Object.entries(allUserData)) {
        if (userData.activeLoan) {
            const loan = userData.activeLoan;
            const remaining = loan.totalOwed - loan.amountPaid;

            debtors.push({
                userId,
                remaining,
                daysOverdue: loan.daysOverdue,
                dueDate: loan.dueDate,
                creditScore: userData.creditScore
            });
        }
    }

    if (debtors.length === 0) {
        return interaction.reply({
            content: '✨ No one currently has any active loans! Everyone is debt-free!',
            ephemeral: false
        });
    }

    // Sort by amount owed (descending)
    debtors.sort((a, b) => b.remaining - a.remaining);

    // Take top 10
    const topDebtors = debtors.slice(0, 10);

    const embed = new EmbedBuilder()
        .setTitle('💸 Debtors Leaderboard - Hall of Shame 💸')
        .setDescription(`Total debtors: **${debtors.length}**\n\n🔴 Overdue | 🟡 Due Soon | 🟢 On Time`)
        .setColor('#FF0000')
        .setTimestamp();

    // Build leaderboard entries
    for (let i = 0; i < topDebtors.length; i++) {
        const debtor = topDebtors[i];
        let user;

        try {
            user = await interaction.client.users.fetch(debtor.userId);
        } catch (error) {
            user = { username: 'Unknown User' };
        }

        // Determine status emoji
        let statusEmoji = '🟢'; // On time
        if (debtor.daysOverdue > 0) {
            statusEmoji = '🔴'; // Overdue
        } else if (Date.now() > debtor.dueDate - (24 * 60 * 60 * 1000)) {
            statusEmoji = '🟡'; // Due within 24 hours
        }

        // Build status text
        let statusText = '';
        if (debtor.daysOverdue > 0) {
            statusText = ` | **${debtor.daysOverdue} days overdue**`;
        } else {
            const timeLeft = debtor.dueDate - Date.now();
            const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
            statusText = ` | Due in ${hoursLeft}h`;
        }

        embed.addFields({
            name: `${i + 1}. ${statusEmoji} ${user.username}`,
            value: `Owes: **${debtor.remaining.toLocaleString()}**${statusText}\nCredit Score: ${debtor.creditScore}/1000`,
            inline: false
        });
    }

    if (debtors.length > 10) {
        embed.setFooter({ text: `Showing top 10 of ${debtors.length} total debtors` });
    }

    await interaction.reply({ embeds: [embed] });
}