const { query, getClient } = require('../connection');
const { getUserMoney, setUserMoney, pendingNotifications } = require('./users');

// Record game result
async function recordGameResult(userId, gameType, bet, winnings, result, details = {}, additionalData = {}) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Ensure user exists
        await getUserMoney(userId);

        // Get user ID
        const userResult = await client.query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );
        const dbUserId = userResult.rows[0].id;

        const timestamp = Date.now();
        const recordId = timestamp + Math.random();

        // Apply active boost effects
        const { hasActiveBoost, getActiveBoost, consumeBoost } = require('../../utils/shop');
        const boostsApplied = [];
        let modifiedWinnings = Math.floor(winnings);

        // Check for Win Multiplier boost (25% bonus on wins)
        if ((result === 'win' || result === 'blackjack') && await hasActiveBoost(userId, 'win_multiplier')) {
            const boost = await getActiveBoost(userId, 'win_multiplier');
            const bonusAmount = Math.floor(winnings * (boost.value / 100));
            modifiedWinnings += bonusAmount;

            // Add money for the bonus
            const currentMoney = await getUserMoney(userId);
            await setUserMoney(userId, currentMoney + bonusAmount);

            await consumeBoost(userId, 'win_multiplier');
            boostsApplied.push({ type: 'win_multiplier', bonus: bonusAmount });
        }

        // Check for Insurance boost (50% refund on loss)
        if (result === 'lose' && await hasActiveBoost(userId, 'insurance')) {
            const boost = await getActiveBoost(userId, 'insurance');
            const refundAmount = Math.floor(bet * (boost.value / 100));

            // Refund money
            const currentMoney = await getUserMoney(userId);
            await setUserMoney(userId, currentMoney + refundAmount);

            modifiedWinnings += refundAmount;
            await consumeBoost(userId, 'insurance');
            boostsApplied.push({ type: 'insurance', refund: refundAmount });
        }

        // Insert game history
        await client.query(
            `INSERT INTO game_history
             (user_id, game_type, bet, winnings, result, details, boosts_applied, original_winnings, timestamp, record_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
                dbUserId,
                gameType,
                Math.floor(bet),
                modifiedWinnings,
                result,
                JSON.stringify(details),
                boostsApplied.length > 0 ? JSON.stringify(boostsApplied) : null,
                boostsApplied.length > 0 ? Math.floor(winnings) : null,
                timestamp,
                recordId
            ]
        );

        // Keep only last 50 games per user
        await client.query(
            `DELETE FROM game_history
             WHERE id IN (
                 SELECT id FROM game_history
                 WHERE user_id = $1
                 ORDER BY timestamp DESC
                 OFFSET 50
             )`,
            [dbUserId]
        );

        // Update statistics
        const statUpdates = {
            games_played: 1,
            total_wagered: Math.floor(bet),
            total_winnings: modifiedWinnings + Math.floor(bet)
        };

        if (result === 'win' || result === 'blackjack') {
            statUpdates.games_won = 1;
        }

        if (result === 'blackjack') {
            statUpdates.blackjacks = 1;
        }

        if (details.handsPlayed) {
            statUpdates.hands_played = details.handsPlayed;
        }

        // Game-specific stats
        const gameStatMapping = {
            slots: { spins: 'slots_spins', wins: 'slots_wins' },
            three_card_poker: { games: 'three_card_poker_games', wins: 'three_card_poker_wins' },
            roulette: { spins: 'roulette_spins', wins: 'roulette_wins' },
            craps: { games: 'craps_games', wins: 'craps_wins' },
            war: { games: 'war_games', wins: 'war_wins' },
            coinflip: { games: 'coinflip_games', wins: 'coinflip_wins' },
            horserace: { games: 'horserace_games', wins: 'horserace_wins' },
            crash: { games: 'crash_games', wins: 'crash_wins' },
            hilo: { games: 'hilo_games', wins: 'hilo_wins' },
            bingo: { games: 'bingo_games', wins: 'bingo_wins' }
        };

        if (gameStatMapping[gameType]) {
            const mapping = gameStatMapping[gameType];
            if (mapping.spins) statUpdates[mapping.spins] = 1;
            if (mapping.games) statUpdates[mapping.games] = 1;

            if (result === 'win' && mapping.wins) {
                statUpdates[mapping.wins] = 1;
            }
        }

        // Build dynamic UPDATE query
        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;

        for (const [field, increment] of Object.entries(statUpdates)) {
            updateFields.push(`${field} = ${field} + $${paramIndex}`);
            updateValues.push(increment);
            paramIndex++;
        }

        // Update biggest win
        if ((result === 'win' || result === 'blackjack') && modifiedWinnings > 0) {
            updateFields.push(`biggest_win = GREATEST(biggest_win, $${paramIndex})`);
            updateValues.push(modifiedWinnings);
            paramIndex++;
        }

        // Update biggest loss
        if (winnings < 0 && Math.abs(winnings) > 0) {
            updateFields.push(`biggest_loss = GREATEST(biggest_loss, $${paramIndex})`);
            updateValues.push(Math.abs(winnings));
            paramIndex++;
        }

        // Hi-Lo max streak
        if (gameType === 'hilo' && details.maxStreak) {
            updateFields.push(`hilo_max_streak = GREATEST(hilo_max_streak, $${paramIndex})`);
            updateValues.push(details.maxStreak);
            paramIndex++;
        }

        // Roulette additional data
        if (gameType === 'roulette' && additionalData) {
            if (additionalData.betsPlaced) {
                updateFields.push(`roulette_bets_placed = roulette_bets_placed + $${paramIndex}`);
                updateValues.push(additionalData.betsPlaced);
                paramIndex++;
            }
        }

        updateValues.push(dbUserId);

        await client.query(
            `UPDATE user_statistics SET ${updateFields.join(', ')}
             WHERE user_id = $${paramIndex}`,
            updateValues
        );

        // Check achievements and update challenges
        const { checkAchievements } = require('../../utils/achievements');
        const { updateChallengeProgress } = require('../../utils/challenges');

        const newAchievements = await checkAchievements(userId, {
            gameType,
            bet: Math.floor(bet),
            winnings: Math.floor(winnings),
            result,
            details
        });

        const completedChallenges = await updateChallengeProgress(userId, {
            gameType,
            bet: Math.floor(bet),
            winnings: Math.floor(winnings),
            result,
            handsPlayed: details.handsPlayed
        });

        // Store notifications in memory
        if (!pendingNotifications.has(userId)) {
            pendingNotifications.set(userId, { achievements: [], challenges: [], messages: [] });
        }

        const notifications = pendingNotifications.get(userId);
        if (newAchievements.length > 0) {
            notifications.achievements.push(...newAchievements);
        }
        if (completedChallenges.length > 0) {
            notifications.challenges.push(...completedChallenges);
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error recording game result:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Get server jackpot
async function getServerJackpot(serverId) {
    try {
        // Ensure jackpot row exists
        await query(
            `INSERT INTO progressive_jackpot (server_id, current_amount, created_at)
             VALUES ($1, 0, $2)
             ON CONFLICT (server_id) DO NOTHING`,
            [serverId, Date.now()]
        );

        const result = await query(
            `SELECT current_amount, last_winner_id, last_winner_amount, last_won_at, total_contributed, times_won
             FROM progressive_jackpot
             WHERE server_id = $1`,
            [serverId]
        );

        if (result.rows.length === 0) return null;

        const row = result.rows[0];
        return {
            currentAmount: parseInt(row.current_amount) || 0,
            lastWinnerId: row.last_winner_id,
            lastWinnerAmount: parseInt(row.last_winner_amount) || 0,
            lastWonAt: parseInt(row.last_won_at) || 0,
            totalContributed: parseInt(row.total_contributed) || 0,
            timesWon: parseInt(row.times_won) || 0
        };
    } catch (error) {
        console.error('Error getting server jackpot:', error);
        return null;
    }
}

// Add to jackpot pool
async function addToJackpot(serverId, amount) {
    try {
        // Ensure jackpot row exists
        await query(
            `INSERT INTO progressive_jackpot (server_id, current_amount, created_at)
             VALUES ($1, 0, $2)
             ON CONFLICT (server_id) DO NOTHING`,
            [serverId, Date.now()]
        );

        await query(
            `UPDATE progressive_jackpot
             SET current_amount = current_amount + $1,
                 total_contributed = total_contributed + $1
             WHERE server_id = $2`,
            [amount, serverId]
        );

        return true;
    } catch (error) {
        console.error('Error adding to jackpot:', error);
        return false;
    }
}

// Reset jackpot after win
async function resetJackpot(serverId, winnerId, winAmount) {
    try {
        await query(
            `UPDATE progressive_jackpot
             SET current_amount = 0,
                 last_winner_id = $1,
                 last_winner_amount = $2,
                 last_won_at = $3,
                 times_won = times_won + 1
             WHERE server_id = $4`,
            [winnerId, winAmount, Date.now(), serverId]
        );

        return true;
    } catch (error) {
        console.error('Error resetting jackpot:', error);
        return false;
    }
}

// Check if user is gambling banned
async function isGamblingBanned(userId) {
    try {
        const result = await query(
            'SELECT gambling_ban_until FROM users WHERE discord_id = $1',
            [userId]
        );

        if (result.rows.length === 0) return false;

        const banUntil = parseInt(result.rows[0].gambling_ban_until) || 0;
        return banUntil > Date.now();
    } catch (error) {
        console.error('Error checking gambling ban:', error);
        return false;
    }
}

// Get gambling ban expiry time
async function getGamblingBanTime(userId) {
    try {
        const result = await query(
            'SELECT gambling_ban_until FROM users WHERE discord_id = $1',
            [userId]
        );

        if (result.rows.length === 0) return 0;

        return parseInt(result.rows[0].gambling_ban_until) || 0;
    } catch (error) {
        console.error('Error getting gambling ban time:', error);
        return 0;
    }
}

// Set gambling ban
async function setGamblingBan(userId, banUntilTimestamp) {
    try {
        await getUserMoney(userId); // Ensure user exists

        await query(
            'UPDATE users SET gambling_ban_until = $1 WHERE discord_id = $2',
            [banUntilTimestamp, userId]
        );

        return true;
    } catch (error) {
        console.error('Error setting gambling ban:', error);
        return false;
    }
}

// Clear gambling ban
async function clearGamblingBan(userId) {
    try {
        await getUserMoney(userId); // Ensure user exists

        await query(
            'UPDATE users SET gambling_ban_until = 0 WHERE discord_id = $1',
            [userId]
        );

        return true;
    } catch (error) {
        console.error('Error clearing gambling ban:', error);
        return false;
    }
}

module.exports = {
    recordGameResult,
    getServerJackpot,
    addToJackpot,
    resetJackpot,
    isGamblingBanned,
    getGamblingBanTime,
    setGamblingBan,
    clearGamblingBan
};
