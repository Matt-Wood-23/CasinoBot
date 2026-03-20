const { query } = require('../database/connection');
const { convertDatabaseResult } = require('../database/queries/users');

// =====================
// EVENT CREATION & MANAGEMENT
// =====================

/**
 * Create a new guild event
 */
async function createGuildEvent(eventType, eventName, description, durationHours, rewardPool = 0, isGlobal = true) {
    const startTime = Date.now();
    const endTime = startTime + (durationHours * 60 * 60 * 1000);

    const result = await query(
        `INSERT INTO guild_events (event_type, event_name, description, start_time, end_time, is_active, is_global, reward_pool)
         VALUES ($1, $2, $3, $4, $5, true, $6, $7)
         RETURNING *`,
        [eventType, eventName, description, startTime, endTime, isGlobal, rewardPool]
    );

    return {
        success: true,
        event: convertDatabaseResult(result.rows[0])
    };
}

/**
 * Get an event by ID
 */
async function getEvent(eventId) {
    const result = await query(
        'SELECT * FROM guild_events WHERE id = $1',
        [eventId]
    );

    if (result.rows.length === 0) {
        return null;
    }

    return convertDatabaseResult(result.rows[0]);
}

/**
 * Get all active events
 */
async function getActiveEvents(eventType = null) {
    const now = Date.now();

    let sql = 'SELECT * FROM guild_events WHERE is_active = true AND start_time <= $1 AND end_time > $1';
    const params = [now];

    if (eventType) {
        sql += ' AND event_type = $2';
        params.push(eventType);
    }

    sql += ' ORDER BY start_time DESC';

    const result = await query(sql, params);
    return result.rows.map(convertDatabaseResult);
}

/**
 * End an event
 */
async function endEvent(eventId) {
    await query(
        'UPDATE guild_events SET is_active = false WHERE id = $1',
        [eventId]
    );

    return { success: true };
}

/**
 * Check if a specific event type is currently active
 */
async function isEventTypeActive(eventType) {
    const activeEvents = await getActiveEvents(eventType);
    return activeEvents.length > 0;
}

/**
 * Get the current active event of a specific type
 */
async function getCurrentEvent(eventType) {
    const activeEvents = await getActiveEvents(eventType);
    return activeEvents.length > 0 ? activeEvents[0] : null;
}

// =====================
// PARTICIPATION TRACKING
// =====================

/**
 * Register guild participation in an event
 */
