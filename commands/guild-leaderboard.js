const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getUserGuild } = require('../utils/guilds');
const { getTopGuildsByXP, getPendingRewards, getGuildRewardHistory, SEASON_REWARDS, WEEKLY_REWARDS } = require('../utils/guildRewards');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('guild-leaderboard')
        .setDescription('View guild leaderboards and rewards')
        .addSubcommand(subcommand =>
            subcommand
                .setName('top')
                .setDescription('View top guilds by XP')
                .addIntegerOption(option =>
                    option.setName('limit')
                        .setDescription('Number of guilds to show (1-25)')
                        .setMinValue(1)
                        .setMaxValue(25)
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('rewards')
                .setDescription('View your guild\'s pending and claimed rewards')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reward-tiers')
                .setDescription('View reward tiers for season and weekly rankings')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        try {
            if (subcommand === 'top') {
                await showTopGuilds(interaction);
            } else if (subcommand === 'rewards') {
                await showGuildRewards(interaction);
            } else if (subcommand === 'reward-tiers') {
                await showRewardTiers(interaction);
            }

        } catch (error) {
            console.error('Error in guild-leaderboard command:', error);
            return interaction.reply({
                content: '❌ An error occurred while fetching leaderboard data.',
                flags: [MessageFlags.Ephemeral]
            });
        }
    }
};

/**
 * Show top guilds leaderboard
 */
async function showTopGuilds(interaction) {
    const limit = interaction.options.getInteger('limit') || 10;

    const topGuilds = await getTopGuildsByXP(limit);

    if (topGuilds.length === 0) {
        return interaction.reply({
            content: '📊 No guilds found!',
            flags: [MessageFlags.Ephemeral]
        });
    }

    const embed = new EmbedBuilder()
        .setTitle('🏆 Top Guilds Leaderboard')
        .setDescription('Guilds ranked by total XP earned')
        .setColor('#FFD700')
        .setTimestamp();

    let leaderboardText = '';
    for (let i = 0; i < topGuilds.length; i++) {
        const guild = topGuilds[i];
        const rank = i + 1;

        let medal = '';
        if (rank === 1) medal = '🥇';
        else if (rank === 2) medal = '🥈';
        else if (rank === 3) medal = '🥉';
        else medal = `**${rank}.**`;

        leaderboardText += `${medal} **${guild.guildName}** (Level ${guild.level})\n`;
        leaderboardText += `   └ ${guild.totalXp.toLocaleString()} XP • ${guild.memberCount} members\n\n`;
    }

    embed.setDescription(leaderboardText);

    // Show reward info
    embed.addFields({
        name: '🎁 Rewards',
        value: '**Top 10** guilds earn season-end rewards!\n**Top 5** guilds earn weekly rewards!\n\nUse `/guild-leaderboard reward-tiers` to see rewards.',
        inline: false
    });

    await interaction.reply({ embeds: [embed] });
}

/**
 * Show guild's pending and claimed rewards
 */
