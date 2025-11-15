const { EmbedBuilder } = require('discord.js');
const { getUserData, getAllUserData } = require('../data');
const { createErrorEmbed, createInfoEmbed } = require('./utilityEmbeds');

// Leaderboard Embeds
async function createLeaderboardEmbed(client) {
    const userData = await getAllUserData() || {}; // Ensure userData is an object

    const sortedUsers = Object.entries(userData)
        .filter(([_, data]) => data && typeof data === 'object' && 'money' in data)
        .map(([userId, data]) => ({ userId, money: Number(data.money) || 0 }))
        .sort((a, b) => b.money - a.money);

    const embed = new EmbedBuilder()
        .setTitle('🏆 Blackjack Leaderboard')
        .setColor('#FFD700')
        .setTimestamp();

    if (sortedUsers.length === 0) {
        embed.setDescription('No players have registered yet!');
        return embed;
    }

    let leaderboardText = '';
    for (let i = 0; i < Math.min(sortedUsers.length, 10); i++) {
        const { userId, money } = sortedUsers[i];
        let username = 'Unknown User';

        try {
            const user = await client.users.fetch(userId);
            username = user.tag;
        } catch (error) {
            console.error(`Error fetching user ${userId}:`, error);
        }

        leaderboardText += `${i + 1}. **${username}**: ${money.toLocaleString()}\n`;
    }

    if (sortedUsers.length > 10) {
        leaderboardText += `\n...and ${sortedUsers.length - 10} more players!`;
    }

    embed.setDescription(leaderboardText);
    return embed;
}

// Stats Embeds
async function createStatsEmbed(targetUser, client) {
    const { calculate7DayTrend, calculatePerGameStats, calculateServerAverages, getTrendEmoji, formatROI, getRankText } = require('../statisticsCalculator');

    const userData = await getUserData(targetUser.id);

    if (!userData) {
        return createErrorEmbed('No Data', 'No statistics found for this user.');
    }

    const stats = userData.statistics;
    const gameHistory = userData.gameHistory || [];

    // Calculate enhanced statistics
    const weekTrend = calculate7DayTrend(gameHistory);
    const perGameStats = calculatePerGameStats(stats, gameHistory);
    const allUserData = await getAllUserData();
    const serverAvg = calculateServerAverages(allUserData);

    // Calculate overall metrics
    const winRate = stats.gamesPlayed > 0 ? ((stats.gamesWon / stats.gamesPlayed) * 100).toFixed(1) : 0;
    const profitLoss = stats.totalWinnings - stats.totalWagered;
    const roi = stats.totalWagered > 0 ? ((profitLoss / stats.totalWagered) * 100).toFixed(1) : 0;

    const embed = new EmbedBuilder()
        .setTitle(`📊 ${targetUser.username}'s Casino Statistics`)
        .setColor('#0099FF')
        .setThumbnail(targetUser.displayAvatarURL())
        .setDescription(
            `**Overall Performance**\n` +
            `🎮 Games: ${(stats.gamesPlayed || 0).toLocaleString()} | ` +
            `🏆 Won: ${(stats.gamesWon || 0).toLocaleString()} (${winRate}%)\n` +
            `💰 Wagered: $${(stats.totalWagered || 0).toLocaleString()} | ` +
            `💵 Winnings: $${(stats.totalWinnings || 0).toLocaleString()}\n` +
            `📊 Net P/L: ${profitLoss >= 0 ? '+' : ''}$${(profitLoss || 0).toLocaleString()} | ` +
            `📈 ROI: ${formatROI(roi)}\n` +
            `💳 Balance: $${(userData.money || 0).toLocaleString()} | ` +
            `🌟 Best Win: $${(stats.biggestWin || 0).toLocaleString()}`
        );

    // 7-Day Performance Trend
    if (weekTrend.totalGames > 0) {
        embed.addFields({
            name: `${getTrendEmoji(weekTrend.trend)} Last 7 Days Performance`,
            value: `🎮 ${weekTrend.totalGames} games | ` +
                   `🏆 ${weekTrend.wins}W-${weekTrend.losses}L (${weekTrend.winRate}%)\n` +
                   `💰 Net: ${weekTrend.netProfit >= 0 ? '+' : ''}$${weekTrend.netProfit.toLocaleString()} ${getTrendEmoji(weekTrend.trend)}`,
            inline: false
        });
    }

    // Per-Game Performance (Top 5 most played)
    if (perGameStats.length > 0) {
        const topGames = perGameStats.slice(0, 5);
        let perGameText = '';
        for (const game of topGames) {
            perGameText += `**${game.name}**: ${game.gamesPlayed} games | ` +
                          `${game.winRate}% WR | ROI: ${formatROI(game.roi)}\n` +
                          `  Net: ${game.netProfit >= 0 ? '+' : ''}$${game.netProfit.toLocaleString()}\n`;
        }
        embed.addFields({
            name: '🎯 Top Games (By Activity)',
            value: perGameText || 'No games played yet',
            inline: false
        });
    }

    // Server Comparison
    if (serverAvg.avgGamesPlayed > 0) {
        const balanceRank = getRankText(userData.money || 0, serverAvg.avgBalance);
        const gamesRank = getRankText(stats.gamesPlayed || 0, serverAvg.avgGamesPlayed);

        embed.addFields({
            name: '🌍 Server Comparison',
            value: `💰 Balance: $${(userData.money || 0).toLocaleString()} vs avg $${serverAvg.avgBalance.toLocaleString()} ${balanceRank}\n` +
                   `🎮 Games: ${(stats.gamesPlayed || 0).toLocaleString()} vs avg ${serverAvg.avgGamesPlayed} ${gamesRank}\n` +
                   `📊 Win Rate: ${winRate}% vs avg ${serverAvg.avgWinRate}% | ROI: ${roi}% vs avg ${serverAvg.avgROI}%`,
            inline: false
        });
    }

    // Quick Stats Grid
    embed.addFields(
        { name: '🃏 Blackjack', value: `${(stats.handsPlayed || 0).toLocaleString()} hands\n⚡ ${(stats.blackjacks || 0)} blackjacks`, inline: true },
        { name: '🎰 Slots', value: `${(stats.slotsSpins || 0).toLocaleString()} spins\n${(stats.slotsWins || 0)} wins`, inline: true },
        { name: '🎲 Roulette', value: `${(stats.rouletteSpins || 0).toLocaleString()} spins\n${(stats.rouletteWins || 0)} wins`, inline: true }
    );

    embed.setFooter({ text: 'Use /stats progression for achievements & challenges' });
    embed.setTimestamp();

    return embed;
}

