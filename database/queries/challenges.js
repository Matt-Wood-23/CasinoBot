const { query } = require('../connection');
const { getUserMoney, convertKeysToCamelCase } = require('./users');

// Get user's active challenges
async function getUserChallengesDB(userId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return { daily: [], weekly: [] };

        const dbUserId = userResult.rows[0].id;

        const result = await query(
            `SELECT id, challenge_id, challenge_type, challenge_name, description, progress, target, reward, period, is_completed, is_claimed, started_at, expires_at, completed_at
             FROM user_challenges
             WHERE user_id = $1 AND expires_at > $2
             ORDER BY period DESC, started_at ASC`,
            [dbUserId, Date.now()]
        );

        const challenges = {
            daily: [],
            weekly: []
        };

        for (const row of result.rows) {
            const challenge = {
                id: row.challenge_id,
                name: row.challenge_name,
                description: row.description,
                type: row.challenge_type,
                progress: parseInt(row.progress),
                target: parseInt(row.target),
                reward: parseInt(row.reward),
                completed: row.is_completed,
                claimed: row.is_claimed,
                expiresAt: parseInt(row.expires_at),
                startedAt: parseInt(row.started_at),
                emoji: '🎯', // Default emoji, challenges.js will override this
                uniqueGamesPlayed: [] // For tracking unique games
            };

            if (row.completed_at) {
                challenge.completedAt = parseInt(row.completed_at);
            }

            if (row.period === 'daily') {
                challenges.daily.push(challenge);
            } else if (row.period === 'weekly') {
                challenges.weekly.push(challenge);
            }
        }

        return challenges;
    } catch (error) {
        console.error('Error getting user challenges:', error);
        return { daily: [], weekly: [] };
    }
}

// Create a new challenge for a user
async function createChallengeDB(userId, challengeData) {
    try {
        await getUserMoney(userId); // Ensure user exists

        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );
        const dbUserId = userResult.rows[0].id;

        await query(
            `INSERT INTO user_challenges (user_id, challenge_id, challenge_type, challenge_name, description, progress, target, reward, period, is_completed, started_at, expires_at)
             VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, FALSE, $9, $10)`,
            [
                dbUserId,
                challengeData.id,
                challengeData.type,
                challengeData.name,
                challengeData.description,
                challengeData.target,
                challengeData.reward,
                challengeData.period, // 'daily' or 'weekly'
                challengeData.startedAt,
                challengeData.expiresAt
            ]
        );

        return true;
    } catch (error) {
        console.error('Error creating challenge:', error);
        return false;
    }
}

// Update challenge progress
async function updateChallengeProgressDB(userId, challengeId, progress) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const dbUserId = userResult.rows[0].id;

        await query(
            `UPDATE user_challenges
             SET progress = $1
             WHERE user_id = $2 AND challenge_id = $3 AND is_completed = FALSE`,
            [progress, dbUserId, challengeId]
        );

        return true;
    } catch (error) {
        console.error('Error updating challenge progress:', error);
        return false;
    }
}

// Mark challenge as completed
async function markChallengeCompletedDB(userId, challengeId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const dbUserId = userResult.rows[0].id;

        await query(
            `UPDATE user_challenges
             SET is_completed = TRUE, completed_at = $1
             WHERE user_id = $2 AND challenge_id = $3`,
            [Date.now(), dbUserId, challengeId]
        );

        return true;
    } catch (error) {
        console.error('Error marking challenge completed:', error);
        return false;
    }
}

// Mark challenge as claimed (for rewards)
async function markChallengeClaimedDB(userId, challengeId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const dbUserId = userResult.rows[0].id;

        await query(
            `UPDATE user_challenges
             SET is_claimed = TRUE
             WHERE user_id = $1 AND challenge_id = $2`,
            [dbUserId, challengeId]
        );

        return true;
    } catch (error) {
        console.error('Error marking challenge claimed:', error);
        return false;
    }
}

// Delete all challenges for a user (for resets)
async function deleteChallengesDB(userId, period) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const dbUserId = userResult.rows[0].id;

        await query(
            `DELETE FROM user_challenges
             WHERE user_id = $1 AND period = $2`,
            [dbUserId, period]
        );

        return true;
    } catch (error) {
        console.error('Error deleting challenges:', error);
        return false;
    }
}

// Check if user has active challenges for a period
async function hasActiveChallengesDB(userId, period) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const dbUserId = userResult.rows[0].id;

        const result = await query(
            `SELECT COUNT(*) as count
             FROM user_challenges
             WHERE user_id = $1 AND period = $2 AND expires_at > $3`,
            [dbUserId, period, Date.now()]
        );

        return parseInt(result.rows[0].count) > 0;
    } catch (error) {
        console.error('Error checking active challenges:', error);
        return false;
    }
}

// Get challenge reset times (stored in a metadata table or user table)
// For now, we'll track this in memory or via timestamps
async function getLastResetTimeDB(userId, period) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return 0;

        const dbUserId = userResult.rows[0].id;

        // Get the earliest started_at for active challenges of this period
        const result = await query(
            `SELECT MIN(started_at) as last_reset
             FROM user_challenges
             WHERE user_id = $1 AND period = $2`,
            [dbUserId, period]
        );

        if (result.rows.length === 0 || result.rows[0].last_reset === null) {
            return 0;
        }

        return parseInt(result.rows[0].last_reset);
    } catch (error) {
        console.error('Error getting last reset time:', error);
        return 0;
    }
}

module.exports = {
    getUserChallengesDB,
    createChallengeDB,
    updateChallengeProgressDB,
    markChallengeCompletedDB,
    markChallengeClaimedDB,
    deleteChallengesDB,
    hasActiveChallengesDB,
    getLastResetTimeDB
};
