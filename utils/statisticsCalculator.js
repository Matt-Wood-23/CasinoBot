/**
 * Statistics Calculator
 * Helper functions for calculating advanced statistics
 */

/**
 * Calculate 7-day win trend from game history
 * @param {Array} gameHistory - User's game history
 * @returns {Object} - Trend data with wins, losses, and trend direction
 */
function calculate7DayTrend(gameHistory) {
    if (!gameHistory || gameHistory.length === 0) {
        return {
            totalGames: 0,
            wins: 0,
            losses: 0,
            winRate: 0,
            netProfit: 0,
            trend: 'neutral'
        };
    }

    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const recentGames = gameHistory.filter(game => game.timestamp >= sevenDaysAgo);

    if (recentGames.length === 0) {
        return {
            totalGames: 0,
            wins: 0,
            losses: 0,
            winRate: 0,
            netProfit: 0,
            trend: 'neutral'
        };
    }

    let wins = 0;
    let losses = 0;
    let netProfit = 0;

    for (const game of recentGames) {
        if (game.result === 'win' || game.result === 'blackjack') {
            wins++;
        } else if (game.result === 'lose') {
            losses++;
        }

        // Calculate net profit (winnings - bet)
        netProfit += (game.winnings - game.bet);
    }

    const winRate = recentGames.length > 0 ? (wins / recentGames.length) * 100 : 0;

    // Determine trend
    let trend = 'neutral';
    if (netProfit > 0) {
        trend = 'up';
    } else if (netProfit < 0) {
        trend = 'down';
    }

    return {
        totalGames: recentGames.length,
        wins,
        losses,
        winRate: winRate.toFixed(1),
        netProfit,
        trend
    };
}

/**
 * Calculate per-game statistics (profit/loss, ROI)
 * @param {Object} stats - User statistics object
 * @param {Array} gameHistory - User's game history
 * @returns {Object} - Per-game stats breakdown
 */
function calculatePerGameStats(stats, gameHistory) {
    const gameTypes = [
        { key: 'slots', name: 'Slots', wageredKey: 'slotsSpins', winsKey: 'slotsWins' },
        { key: 'blackjack', name: 'Blackjack', wageredKey: 'handsPlayed', winsKey: 'gamesWon' },
        { key: 'roulette', name: 'Roulette', wageredKey: 'rouletteSpins', winsKey: 'rouletteWins' },
        { key: 'three_card_poker', name: '3-Card Poker', wageredKey: 'threeCardPokerGames', winsKey: 'threeCardPokerWins' },
        { key: 'craps', name: 'Craps', wageredKey: 'crapsGames', winsKey: 'crapsWins' },
        { key: 'war', name: 'War', wageredKey: 'warGames', winsKey: 'warWins' },
        { key: 'coinflip', name: 'Coin Flip', wageredKey: 'coinflipGames', winsKey: 'coinflipWins' },
        { key: 'horserace', name: 'Horse Race', wageredKey: 'horseraceGames', winsKey: 'horseraceWins' },
        { key: 'crash', name: 'Crash', wageredKey: 'crashGames', winsKey: 'crashWins' },
        { key: 'hilo', name: 'Hi-Lo', wageredKey: 'hiloGames', winsKey: 'hiloWins' }
    ];

    const perGameStats = [];

    for (const gameType of gameTypes) {
        // Get games of this type from history
        const gamesOfType = gameHistory.filter(game => game.gameType === gameType.key);

        if (gamesOfType.length === 0) continue;

        let totalWagered = 0;
        let totalWon = 0;

        for (const game of gamesOfType) {
            totalWagered += game.bet;
            totalWon += game.winnings;
        }

        const netProfit = totalWon - totalWagered;
        const roi = totalWagered > 0 ? ((netProfit / totalWagered) * 100) : 0;
        const winRate = gamesOfType.length > 0 ?
            ((stats[gameType.winsKey] || 0) / (stats[gameType.wageredKey] || 1)) * 100 : 0;

        perGameStats.push({
            name: gameType.name,
            gamesPlayed: gamesOfType.length,
            totalWagered,
            totalWon,
            netProfit,
            roi: roi.toFixed(1),
            winRate: winRate.toFixed(1)
        });
    }

    // Sort by games played (most played first)
    perGameStats.sort((a, b) => b.gamesPlayed - a.gamesPlayed);

    return perGameStats;
}