// Economy Stats Embeds
async function createEconomyStatsEmbed(targetUser, client) {
    const { getUserProperties } = require('../properties');
    const { getUserVIPTier } = require('../vip');

    const userData = await getUserData(targetUser.id);

    if (!userData) {
        return createErrorEmbed('No Data', 'No statistics found for this user.');
    }

    const stats = userData.statistics;
    const properties = await getUserProperties(targetUser.id);
    const vipTier = await getUserVIPTier(targetUser.id);

    // Calculate property values
    let totalDailyIncome = 0;
    let totalDailyMaintenance = 0;
    for (const prop of properties) {
        totalDailyIncome += prop.dailyIncome;
        totalDailyMaintenance += prop.dailyMaintenance;
    }
    const netDailyIncome = totalDailyIncome - totalDailyMaintenance;

    const embed = new EmbedBuilder()
        .setTitle(`💼 ${targetUser.username}'s Economy Stats`)
        .setColor('#00D9FF')
        .setThumbnail(targetUser.displayAvatarURL())
        .setDescription(
            `**Financial Overview**\n` +
            `💳 Current Balance: $${(userData.money || 0).toLocaleString()}\n` +
            `📊 Net Worth: $${((userData.money || 0) + (stats.totalPropertyValue || 0)).toLocaleString()}\n` +
            `⚖️ Credit Score: ${userData.creditScore || 500}/1000`
        )
        .addFields(
            {
                name: '🏢 Properties',
                value: `Owned: ${stats.totalPropertiesOwned || 0}\n` +
                       `Portfolio Value: $${(stats.totalPropertyValue || 0).toLocaleString()}\n` +
                       `Total Income Collected: $${(stats.totalPropertyIncomeCollected || 0).toLocaleString()}\n` +
                       `Daily Net Income: $${netDailyIncome.toLocaleString()}/day`,
                inline: true
            },
            {
                name: '💼 Work',
                value: `Sessions: ${stats.totalWorkSessions || 0}\n` +
                       `Total Earned: $${(stats.totalWorkEarnings || 0).toLocaleString()}\n` +
                       `Avg per Session: $${stats.totalWorkSessions > 0 ? Math.floor((stats.totalWorkEarnings || 0) / stats.totalWorkSessions).toLocaleString() : '0'}`,
                inline: true
            },
            {
                name: '🏪 Shopping',
                value: `Items Purchased: ${stats.totalItemsPurchased || 0}\n` +
                       `Boosts Used: ${stats.totalBoostsUsed || 0}\n` +
                       `Total Spent: $${(stats.totalSpentOnShop || 0).toLocaleString()}`,
                inline: true
            },
            {
                name: '✨ VIP Status',
                value: vipTier
                    ? `${vipTier.emoji} **${vipTier.name}**\n` +
                      `Work Bonus: +${vipTier.perks.workBonus * 100}%\n` +
                      `Daily Bonus: $${vipTier.perks.dailyBonus.toLocaleString()}`
                    : 'No VIP Membership\nUse `/vip shop` to upgrade!',
                inline: true
            },
            {
                name: '💸 Loans',
                value: userData.activeLoan
                    ? `Active Loan: $${(userData.activeLoan.totalOwed - userData.activeLoan.amountPaid).toLocaleString()}\n` +
                      `Loans Taken: ${userData.loanHistory?.length || 0}`
                    : `No Active Loan\nLoans Taken: ${userData.loanHistory?.length || 0}`,
                inline: true
            },
            {
                name: '🎁 Gifts',
                value: `Sent: ${userData.giftsSent || 0} ($${(userData.totalGiftsSent || 0).toLocaleString()})\n` +
                       `Received: ${userData.giftsReceived || 0} ($${(userData.totalGiftsReceived || 0).toLocaleString()})`,
                inline: true
            }
        )
        .setTimestamp();

    return embed;
}

