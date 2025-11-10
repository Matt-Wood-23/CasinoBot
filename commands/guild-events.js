const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getUserGuild } = require('../utils/guilds');
const { getActiveEvents, getEventLeaderboard, getEventTypeEmoji, formatTimeRemaining } = require('../utils/guildEvents');
const { getCurrentBossRaid, getBossRaidStatus, getPlayerDamageLeaderboard } = require('../utils/bossRaid');
const { getCurrentCasinoDomination, getCasinoDominationLeaderboard, getPlayerWinningsLeaderboard, getEventStatistics: getCasinoStats } = require('../utils/casinoDomination');
const { getCurrentHeistFestival, getHeistFestivalLeaderboard, getPlayerHeistLeaderboard, getEventStatistics: getHeistStats } = require('../utils/heistFestival');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('guild-events')
        .setDescription('View active guild events and leaderboards')
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all active guild events')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('boss-raid')
                .setDescription('View Boss Raid event status and leaderboard')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('casino-domination')
                .setDescription('View Casino Domination leaderboard')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('heist-festival')
                .setDescription('View Heist Festival leaderboard')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        try {
            // Check if user is in a guild
            const userGuild = await getUserGuild(interaction.user.id);
            if (!userGuild) {
                return interaction.reply({
                    content: '❌ You must be in a guild to participate in events!\n\nUse `/guild create` to start your own guild or `/guild join` to join an existing one.',
                    flags: [MessageFlags.Ephemeral]
                });
            }

            if (subcommand === 'list') {
                await listActiveEvents(interaction);
            } else if (subcommand === 'boss-raid') {
                await showBossRaidEvent(interaction, userGuild);
            } else if (subcommand === 'casino-domination') {
                await showCasinoDominationEvent(interaction, userGuild);
            } else if (subcommand === 'heist-festival') {
                await showHeistFestivalEvent(interaction, userGuild);
            }

        } catch (error) {
            console.error('Error in guild-events command:', error);
            return interaction.reply({
                content: '❌ An error occurred while fetching event data.',
                flags: [MessageFlags.Ephemeral]
            });
        }
    }
};

/**
 * List all active events
 */
async function listActiveEvents(interaction) {
    const activeEvents = await getActiveEvents();

    if (activeEvents.length === 0) {
        return interaction.reply({
            content: '📅 No active guild events right now. Check back later!',
            flags: [MessageFlags.Ephemeral]
        });
    }

    const embed = new EmbedBuilder()
        .setTitle('📅 Active Guild Events')
        .setDescription('Participate in events to earn rewards for your guild!')
        .setColor('#FFD700')
        .setTimestamp();

    for (const event of activeEvents) {
        const emoji = getEventTypeEmoji(event.eventType);
        const timeLeft = formatTimeRemaining(event.endTime);

        embed.addFields({
            name: `${emoji} ${event.eventName}`,
            value: `${event.description}\n\n⏰ **Time Remaining:** ${timeLeft}\n📊 View details: \`/guild-events ${event.eventType.replace('_', '-')}\``,
            inline: false
        });
    }

    embed.setFooter({ text: 'Play games and complete activities to contribute to your guild!' });

    await interaction.reply({ embeds: [embed] });
}

/**
 * Show Boss Raid event
 */
