const {
    createStatsEmbed,
    createEconomyStatsEmbed,
    createHeistStatsEmbed,
    createProgressionStatsEmbed,
    createGuildStatsEmbed
} = require('../utils/embeds');
const { getUserMoney, getAllUserData } = require('../utils/data');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    data: {
        name: 'stats',
        description: 'View statistics and leaderboards',
        options: [
            {
                name: 'gambling',
                description: 'View gambling statistics',
                type: 1,
                options: [
                    {
                        name: 'user',
                        description: 'The user to view stats for',
                        type: 6,
                        required: false
                    }
                ]
            },
            {
                name: 'economy',
                description: 'View economy statistics (properties, work, VIP)',
                type: 1,
                options: [
                    {
                        name: 'user',
                        description: 'The user to view stats for',
                        type: 6,
                        required: false
                    }
                ]
            },
            {
                name: 'heists',
                description: 'View heist statistics',
                type: 1,
                options: [
                    {
                        name: 'user',
                        description: 'The user to view stats for',
                        type: 6,
                        required: false
                    }
                ]
            },
            {
                name: 'progression',
                description: 'View achievements and challenges',
                type: 1,
                options: [
                    {
                        name: 'user',
                        description: 'The user to view stats for',
                        type: 6,
                        required: false
                    }
                ]
            },
            {
                name: 'guild',
                description: 'View guild statistics',
                type: 1,
                options: [
                    {
                        name: 'user',
                        description: 'The user to view stats for',
                        type: 6,
                        required: false
                    }
                ]
            },
            {
                name: 'leaderboard',
                description: 'View leaderboards',
                type: 1,
                options: [
                    {
                        name: 'category',
                        description: 'Leaderboard category',
                        type: 3,
                        required: false,
                        choices: [
                            { name: 'Richest Players', value: 'richest' },
                            { name: 'Best Heist Success Rate', value: 'heists' },
                            { name: 'Highest Property Income', value: 'properties' },
                            { name: 'Guild Rankings', value: 'guilds' },
                            { name: 'Debtors (Hall of Shame)', value: 'debtors' }
                        ]
                    }
                ]
            }
        ]
    },

    async execute(interaction) {
        try {
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'leaderboard') {
                const category = interaction.options.getString('category') || 'richest';
                await handleLeaderboards(interaction, category);
            } else {
                // All other subcommands show user stats
                const targetUser = interaction.options.getUser('user') || interaction.user;

                // Ensure the target user has data initialized
                await getUserMoney(targetUser.id);

                let statsEmbed;

                switch (subcommand) {
                    case 'gambling':
                        statsEmbed = await createStatsEmbed(targetUser, interaction.client);
                        break;
                    case 'economy':
                        statsEmbed = await createEconomyStatsEmbed(targetUser, interaction.client);
                        break;
                    case 'heists':
                        statsEmbed = await createHeistStatsEmbed(targetUser, interaction.client);
                        break;
                    case 'progression':
                        statsEmbed = await createProgressionStatsEmbed(targetUser, interaction.client);
                        break;
                    case 'guild':
                        statsEmbed = await createGuildStatsEmbed(targetUser, interaction.client);
                        break;
                    default:
                        statsEmbed = await createStatsEmbed(targetUser, interaction.client);
                }

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

async function handleLeaderboards(interaction, category) {
    switch (category) {
        case 'richest':
            await handleRichestLeaderboard(interaction);
            break;
        case 'heists':
            await handleHeistLeaderboard(interaction);
            break;
        case 'properties':
            await handlePropertyLeaderboard(interaction);
            break;
        case 'guilds':
            await handleGuildLeaderboard(interaction);
            break;
        case 'debtors':
            await handleDebtorsLeaderboard(interaction);
            break;
        default:
            await handleRichestLeaderboard(interaction);
    }
}

async function handleRichestLeaderboard(interaction) {
    const allUserData = getAllUserData();
    const users = [];

    for (const [userId, userData] of Object.entries(allUserData)) {
        users.push({
            userId,
            money: userData.money || 0,
            netWorth: (userData.money || 0) + (userData.statistics?.totalPropertyValue || 0)
        });
    }

    if (users.length === 0) {
        return interaction.reply({
            content: '❌ No user data found!',
            ephemeral: true
        });
    }

    // Sort by net worth (descending)
    users.sort((a, b) => b.netWorth - a.netWorth);

    // Take top 10
    const topUsers = users.slice(0, 10);

    const embed = new EmbedBuilder()
        .setTitle('💰 Richest Players Leaderboard')
        .setDescription('Top 10 players by net worth (balance + property value)')
        .setColor('#FFD700')
        .setTimestamp();

    for (let i = 0; i < topUsers.length; i++) {
        const userEntry = topUsers[i];
        let user;

        try {
            user = await interaction.client.users.fetch(userEntry.userId);
        } catch (error) {
            user = { username: 'Unknown User' };
        }

        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;

        embed.addFields({
            name: `${medal} ${user.username}`,
            value: `Net Worth: $${userEntry.netWorth.toLocaleString()}\nBalance: $${userEntry.money.toLocaleString()}`,
            inline: false
        });
    }

    if (users.length > 10) {
        embed.setFooter({ text: `Showing top 10 of ${users.length} total players` });
    }

    await interaction.reply({ embeds: [embed] });
}

async function handleHeistLeaderboard(interaction) {
    const allUserData = getAllUserData();
    const users = [];

    for (const [userId, userData] of Object.entries(allUserData)) {
        if (userData.heist && userData.heist.totalHeists > 0) {
            const successRate = (userData.heist.successfulHeists / userData.heist.totalHeists) * 100;
            users.push({
                userId,
                totalHeists: userData.heist.totalHeists,
                successfulHeists: userData.heist.successfulHeists,
                successRate,
                biggestScore: userData.heist.biggestScore || 0,
                totalEarned: userData.heist.totalEarned || 0
            });
        }
    }

    if (users.length === 0) {
        return interaction.reply({
            content: 'ℹ️ No one has attempted any heists yet!',
            ephemeral: false
        });
    }

    // Sort by success rate (descending), then by total heists
    users.sort((a, b) => {
        if (b.successRate === a.successRate) {
            return b.totalHeists - a.totalHeists;
        }
        return b.successRate - a.successRate;
    });

    // Take top 10
    const topUsers = users.slice(0, 10);

    const embed = new EmbedBuilder()
        .setTitle('🎭 Best Heist Success Rate Leaderboard')
        .setDescription('Top 10 heist masters by success rate')
        .setColor('#FF6600')
        .setTimestamp();

    for (let i = 0; i < topUsers.length; i++) {
        const userEntry = topUsers[i];
        let user;

        try {
            user = await interaction.client.users.fetch(userEntry.userId);
        } catch (error) {
            user = { username: 'Unknown User' };
        }

        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;

        embed.addFields({
            name: `${medal} ${user.username}`,
            value: `Success Rate: **${userEntry.successRate.toFixed(1)}%** (${userEntry.successfulHeists}/${userEntry.totalHeists})\n` +
                   `Total Earned: $${userEntry.totalEarned.toLocaleString()} | Biggest Score: $${userEntry.biggestScore.toLocaleString()}`,
            inline: false
        });
    }

    if (users.length > 10) {
        embed.setFooter({ text: `Showing top 10 of ${users.length} heist participants` });
    }

    await interaction.reply({ embeds: [embed] });
}

async function handlePropertyLeaderboard(interaction) {
    const allUserData = getAllUserData();
    const users = [];

    for (const [userId, userData] of Object.entries(allUserData)) {
        if (userData.statistics?.totalPropertyIncomeCollected > 0 || userData.statistics?.totalPropertiesOwned > 0) {
            users.push({
                userId,
                totalCollected: userData.statistics.totalPropertyIncomeCollected || 0,
                totalProperties: userData.statistics.totalPropertiesOwned || 0,
                propertyValue: userData.statistics.totalPropertyValue || 0
            });
        }
    }

    if (users.length === 0) {
        return interaction.reply({
            content: 'ℹ️ No one owns any properties yet!',
            ephemeral: false
        });
    }

    // Sort by total income collected (descending)
    users.sort((a, b) => b.totalCollected - a.totalCollected);

    // Take top 10
    const topUsers = users.slice(0, 10);

    const embed = new EmbedBuilder()
        .setTitle('🏢 Highest Property Income Leaderboard')
        .setDescription('Top 10 property moguls by total income collected')
        .setColor('#00D9FF')
        .setTimestamp();

    for (let i = 0; i < topUsers.length; i++) {
        const userEntry = topUsers[i];
        let user;

        try {
            user = await interaction.client.users.fetch(userEntry.userId);
        } catch (error) {
            user = { username: 'Unknown User' };
        }

        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;

        embed.addFields({
            name: `${medal} ${user.username}`,
            value: `Total Income: $${userEntry.totalCollected.toLocaleString()}\n` +
                   `Properties Owned: ${userEntry.totalProperties} | Portfolio Value: $${userEntry.propertyValue.toLocaleString()}`,
            inline: false
        });
    }

    if (users.length > 10) {
        embed.setFooter({ text: `Showing top 10 of ${users.length} property owners` });
    }

    await interaction.reply({ embeds: [embed] });
}

async function handleGuildLeaderboard(interaction) {
    const { getGuildLeaderboards } = require('../utils/guilds');
    const leaderboards = getGuildLeaderboards();

    if (leaderboards.byWealth.length === 0) {
        return interaction.reply({
            content: 'ℹ️ No guilds exist yet! Create one with `/guild create`',
            ephemeral: false
        });
    }

    const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('🏆 Guild Leaderboards')
        .setTimestamp();

    // By Wealth
    if (leaderboards.byWealth.length > 0) {
        const wealthText = leaderboards.byWealth.slice(0, 5).map((guild, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            return `${medal} **${guild.name}** - $${guild.totalWealth.toLocaleString()} (${guild.memberCount} members)`;
        }).join('\n');

        embed.addFields({
            name: '💰 Top Guilds by Total Wealth',
            value: wealthText,
            inline: false
        });
    }

    // By Games Won
    if (leaderboards.byGamesWon.length > 0) {
        const gamesText = leaderboards.byGamesWon.slice(0, 5).map((guild, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            return `${medal} **${guild.name}** - ${guild.totalGamesWon.toLocaleString()} wins`;
        }).join('\n');

        embed.addFields({
            name: '🎮 Top Guilds by Games Won',
            value: gamesText,
            inline: false
        });
    }

    await interaction.reply({ embeds: [embed] });
}

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
