const { query } = require('../connection');
const { getUserMoney } = require('./users');

// Unlock an achievement
async function unlockAchievementDB(userId, achievementId) {
    try {
        await getUserMoney(userId); // Ensure user exists

        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );
        const dbUserId = userResult.rows[0].id;

        // Check if already unlocked
        const existing = await query(
            'SELECT achievement_id FROM user_achievements WHERE user_id = $1 AND achievement_id = $2',
            [dbUserId, achievementId]
        );

        if (existing.rows.length > 0) {
            return false; // Already unlocked
        }

        await query(
            'INSERT INTO user_achievements (user_id, achievement_id, unlocked_at) VALUES ($1, $2, $3)',
            [dbUserId, achievementId, Date.now()]
        );

        return true;
    } catch (error) {
        console.error('Error unlocking achievement:', error);
        return false;
    }
}

// Check if user has achievement
async function hasAchievementDB(userId, achievementId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const dbUserId = userResult.rows[0].id;

        const result = await query(
            'SELECT COUNT(*) as count FROM user_achievements WHERE user_id = $1 AND achievement_id = $2',
            [dbUserId, achievementId]
        );

        return parseInt(result.rows[0].count) > 0;
    } catch (error) {
        console.error('Error checking achievement:', error);
        return false;
    }
}

// Get all user achievements
async function getUserAchievementsDB(userId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return [];

        const dbUserId = userResult.rows[0].id;

        const result = await query(
            'SELECT achievement_id, unlocked_at FROM user_achievements WHERE user_id = $1 ORDER BY unlocked_at DESC',
            [dbUserId]
        );

        return result.rows.map(row => ({
            achievementId: row.achievement_id,
            unlockedAt: parseInt(row.unlocked_at)
        }));
    } catch (error) {
        console.error('Error getting user achievements:', error);
        return [];
    }
}

// Get achievement progress
async function getAchievementProgressDB(userId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return null;

        const dbUserId = userResult.rows[0].id;

        // Ensure progress row exists
        await query(
            `INSERT INTO user_achievement_progress (user_id)
             VALUES ($1)
             ON CONFLICT (user_id) DO NOTHING`,
            [dbUserId]
        );

        const result = await query(
            'SELECT * FROM user_achievement_progress WHERE user_id = $1',
            [dbUserId]
        );

        if (result.rows.length === 0) return null;

        const row = result.rows[0];
        return {
            currentWinStreak: parseInt(row.current_win_streak),
            bestWinStreak: parseInt(row.best_win_streak),
            loansRepaid: parseInt(row.loans_repaid),
            largestLoanRepaid: parseInt(row.largest_loan_repaid),
            workShifts: parseInt(row.work_shifts)
        };
    } catch (error) {
        console.error('Error getting achievement progress:', error);
        return null;
    }
}

// Update win streak
async function updateWinStreakDB(userId, isWin) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return null;

        const dbUserId = userResult.rows[0].id;

        // Ensure progress row exists
        await query(
            `INSERT INTO user_achievement_progress (user_id)
             VALUES ($1)
             ON CONFLICT (user_id) DO NOTHING`,
            [dbUserId]
        );

        if (isWin) {
            // Increment win streak
            const result = await query(
                `UPDATE user_achievement_progress
                 SET current_win_streak = current_win_streak + 1,
                     best_win_streak = GREATEST(best_win_streak, current_win_streak + 1)
                 WHERE user_id = $1
                 RETURNING current_win_streak, best_win_streak`,
                [dbUserId]
            );
            return {
                currentWinStreak: parseInt(result.rows[0].current_win_streak),
                bestWinStreak: parseInt(result.rows[0].best_win_streak)
            };
        } else {
            // Reset win streak
            await query(
                'UPDATE user_achievement_progress SET current_win_streak = 0 WHERE user_id = $1',
                [dbUserId]
            );
            return { currentWinStreak: 0 };
        }
    } catch (error) {
        console.error('Error updating win streak:', error);
        return null;
    }
}

// Increment work shifts
async function incrementWorkShiftsDB(userId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return 0;

        const dbUserId = userResult.rows[0].id;

        // Ensure progress row exists
        await query(
            `INSERT INTO user_achievement_progress (user_id)
             VALUES ($1)
             ON CONFLICT (user_id) DO NOTHING`,
            [dbUserId]
        );

        const result = await query(
            `UPDATE user_achievement_progress
             SET work_shifts = work_shifts + 1
             WHERE user_id = $1
             RETURNING work_shifts`,
            [dbUserId]
        );

        return parseInt(result.rows[0].work_shifts);
    } catch (error) {
        console.error('Error incrementing work shifts:', error);
        return 0;
    }
}

// Update loan progress
async function updateLoanProgressDB(userId, loanAmount) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return null;

        const dbUserId = userResult.rows[0].id;

        // Ensure progress row exists
        await query(
            `INSERT INTO user_achievement_progress (user_id)
             VALUES ($1)
             ON CONFLICT (user_id) DO NOTHING`,
            [dbUserId]
        );

        const result = await query(
            `UPDATE user_achievement_progress
             SET loans_repaid = loans_repaid + 1,
                 largest_loan_repaid = GREATEST(largest_loan_repaid, $2)
             WHERE user_id = $1
             RETURNING loans_repaid, largest_loan_repaid`,
            [dbUserId, loanAmount]
        );

        return {
            loansRepaid: parseInt(result.rows[0].loans_repaid),
            largestLoanRepaid: parseInt(result.rows[0].largest_loan_repaid)
        };
    } catch (error) {
        console.error('Error updating loan progress:', error);
        return null;
    }
}

module.exports = {
    unlockAchievementDB,
    hasAchievementDB,
    getUserAchievementsDB,
    getAchievementProgressDB,
    updateWinStreakDB,
    incrementWorkShiftsDB,
    updateLoanProgressDB
};