// Heist Stats Embeds
async function createHeistStatsEmbed(targetUser, client) {
    const { getUserHeistStats, getHeistDebt, isGamblingBanned } = require('../../database/queries');

    const userData = await getUserData(targetUser.id);
    const heistData = await getUserHeistStats(targetUser.id);
    const heistDebt = await getHeistDebt(targetUser.id);

    if (!userData || !heistData) {
        return createErrorEmbed('No Data', 'No heist statistics found for this user.');
    }

    const stats = userData.statistics;
    const soloSuccessRate = heistData.totalHeists > 0
        ? ((heistData.successfulHeists / heistData.totalHeists) * 100).toFixed(1)
        : '0.0';

    const guildSuccessRate = stats.guildHeistsParticipated > 0
        ? ((stats.guildHeistsWon / stats.guildHeistsParticipated) * 100).toFixed(1)
        : '0.0';

    const netProfit = (heistData.totalEarned || 0) - (heistData.totalLost || 0);
    const isBanned = await isGamblingBanned(targetUser.id);
    const banCheck = { isBanned, reason: isBanned ? '🚫 You are currently banned from gambling.' : '' };

    const embed = new EmbedBuilder()
        .setTitle(`🎭 ${targetUser.username}'s Heist Stats`)
        .setColor(banCheck.isBanned ? '#FF0000' : '#FF6600')
        .setThumbnail(targetUser.displayAvatarURL())
        .setDescription(
            banCheck.isBanned
                ? `🚫 **CURRENTLY GAMBLING BANNED**\n${banCheck.reason}\n\n`
                : `**Heist Overview**\n`
        )
        .addFields(
            {
                name: '🎭 Solo Heists',
                value: `Total Attempts: ${heistData.totalHeists || 0}\n` +
                       `Successful: ${heistData.successfulHeists || 0} (${soloSuccessRate}%)\n` +
                       `Failed: ${(heistData.totalHeists || 0) - (heistData.successfulHeists || 0)}\n` +
                       `Biggest Score: $${(heistData.biggestScore || 0).toLocaleString()}`,
                inline: true
            },
            {
                name: '👥 Guild Heists',
                value: `Participated: ${stats.guildHeistsParticipated || 0}\n` +
                       `Won: ${stats.guildHeistsWon || 0} (${guildSuccessRate}%)\n` +
                       `Failed: ${(stats.guildHeistsParticipated || 0) - (stats.guildHeistsWon || 0)}`,
                inline: true
            },
            {
                name: '💰 Earnings',
                value: `Total Earned: $${(heistData.totalEarned || 0).toLocaleString()}\n` +
                       `Total Lost: $${(heistData.totalLost || 0).toLocaleString()}\n` +
                       `Net Profit: ${netProfit >= 0 ? '+' : ''}$${netProfit.toLocaleString()}`,
                inline: true
            },
            {
                name: '📊 Overall Stats',
                value: `Combined Heists: ${(heistData.totalHeists || 0) + (stats.guildHeistsParticipated || 0)}\n` +
                       `Combined Success: ${(heistData.successfulHeists || 0) + (stats.guildHeistsWon || 0)}\n` +
                       `Heist Debt: $${(heistDebt || 0).toLocaleString()}`,
                inline: false
            }
        )
        .setTimestamp();

    // Add cooldown info if applicable
    const now = Date.now();
    if (heistData.cooldownUntil > now) {
        const timeLeft = heistData.cooldownUntil - now;
        const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
        const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

        embed.setFooter({ text: `Next heist available in: ${hoursLeft}h ${minutesLeft}m` });
    } else {
        embed.setFooter({ text: 'Ready for another heist!' });
    }

    return embed;
}