async function joinEvent(eventId, guildId) {
    const joinedAt = Date.now();

    try {
        const result = await query(
            `INSERT INTO guild_event_participation (event_id, guild_id, score, joined_at)
             VALUES ($1, $2, 0, $3)
             ON CONFLICT (event_id, guild_id) DO NOTHING
             RETURNING *`,
            [eventId, guildId, joinedAt]
        );

        return {
            success: true,
            participation: result.rows.length > 0 ? convertDatabaseResult(result.rows[0]) : null
        };
    } catch (error) {
        console.error('Error joining event:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get guild participation in an event
 */
async function getGuildParticipation(eventId, guildId) {
    const result = await query(
        'SELECT * FROM guild_event_participation WHERE event_id = $1 AND guild_id = $2',
        [eventId, guildId]
    );

    if (result.rows.length === 0) {
        return null;
    }

    return convertDatabaseResult(result.rows[0]);
}

/**
 * Update guild score in an event
 */
async function updateEventScore(eventId, guildId, scoreToAdd) {
    const result = await query(
        `UPDATE guild_event_participation
         SET score = score + $1
         WHERE event_id = $2 AND guild_id = $3
         RETURNING *`,
        [scoreToAdd, eventId, guildId]
    );

    return {
        success: result.rows.length > 0,
        participation: result.rows.length > 0 ? convertDatabaseResult(result.rows[0]) : null
    };
}

/**
 * Record member contribution to event
 */
async function recordMemberContribution(eventId, guildId, userId, contributionAmount) {
    const lastContribution = Date.now();

    const result = await query(
        `INSERT INTO guild_event_member_contributions
         (event_id, guild_id, user_id, contribution_amount, participation_count, last_contribution)
         VALUES ($1, $2, $3, $4, 1, $5)
         ON CONFLICT (event_id, guild_id, user_id)
         DO UPDATE SET
            contribution_amount = guild_event_member_contributions.contribution_amount + $4,
            participation_count = guild_event_member_contributions.participation_count + 1,
            last_contribution = $5
         RETURNING *`,
        [eventId, guildId, userId, contributionAmount, lastContribution]
    );

    return {
        success: true,
        contribution: convertDatabaseResult(result.rows[0])
    };
}

/**
 * Get member contributions for an event
 */
async function getMemberContributions(eventId, guildId) {
    const result = await query(
        `SELECT * FROM guild_event_member_contributions
         WHERE event_id = $1 AND guild_id = $2
         ORDER BY contribution_amount DESC`,
        [eventId, guildId]
    );

    return result.rows.map(convertDatabaseResult);
}

/**
 * Get leaderboard for an event
 */
async function getEventLeaderboard(eventId, limit = 10) {
    const result = await query(
        `SELECT gep.*, g.name as guild_name
         FROM guild_event_participation gep
         JOIN guilds g ON gep.guild_id = g.id
         WHERE gep.event_id = $1
         ORDER BY gep.score DESC
         LIMIT $2`,
        [eventId, limit]
    );

    return result.rows.map(convertDatabaseResult);
}

/**
 * Update event rankings
 */
async function updateEventRankings(eventId) {
    // Get all participations ordered by score
    const result = await query(
        `SELECT id FROM guild_event_participation
         WHERE event_id = $1
         ORDER BY score DESC`,
        [eventId]
    );

    // Update ranks
    for (let i = 0; i < result.rows.length; i++) {
        await query(
            'UPDATE guild_event_participation SET rank = $1 WHERE id = $2',
            [i + 1, result.rows[i].id]
        );
    }

    return { success: true };
}

// =====================
// REWARDS
// =====================

/**
 * Distribute rewards for an event
 */
async function distributeEventRewards(eventId, guildId, userId, rewardType, rewardAmount, rewardItem = null) {
    const claimedAt = Date.now();

    const result = await query(
        `INSERT INTO guild_event_rewards
         (event_id, guild_id, user_id, reward_type, reward_amount, reward_item, claimed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [eventId, guildId, userId, rewardType, rewardAmount, rewardItem, claimedAt]
    );

    return {
        success: true,
        reward: convertDatabaseResult(result.rows[0])
    };
}

/**
 * Mark participation rewards as claimed
 */
async function markRewardsClaimed(eventId, guildId) {
    await query(
        'UPDATE guild_event_participation SET reward_claimed = true WHERE event_id = $1 AND guild_id = $2',
        [eventId, guildId]
    );

    return { success: true };
}

/**
 * Check if guild has claimed rewards for an event
 */
async function hasClaimedRewards(eventId, guildId) {
    const result = await query(
        'SELECT reward_claimed FROM guild_event_participation WHERE event_id = $1 AND guild_id = $2',
        [eventId, guildId]
    );

    if (result.rows.length === 0) {
        return false;
    }

    return result.rows[0].reward_claimed;
}

// =====================
// HELPER FUNCTIONS
// =====================

/**
 * Get event type emoji
 */
function getEventTypeEmoji(eventType) {
    const emojiMap = {
        'boss_raid': '🐉',
        'casino_domination': '🎰',
        'heist_festival': '💰'
    };
    return emojiMap[eventType] || '📅';
}

/**
 * Get event type display name
 */
function getEventTypeName(eventType) {
    const nameMap = {
        'boss_raid': 'Boss Raid',
        'casino_domination': 'Casino Domination',
        'heist_festival': 'Heist Festival'
    };
    return nameMap[eventType] || eventType;
}

/**
 * Format time remaining
 */
function formatTimeRemaining(endTime) {
    const timeLeft = endTime - Date.now();
    if (timeLeft <= 0) return 'Ended';

    const days = Math.floor(timeLeft / (24 * 60 * 60 * 1000));
    const hours = Math.floor((timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

    if (days > 0) {
        return `${days}d ${hours}h`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

module.exports = {
    // Event management
    createGuildEvent,
    getEvent,
    getActiveEvents,
    endEvent,
    isEventTypeActive,
    getCurrentEvent,

    // Participation
    joinEvent,
    getGuildParticipation,
    updateEventScore,
    recordMemberContribution,
    getMemberContributions,
    getEventLeaderboard,
    updateEventRankings,

    // Rewards
    distributeEventRewards,
    markRewardsClaimed,
    hasClaimedRewards,

    // Helpers
    getEventTypeEmoji,
    getEventTypeName,
    formatTimeRemaining
};
