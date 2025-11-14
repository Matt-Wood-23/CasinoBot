const { query } = require('../database/connection');
const { createGuildEvent, getEvent, getCurrentEvent, joinEvent, getEventLeaderboard } = require('./guildEvents');

/**
 * Create a new Casino Domination competition
 */
async function createCasinoDomination(durationHours = 72, rewardPool = 5000000) {
    const eventName = '🎰 Casino Domination Competition';
    const description = 'Guilds compete for the highest total winnings! Play casino games to earn points for your guild.';

    // Create the event
    const eventResult = await createGuildEvent(
        'casino_domination',
        eventName,
        description,
        durationHours,
        rewardPool,
        true // global event
    );

    return eventResult;
}

/**
 * Get Casino Domination data for a guild
 */
async function getCasinoDominationData(eventId, guildId) {
    const result = await query(
        'SELECT * FROM guild_casino_domination WHERE event_id = $1 AND guild_id = $2',
        [eventId, guildId]
    );

    if (result.rows.length === 0) {
        return null;
    }

    return convertDatabaseResult(result.rows[0]);
}

/**
 * Get current active Casino Domination event
 */
async function getCurrentCasinoDomination() {
    const event = await getCurrentEvent('casino_domination');

    if (!event) {
        return null;
    }

    return event;
}

/**
 * Record winnings for Casino Domination
 */
async function recordCasinoWinnings(eventId, guildId, userId, gameName, wagerAmount, winnings) {
    if (!eventId || winnings <= 0) {
        return { success: false, error: 'Invalid parameters' };
    }

    const lastUpdated = Date.now();

    // Update guild casino domination stats
    const result = await query(
        `INSERT INTO guild_casino_domination
         (event_id, guild_id, total_winnings, total_wagered, games_played, last_updated)
         VALUES ($1, $2, $3, $4, 1, $5)
         ON CONFLICT (event_id, guild_id)
         DO UPDATE SET
            total_winnings = guild_casino_domination.total_winnings + $3,
            total_wagered = guild_casino_domination.total_wagered + $4,
            games_played = guild_casino_domination.games_played + 1,
            last_updated = $5
         RETURNING *`,
        [eventId, guildId, winnings, wagerAmount, lastUpdated]
    );

    // Auto-join event if not already
    await joinEvent(eventId, guildId);

    // Update event participation score (based on total winnings)
    const domData = convertDatabaseResult(result.rows[0]);
    await query(
        `UPDATE guild_event_participation
         SET score = $1
         WHERE event_id = $2 AND guild_id = $3`,
        [domData.totalWinnings, eventId, guildId]
    );

    // Record member contribution
    const { recordMemberContribution } = require('./guildEvents');
    await recordMemberContribution(eventId, guildId, userId, winnings);

    return {
        success: true,
        data: domData
    };
}

/**
 * Get Casino Domination leaderboard
 */
async function getCasinoDominationLeaderboard(eventId, limit = 10) {
    const result = await query(
        `SELECT gcd.*, g.name as guild_name
         FROM guild_casino_domination gcd
         JOIN guilds g ON gcd.guild_id = g.id
         WHERE gcd.event_id = $1
         ORDER BY gcd.total_winnings DESC
         LIMIT $2`,
        [eventId, limit]
    );

    return result.rows.map(convertDatabaseResult);
}

/**
 * Get player winnings leaderboard for Casino Domination
 */
async function getPlayerWinningsLeaderboard(eventId, guildId = null, limit = 10) {
    let sql = `
        SELECT gemc.*, u.discord_id
        FROM guild_event_member_contributions gemc
        JOIN users u ON gemc.user_id = u.id
        WHERE gemc.event_id = $1
    `;
    const params = [eventId];

    if (guildId) {
        sql += ' AND gemc.guild_id = $2';
        params.push(guildId);
    }

    sql += ' ORDER BY gemc.contribution_amount DESC LIMIT $' + (guildId ? '3' : '2');
    params.push(limit);

    const result = await query(sql, params);
    return result.rows.map(convertDatabaseResult);
}

/**
 * Calculate Casino Domination rewards
 */
async function calculateCasinoDominationRewards(eventId) {
    const event = await getEvent(eventId);

    if (!event) {
        return { success: false, error: 'Event not found' };
    }

    const rewardPool = event.rewardPool || 5000000;

    // Get leaderboard
    const leaderboard = await getCasinoDominationLeaderboard(eventId, 10);

    if (leaderboard.length === 0) {
        return { success: false, error: 'No participants' };
    }

    const rewards = [];

    // Reward distribution: 1st=35%, 2nd=25%, 3rd=18%, 4th=10%, 5th=7%, 6-10th=5% split
    const rewardPercentages = [0.35, 0.25, 0.18, 0.10, 0.07, 0.01, 0.01, 0.01, 0.01, 0.01];

    for (let i = 0; i < leaderboard.length; i++) {
        const entry = leaderboard[i];
        const percentage = rewardPercentages[i] || 0;
        const guildReward = Math.floor(rewardPool * percentage);

        rewards.push({
            rank: i + 1,
            guildId: entry.guildId,
            guildName: entry.guildName,
            totalWinnings: entry.totalWinnings,
            totalWagered: entry.totalWagered,
            gamesPlayed: entry.gamesPlayed,
            reward: guildReward,
            percentage: (percentage * 100).toFixed(1)
        });
    }

    return {
        success: true,
        totalRewardPool: rewardPool,
        rewards
    };
}

/**
 * Get event statistics
 */
async function getEventStatistics(eventId) {
    const result = await query(
        `SELECT
            COUNT(DISTINCT guild_id) as total_guilds,
            SUM(total_winnings) as total_winnings_all,
            SUM(total_wagered) as total_wagered_all,
            SUM(games_played) as total_games_all
         FROM guild_casino_domination
         WHERE event_id = $1`,
        [eventId]
    );

    if (result.rows.length === 0) {
        return {
            totalGuilds: 0,
            totalWinningsAll: 0,
            totalWageredAll: 0,
            totalGamesAll: 0
        };
    }

    return convertDatabaseResult(result.rows[0]);
}

/**
 * Convert snake_case to camelCase
 */
function convertDatabaseResult(row) {
    if (!row) return null;

    const converted = {};
    for (const key in row) {
        const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        converted[camelKey] = row[key];
    }
    return converted;
}

module.exports = {
    createCasinoDomination,
    getCasinoDominationData,
    getCurrentCasinoDomination,
    recordCasinoWinnings,
    getCasinoDominationLeaderboard,
    getPlayerWinningsLeaderboard,
    calculateCasinoDominationRewards,
    getEventStatistics
};
