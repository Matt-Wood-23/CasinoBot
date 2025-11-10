const { query } = require('../database/connection');
const { createGuildEvent, getEvent, getCurrentEvent, joinEvent, recordMemberContribution } = require('./guildEvents');

// Heist Festival bonuses
const FESTIVAL_BONUSES = {
    xpMultiplier: 2.0,           // 2x guild XP for heists
    winningsMultiplier: 1.5,     // 1.5x stolen amount
    failurePenaltyReduction: 0.5, // 50% reduced failure penalty
    contributionPoints: 50        // 50 contribution points per heist (instead of 25/10)
};

/**
 * Create a new Heist Festival event
 */
async function createHeistFestival(durationHours = 48) {
    const eventName = '💰 Heist Festival Weekend';
    const description = 'Special weekend event with heist bonuses! 2x XP, 1.5x winnings, reduced failure penalties.';

    // Create the event
    const eventResult = await createGuildEvent(
        'heist_festival',
        eventName,
        description,
        durationHours,
        0, // no fixed reward pool
        true // global event
    );

    return eventResult;
}

/**
 * Get Heist Festival data for a guild
 */
async function getHeistFestivalData(eventId, guildId) {
    const result = await query(
        'SELECT * FROM guild_heist_festival WHERE event_id = $1 AND guild_id = $2',
        [eventId, guildId]
    );

    if (result.rows.length === 0) {
        return null;
    }

    return convertDatabaseResult(result.rows[0]);
}

/**
 * Get current active Heist Festival event
 */
async function getCurrentHeistFestival() {
    const event = await getCurrentEvent('heist_festival');

    if (!event) {
        return null;
    }

    return event;
}

/**
 * Check if Heist Festival is currently active
 */
async function isHeistFestivalActive() {
    const event = await getCurrentHeistFestival();
    return event !== null;
}

/**
 * Get Heist Festival bonuses
 */
function getFestivalBonuses() {
    return { ...FESTIVAL_BONUSES };
}

/**
 * Record heist for Heist Festival
 */
async function recordFestivalHeist(eventId, guildId, userId, successful, amountStolen, xpEarned) {
    if (!eventId) {
        return { success: false, error: 'Invalid event ID' };
    }

    const lastUpdated = Date.now();

    // Update guild heist festival stats
    const result = await query(
        `INSERT INTO guild_heist_festival
         (event_id, guild_id, heists_completed, heists_successful, total_stolen, bonus_xp_earned, last_updated)
         VALUES ($1, $2, 1, $3, $4, $5, $6)
         ON CONFLICT (event_id, guild_id)
         DO UPDATE SET
            heists_completed = guild_heist_festival.heists_completed + 1,
            heists_successful = guild_heist_festival.heists_successful + $3,
            total_stolen = guild_heist_festival.total_stolen + $4,
            bonus_xp_earned = guild_heist_festival.bonus_xp_earned + $5,
            last_updated = $6
         RETURNING *`,
        [eventId, guildId, successful ? 1 : 0, amountStolen, xpEarned, lastUpdated]
    );

    // Auto-join event if not already
    await joinEvent(eventId, guildId);

    // Update event participation score (based on heists completed)
    const festData = convertDatabaseResult(result.rows[0]);
    await query(
        `UPDATE guild_event_participation
         SET score = $1
         WHERE event_id = $2 AND guild_id = $3`,
        [festData.heistsCompleted * 1000 + festData.totalStolen, eventId, guildId]
    );

    // Record member contribution (heist count + stolen amount)
    const contribution = 1000 + amountStolen; // 1000 points per heist + stolen amount
    await recordMemberContribution(eventId, guildId, userId, contribution);

    return {
        success: true,
        data: festData,
        bonuses: FESTIVAL_BONUSES
    };
}

/**
 * Get Heist Festival leaderboard
 */
async function getHeistFestivalLeaderboard(eventId, limit = 10) {
    const result = await query(
        `SELECT ghf.*, g.name as guild_name
         FROM guild_heist_festival ghf
         JOIN guilds g ON ghf.guild_id = g.id
         WHERE ghf.event_id = $1
         ORDER BY ghf.heists_completed DESC, ghf.total_stolen DESC
         LIMIT $2`,
        [eventId, limit]
    );

    return result.rows.map(convertDatabaseResult);
}

/**
 * Get player heist leaderboard for Heist Festival
 */
async function getPlayerHeistLeaderboard(eventId, guildId = null, limit = 10) {
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

    sql += ' ORDER BY gemc.participation_count DESC, gemc.contribution_amount DESC LIMIT $' + (guildId ? '3' : '2');
    params.push(limit);

    const result = await query(sql, params);
    return result.rows.map(convertDatabaseResult);
}

/**
 * Calculate Heist Festival rewards
 */
async function calculateHeistFestivalRewards(eventId) {
    const event = await getEvent(eventId);

    if (!event) {
        return { success: false, error: 'Event not found' };
    }

    // Get leaderboard
    const leaderboard = await getHeistFestivalLeaderboard(eventId, 10);

    if (leaderboard.length === 0) {
        return { success: false, error: 'No participants' };
    }

    const rewards = [];

    // Rewards based on heists completed
    // 1st = 2M, 2nd = 1.5M, 3rd = 1M, 4th = 750k, 5th = 500k, 6-10th = 250k each
    const rewardAmounts = [2000000, 1500000, 1000000, 750000, 500000, 250000, 250000, 250000, 250000, 250000];

    for (let i = 0; i < leaderboard.length; i++) {
        const entry = leaderboard[i];
        const guildReward = rewardAmounts[i] || 0;

        // Calculate success rate
        const successRate = entry.heistsCompleted > 0
            ? ((entry.heistsSuccessful / entry.heistsCompleted) * 100).toFixed(1)
            : '0.0';

        rewards.push({
            rank: i + 1,
            guildId: entry.guildId,
            guildName: entry.guildName,
            heistsCompleted: entry.heistsCompleted,
            heistsSuccessful: entry.heistsSuccessful,
            successRate: successRate + '%',
            totalStolen: entry.totalStolen,
            bonusXpEarned: entry.bonusXpEarned,
            reward: guildReward
        });
    }

    const totalRewardPool = rewardAmounts.reduce((sum, amount) => sum + amount, 0);

    return {
        success: true,
        totalRewardPool,
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
            SUM(heists_completed) as total_heists_all,
            SUM(heists_successful) as total_successful_all,
            SUM(total_stolen) as total_stolen_all,
            SUM(bonus_xp_earned) as total_bonus_xp_all
         FROM guild_heist_festival
         WHERE event_id = $1`,
        [eventId]
    );

    if (result.rows.length === 0) {
        return {
            totalGuilds: 0,
            totalHeistsAll: 0,
            totalSuccessfulAll: 0,
            totalStolenAll: 0,
            totalBonusXpAll: 0
        };
    }

    const stats = convertDatabaseResult(result.rows[0]);

    // Calculate overall success rate
    stats.overallSuccessRate = stats.totalHeistsAll > 0
        ? ((stats.totalSuccessfulAll / stats.totalHeistsAll) * 100).toFixed(1) + '%'
        : '0.0%';

    return stats;
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
    FESTIVAL_BONUSES,
    createHeistFestival,
    getHeistFestivalData,
    getCurrentHeistFestival,
    isHeistFestivalActive,
    getFestivalBonuses,
    recordFestivalHeist,
    getHeistFestivalLeaderboard,
    getPlayerHeistLeaderboard,
    calculateHeistFestivalRewards,
    getEventStatistics
};