async function showGuildRewards(interaction) {
    // Check if user is in a guild
    const userGuild = await getUserGuild(interaction.user.id);
    if (!userGuild) {
        return interaction.reply({
            content: '❌ You must be in a guild to view rewards!\n\nUse `/guild create` to start your own guild or `/guild join` to join an existing one.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    const embed = new EmbedBuilder()
        .setTitle('🎁 Guild Rewards')
        .setDescription(`Rewards for **${userGuild.guildName}**`)
        .setColor('#9B59B6')
        .setTimestamp();

    // Get pending rewards (current ranking)
    const pending = await getPendingRewards(userGuild.guildId);

    if (pending.seasonRank) {
        const seasonReward = pending.seasonReward;
        let rewardText = `**Rank ${pending.seasonRank}** (Top 10!)\n\n`;
        rewardText += `💰 Treasury Bonus: $${seasonReward.money.toLocaleString()}\n`;
        rewardText += `⭐ Contribution Points: ${seasonReward.contributionPoints} per member\n`;

        if (seasonReward.shopItem) {
            rewardText += `🎁 Free Item: ${seasonReward.shopItem}\n`;
        }
        if (seasonReward.badge) {
            rewardText += `🏅 Badge: ${seasonReward.badge}\n`;
        }

        embed.addFields({
            name: '📅 Season-End Reward (Pending)',
            value: rewardText,
            inline: false
        });
    } else {
        embed.addFields({
            name: '📅 Season-End Reward (Pending)',
            value: 'Not currently in top 10. Keep earning XP!',
            inline: false
        });
    }

    if (pending.weeklyRank) {
        const weeklyReward = pending.weeklyReward;
        let rewardText = `**Rank ${pending.weeklyRank}** (Top 5!)\n\n`;
        rewardText += `💰 Treasury Bonus: $${weeklyReward.money.toLocaleString()}\n`;
        rewardText += `⭐ Contribution Points: ${weeklyReward.contributionPoints} per member\n`;

        if (weeklyReward.badge) {
            rewardText += `🏅 Badge: ${weeklyReward.badge}\n`;
        }

        embed.addFields({
            name: '🗓️ Weekly Reward (Pending)',
            value: rewardText,
            inline: false
        });
    } else {
        embed.addFields({
            name: '🗓️ Weekly Reward (Pending)',
            value: 'Not currently in top 5. Keep earning XP!',
            inline: false
        });
    }

    // Get reward history
    const history = await getGuildRewardHistory(userGuild.guildId, 5);

    if (history.length > 0) {
        let historyText = '';
        for (const reward of history) {
            const data = typeof reward.rewardData === 'string'
                ? JSON.parse(reward.rewardData)
                : reward.rewardData;

            const timestamp = new Date(reward.createdAt);
            const dateStr = timestamp.toLocaleDateString();

            historyText += `**${reward.reason}** (${dateStr})\n`;
            historyText += `└ $${data.money?.toLocaleString() || 0}`;

            if (data.contributionPoints) {
                historyText += `, ${data.contributionPoints} CP`;
            }
            historyText += `\n\n`;
        }

        embed.addFields({
            name: '📜 Recent Rewards (Last 5)',
            value: historyText,
            inline: false
        });
    }

    embed.setFooter({ text: 'Rewards are distributed automatically every Sunday (weekly) and at season end.' });

    await interaction.reply({ embeds: [embed] });
}

/**
 * Show reward tiers
 */
async function showRewardTiers(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('🏆 Guild Reward Tiers')
        .setDescription('Earn rewards by ranking in the top guilds!')
        .setColor('#FFD700')
        .setTimestamp();

    // Season rewards
    let seasonText = '';
    for (let rank = 1; rank <= 10; rank++) {
        const rewards = SEASON_REWARDS[rank];
        if (!rewards) continue;

        let medal = '';
        if (rank === 1) medal = '🥇';
        else if (rank === 2) medal = '🥈';
        else if (rank === 3) medal = '🥉';
        else medal = `**${rank}.**`;

        seasonText += `${medal} $${rewards.money.toLocaleString()} + ${rewards.contributionPoints} CP`;

        if (rewards.shopItem) {
            seasonText += ` + ${rewards.shopItem}`;
        }
        if (rewards.badge) {
            seasonText += `\n    ${rewards.badge}`;
        }
        seasonText += `\n`;
    }

    embed.addFields({
        name: '📅 Season-End Rewards (Top 10 Guilds)',
        value: seasonText,
        inline: false
    });

    // Weekly rewards
    let weeklyText = '';
    for (let rank = 1; rank <= 5; rank++) {
        const rewards = WEEKLY_REWARDS[rank];
        if (!rewards) continue;

        let medal = '';
        if (rank === 1) medal = '🥇';
        else if (rank === 2) medal = '🥈';
        else if (rank === 3) medal = '🥉';
        else medal = `**${rank}.**`;

        weeklyText += `${medal} $${rewards.money.toLocaleString()} + ${rewards.contributionPoints} CP`;

        if (rewards.badge) {
            weeklyText += `\n    ${rewards.badge}`;
        }
        weeklyText += `\n`;
    }

    embed.addFields({
        name: '🗓️ Weekly Rewards (Top 5 Guilds)',
        value: weeklyText,
        inline: false
    });

    embed.addFields({
        name: '📝 Notes',
        value: '• **CP** = Contribution Points (distributed to all guild members)\n• Rewards are deposited directly into guild treasury\n• Weekly rewards distributed every Sunday\n• Season rewards distributed at season end',
        inline: false
    });

    await interaction.reply({ embeds: [embed] });
}