async function showBossRaidEvent(interaction, userGuild) {
    const bossData = await getCurrentBossRaid();

    if (!bossData || !bossData.event) {
        return interaction.reply({
            content: '❌ No active Boss Raid event right now.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    const { event, boss } = bossData;
    const status = await getBossRaidStatus(event.id);

    const embed = new EmbedBuilder()
        .setTitle(`${boss.bossName} Boss Raid`)
        .setDescription(event.description)
        .setColor(boss.isDefeated ? '#00FF00' : '#FF0000')
        .setTimestamp();

    // Boss HP
    embed.addFields({
        name: '❤️ Boss Health',
        value: status.hpBar + `\n**${boss.bossHpCurrent.toLocaleString()} / ${boss.bossHpMax.toLocaleString()} HP**`,
        inline: false
    });

    // Event info
    const timeLeft = formatTimeRemaining(event.endTime);
    embed.addFields({
        name: '📊 Event Info',
        value: `⏰ **Time Remaining:** ${timeLeft}\n🏆 **Boss Level:** ${boss.bossLevel}\n💰 **Reward Multiplier:** ${boss.rewardMultiplier}x`,
        inline: false
    });

    // Guild leaderboard
    const leaderboard = await getEventLeaderboard(event.id, 5);
    if (leaderboard.length > 0) {
        let leaderboardText = '';
        for (let i = 0; i < leaderboard.length; i++) {
            const entry = leaderboard[i];
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            leaderboardText += `${medal} **${entry.guildName}** - ${entry.score.toLocaleString()} damage\n`;
        }

        embed.addFields({
            name: '🏆 Top Guilds (Damage Dealt)',
            value: leaderboardText,
            inline: false
        });
    }

    // Player leaderboard for user's guild
    const playerLeaderboard = await getPlayerDamageLeaderboard(event.id, userGuild.guildId, 5);
    if (playerLeaderboard.length > 0) {
        let playerText = '';
        for (let i = 0; i < playerLeaderboard.length; i++) {
            const entry = playerLeaderboard[i];
            const medal = i === 0 ? '👑' : `${i + 1}.`;
            playerText += `${medal} <@${entry.discordId}> - ${entry.contributionAmount.toLocaleString()} damage\n`;
        }

        embed.addFields({
            name: `⚔️ Top Damage Dealers (Your Guild)`,
            value: playerText,
            inline: false
        });
    }

    // Status
    if (boss.isDefeated) {
        embed.addFields({
            name: '🎉 STATUS',
            value: '**BOSS DEFEATED!** Rewards will be distributed when the event ends.',
            inline: false
        });
    } else {
        embed.addFields({
            name: '⚔️ HOW TO PARTICIPATE',
            value: 'Play any casino game to deal damage to the boss! Higher wagers deal more damage.',
            inline: false
        });
    }

    await interaction.reply({ embeds: [embed] });
}

/**
 * Show Casino Domination event
 */
async function showCasinoDominationEvent(interaction, userGuild) {
    const event = await getCurrentCasinoDomination();

    if (!event) {
        return interaction.reply({
            content: '❌ No active Casino Domination event right now.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    const embed = new EmbedBuilder()
        .setTitle('🎰 Casino Domination Competition')
        .setDescription(event.description)
        .setColor('#FFD700')
        .setTimestamp();

    // Event info
    const timeLeft = formatTimeRemaining(event.endTime);
    const stats = await getCasinoStats(event.id);

    embed.addFields({
        name: '📊 Event Info',
        value: `⏰ **Time Remaining:** ${timeLeft}\n💰 **Reward Pool:** $${event.rewardPool.toLocaleString()}\n🎮 **Participating Guilds:** ${stats.totalGuilds}\n💵 **Total Winnings:** $${stats.totalWinningsAll?.toLocaleString() || 0}`,
        inline: false
    });

    // Guild leaderboard
    const leaderboard = await getCasinoDominationLeaderboard(event.id, 10);
    if (leaderboard.length > 0) {
        let leaderboardText = '';
        for (let i = 0; i < leaderboard.length; i++) {
            const entry = leaderboard[i];
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            leaderboardText += `${medal} **${entry.guildName}** - $${entry.totalWinnings.toLocaleString()} (${entry.gamesPlayed} games)\n`;
        }

        embed.addFields({
            name: '🏆 Top Guilds (Total Winnings)',
            value: leaderboardText,
            inline: false
        });
    }

    // Player leaderboard for user's guild
    const playerLeaderboard = await getPlayerWinningsLeaderboard(event.id, userGuild.guildId, 5);
    if (playerLeaderboard.length > 0) {
        let playerText = '';
        for (let i = 0; i < playerLeaderboard.length; i++) {
            const entry = playerLeaderboard[i];
            const medal = i === 0 ? '👑' : `${i + 1}.`;
            playerText += `${medal} <@${entry.discordId}> - $${entry.contributionAmount.toLocaleString()}\n`;
        }

        embed.addFields({
            name: `💰 Top Earners (Your Guild)`,
            value: playerText,
            inline: false
        });
    }

    embed.addFields({
        name: '🎰 HOW TO PARTICIPATE',
        value: 'Win casino games to earn points for your guild! Only your winnings count towards the leaderboard.',
        inline: false
    });

    await interaction.reply({ embeds: [embed] });
}

/**
 * Show Heist Festival event
 */
async function showHeistFestivalEvent(interaction, userGuild) {
    const event = await getCurrentHeistFestival();

    if (!event) {
        return interaction.reply({
            content: '❌ No active Heist Festival event right now.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    const { FESTIVAL_BONUSES } = require('../utils/heistFestival');

    const embed = new EmbedBuilder()
        .setTitle('💰 Heist Festival Weekend')
        .setDescription(event.description)
        .setColor('#9B59B6')
        .setTimestamp();

    // Event info
    const timeLeft = formatTimeRemaining(event.endTime);
    const stats = await getHeistStats(event.id);

    embed.addFields({
        name: '📊 Event Info',
        value: `⏰ **Time Remaining:** ${timeLeft}\n🎮 **Participating Guilds:** ${stats.totalGuilds}\n🏴‍☠️ **Total Heists:** ${stats.totalHeistsAll || 0}\n✅ **Success Rate:** ${stats.overallSuccessRate || '0.0%'}`,
        inline: false
    });

    // Bonuses
    embed.addFields({
        name: '🎁 Active Bonuses',
        value: `• **${FESTIVAL_BONUSES.xpMultiplier}x Guild XP** for heists\n• **${FESTIVAL_BONUSES.winningsMultiplier}x Winnings** on successful heists\n• **${FESTIVAL_BONUSES.failurePenaltyReduction * 100}% Reduced** failure penalties\n• **${FESTIVAL_BONUSES.contributionPoints} Contribution Points** per heist`,
        inline: false
    });

    // Guild leaderboard
    const leaderboard = await getHeistFestivalLeaderboard(event.id, 10);
    if (leaderboard.length > 0) {
        let leaderboardText = '';
        for (let i = 0; i < leaderboard.length; i++) {
            const entry = leaderboard[i];
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            const successRate = entry.heistsCompleted > 0
                ? ((entry.heistsSuccessful / entry.heistsCompleted) * 100).toFixed(1)
                : '0.0';
            leaderboardText += `${medal} **${entry.guildName}** - ${entry.heistsCompleted} heists (${successRate}% success)\n`;
        }

        embed.addFields({
            name: '🏆 Top Guilds (Heists Completed)',
            value: leaderboardText,
            inline: false
        });
    }

    // Player leaderboard for user's guild
    const playerLeaderboard = await getPlayerHeistLeaderboard(event.id, userGuild.guildId, 5);
    if (playerLeaderboard.length > 0) {
        let playerText = '';
        for (let i = 0; i < playerLeaderboard.length; i++) {
            const entry = playerLeaderboard[i];
            const medal = i === 0 ? '👑' : `${i + 1}.`;
            playerText += `${medal} <@${entry.discordId}> - ${entry.participationCount} heists\n`;
        }

        embed.addFields({
            name: `🏴‍☠️ Top Heisters (Your Guild)`,
            value: playerText,
            inline: false
        });
    }

    embed.addFields({
        name: '💰 HOW TO PARTICIPATE',
        value: 'Use `/heist` to participate in guild heists during the festival! Earn bonus rewards and reduced penalties.',
        inline: false
    });

    await interaction.reply({ embeds: [embed] });
}