// Progression Stats Embeds
async function createProgressionStatsEmbed(targetUser, client) {
    const { getUserAchievements } = require('../achievements');
    const { getUserChallenges } = require('../challenges');

    const userData = await getUserData(targetUser.id);

    if (!userData) {
        return createErrorEmbed('No Data', 'No progression data found for this user.');
    }

    const stats = userData.statistics;
    const achievements = await getUserAchievements(targetUser.id);
    const challenges = await getUserChallenges(targetUser.id);

    // Calculate challenge completion
    const dailyCompleted = challenges?.daily.filter(c => c.progress >= c.target).length || 0;
    const weeklyCompleted = challenges?.weekly.filter(c => c.progress >= c.target).length || 0;

    const embed = new EmbedBuilder()
        .setTitle(`🏆 ${targetUser.username}'s Progression`)
        .setColor('#FFD700')
        .setThumbnail(targetUser.displayAvatarURL())
        .setDescription(`**Achievement & Challenge Progress**`)
        .addFields(
            {
                name: '🏅 Achievements',
                value: `Unlocked: ${achievements?.unlocked.length || 0}/${Object.keys(achievements?.unlocked || {}).length + (achievements?.locked.length || 0)}\n` +
                       `Total Unlocked: ${stats.totalAchievementsUnlocked || 0}\n` +
                       `Completion: ${achievements?.unlocked.length > 0 ? ((achievements.unlocked.length / (achievements.unlocked.length + achievements.locked.length)) * 100).toFixed(1) : '0'}%`,
                inline: true
            },
            {
                name: '🎯 Challenges',
                value: `Daily: ${dailyCompleted}/${challenges?.daily.length || 0} completed\n` +
                       `Weekly: ${weeklyCompleted}/${challenges?.weekly.length || 0} completed\n` +
                       `Total Completed: ${stats.totalChallengesCompleted || 0}`,
                inline: true
            },
            {
                name: '💎 Rewards Earned',
                value: `Challenge Rewards: $${(stats.totalChallengeRewardsEarned || 0).toLocaleString()}\n` +
                       `Achievement Points: ${(achievements?.totalPoints || 0).toLocaleString()}`,
                inline: true
            }
        )
        .setTimestamp();

    // Show recent achievements
    if (achievements && achievements.unlocked.length > 0) {
        const recentAchievements = achievements.unlocked
            .sort((a, b) => (b.unlockedAt || 0) - (a.unlockedAt || 0))
            .slice(0, 3)
            .map(a => `${a.emoji} **${a.name}**`)
            .join('\n');

        embed.addFields({
            name: '⭐ Recent Achievements',
            value: recentAchievements || 'None yet',
            inline: false
        });
    }

    embed.setFooter({ text: 'Use /achievements and /challenges for details' });

    return embed;
}