/**
 * Calculate server-wide averages for comparison
 * @param {Object} allUserData - All user data from database
 * @returns {Object} - Server average statistics
 */
function calculateServerAverages(allUserData) {
    if (!allUserData || Object.keys(allUserData).length === 0) {
        return {
            avgBalance: 0,
            avgGamesPlayed: 0,
            avgWinRate: 0,
            avgROI: 0
        };
    }

    const users = Object.values(allUserData);
    let totalBalance = 0;
    let totalGamesPlayed = 0;
    let totalWins = 0;
    let totalWagered = 0;
    let totalWinnings = 0;

    for (const user of users) {
        totalBalance += user.money || 0;
        totalGamesPlayed += user.statistics?.gamesPlayed || 0;
        totalWins += user.statistics?.gamesWon || 0;
        totalWagered += user.statistics?.totalWagered || 0;
        totalWinnings += user.statistics?.totalWinnings || 0;
    }

    const userCount = users.length;
    const avgBalance = totalBalance / userCount;
    const avgGamesPlayed = totalGamesPlayed / userCount;
    const avgWinRate = totalGamesPlayed > 0 ? (totalWins / totalGamesPlayed) * 100 : 0;
    const avgROI = totalWagered > 0 ? (((totalWinnings - totalWagered) / totalWagered) * 100) : 0;

    return {
        avgBalance: Math.floor(avgBalance),
        avgGamesPlayed: Math.floor(avgGamesPlayed),
        avgWinRate: avgWinRate.toFixed(1),
        avgROI: avgROI.toFixed(1)
    };
}

/**
 * Get trend emoji based on value
 */
function getTrendEmoji(trend) {
    if (trend === 'up') return '📈';
    if (trend === 'down') return '📉';
    return '➖';
}

/**
 * Format ROI with color indication
 */
function formatROI(roi) {
    const roiNum = parseFloat(roi);
    if (roiNum > 0) {
        return `+${roi}% 📈`;
    } else if (roiNum < 0) {
        return `${roi}% 📉`;
    }
    return `${roi}% ➖`;
}

/**
 * Get rank based on percentile
 */
function getRankText(userValue, avgValue) {
    const ratio = userValue / (avgValue || 1);

    if (ratio >= 2.0) return '🏆 Top Tier';
    if (ratio >= 1.5) return '🥇 Above Average';
    if (ratio >= 1.1) return '⭐ Good';
    if (ratio >= 0.9) return '📊 Average';
    if (ratio >= 0.5) return '📉 Below Average';
    return '🆕 New Player';
}

/**
 * Calculate daily average statistics
 */
function calculateDailyAverages(gameHistory, stats) {
    if (!gameHistory || gameHistory.length === 0) {
        return {
            avgGamesPerDay: 0,
            avgWageredPerDay: 0,
            avgProfitPerDay: 0
        };
    }

    // Find earliest and latest game timestamps
    const timestamps = gameHistory.map(game => game.timestamp).sort((a, b) => a - b);
    const earliestGame = timestamps[0];
    const latestGame = timestamps[timestamps.length - 1];

    const daysSinceFirstGame = Math.max(1, Math.ceil((latestGame - earliestGame) / (24 * 60 * 60 * 1000)));

    const totalGames = stats.gamesPlayed || gameHistory.length;
    const totalWagered = stats.totalWagered || 0;
    const netProfit = (stats.totalWinnings || 0) - totalWagered;

    return {
        avgGamesPerDay: (totalGames / daysSinceFirstGame).toFixed(1),
        avgWageredPerDay: Math.floor(totalWagered / daysSinceFirstGame),
        avgProfitPerDay: Math.floor(netProfit / daysSinceFirstGame)
    };
}

module.exports = {
    calculate7DayTrend,
    calculatePerGameStats,
    calculateServerAverages,
    getTrendEmoji,
    formatROI,
    getRankText,
    calculateDailyAverages
};