// Guild Stats Embeds
async function createGuildStatsEmbed(targetUser, client) {
    const { getUserGuild, getGuildInfo } = require('../guilds');

    const userData = await getUserData(targetUser.id);
    const userGuild = await getUserGuild(targetUser.id);

    if (!userData) {
        return createErrorEmbed('No Data', 'No guild statistics found for this user.');
    }

    const stats = userData.statistics;

    if (!userGuild) {
        return createInfoEmbed(
            '🏰 No Guild',
            `**${targetUser.username}** is not in a guild!\n\n` +
            `Use \`/guild create\` to start your own guild, or\n` +
            `Use \`/guild join\` to join an existing guild.`
        );
    }

    // Get full guild info with members
    const guild = await getGuildInfo(userGuild.guildName);

    if (!guild) {
        return createErrorEmbed('Error', 'Failed to load guild information.');
    }

    const isOwner = guild.ownerId === targetUser.id;
    const memberCount = guild.members ? guild.members.length : 0;

    // Get user's member data
    const memberData = guild.members ? guild.members.find(m => m.userId === targetUser.id) : null;
    const joinedDate = memberData ? new Date(memberData.joinedAt) : null;
    const daysInGuild = joinedDate ? Math.floor((Date.now() - joinedDate.getTime()) / (24 * 60 * 60 * 1000)) : 0;

    const embed = new EmbedBuilder()
        .setTitle(`🏰 ${targetUser.username}'s Guild Stats`)
        .setColor('#9B59B6')
        .setThumbnail(targetUser.displayAvatarURL())
        .setDescription(`**Guild: ${guild.name}**\n${isOwner ? '👑 Owner' : '👤 Member'}`)
        .addFields(
            {
                name: '📊 Guild Info',
                value: `Members: ${memberCount}/10\n` +
                       `Treasury: $${guild.treasury.toLocaleString()}\n` +
                       `Created: ${new Date(guild.createdAt).toLocaleDateString()}`,
                inline: true
            },
            {
                name: '🎭 Your Contributions',
                value: `Total Donated: $${(userGuild.contributedTotal || 0).toLocaleString()}\n` +
                       `Guild Stats: $${(stats.totalGuildContributions || 0).toLocaleString()}\n` +
                       `Days in Guild: ${daysInGuild}`,
                inline: true
            },
            {
                name: '🏴‍☠️ Guild Heists',
                value: `Participated: ${stats.guildHeistsParticipated || 0}\n` +
                       `Won: ${stats.guildHeistsWon || 0}\n` +
                       `Success Rate: ${stats.guildHeistsParticipated > 0 ? ((stats.guildHeistsWon / stats.guildHeistsParticipated) * 100).toFixed(1) : '0'}%`,
                inline: true
            }
        )
        .setTimestamp();

    // Check if guild heist is on cooldown
    if (userData.guild?.guildHeistData) {
        const now = Date.now();
        const cooldownUntil = userData.guild.guildHeistData.cooldownUntil;

        if (cooldownUntil > now) {
            const timeLeft = cooldownUntil - now;
            const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
            const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

            embed.setFooter({ text: `Next guild heist in: ${hoursLeft}h ${minutesLeft}m` });
        } else {
            embed.setFooter({ text: 'Guild heist available! Use /guildheist' });
        }
    }

    return embed;
}

// History Embeds
async function createHistoryEmbed(user, gamesToShow = 10) {
    const userData = await getUserData(user.id);

    if (!userData || !userData.gameHistory || userData.gameHistory.length === 0) {
        return createInfoEmbed('No History', 'You have no game history yet! Play some games first.');
    }

    const history = userData.gameHistory.slice(0, gamesToShow);

    const embed = new EmbedBuilder()
        .setTitle(`📜 Your Recent Game History (Last ${history.length} games)`)
        .setColor('#FFD700')
        .setThumbnail(user.displayAvatarURL());

    let historyText = '';
    for (const game of history) {
        const date = new Date(game.timestamp).toLocaleDateString();
        const resultEmoji = game.result === 'win' || game.result === 'blackjack' ? '🟢' :
            game.result === 'push' ? '🟡' : '🔴';
        const resultText = game.result === 'blackjack' ? 'BLACKJACK!' : game.result.toUpperCase();

        historyText += `${resultEmoji} **${resultText}** - ${game.gameType.toUpperCase()}: Bet ${game.bet.toLocaleString()}, `;
        historyText += `${game.winnings >= 0 ? 'Won' : 'Lost'}: ${Math.abs(game.winnings).toLocaleString()} `;
        historyText += `(${date})\n`;
    }

    embed.setDescription(historyText);
    return embed;
}

module.exports = {
    createLeaderboardEmbed,
    createStatsEmbed,
    createEconomyStatsEmbed,
    createHeistStatsEmbed,
    createProgressionStatsEmbed,
    createGuildStatsEmbed,
    createHistoryEmbed
};
