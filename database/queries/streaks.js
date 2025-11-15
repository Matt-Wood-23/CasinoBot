const { query } = require('../connection');
const { getUserMoney } = require('./users');

// Get user's login streak
async function getLoginStreak(userId) {
    try {
        const result = await query(
            'SELECT login_streak, best_login_streak, last_streak_claim FROM users WHERE discord_id = $1',
            [userId]
        );

        if (result.rows.length === 0) return { currentStreak: 0, bestStreak: 0, lastClaim: 0 };

        const row = result.rows[0];
        return {
            currentStreak: parseInt(row.login_streak) || 0,
            bestStreak: parseInt(row.best_login_streak) || 0,
            lastClaim: parseInt(row.last_streak_claim) || 0
        };
    } catch (error) {
        console.error('Error getting login streak:', error);
        return { currentStreak: 0, bestStreak: 0, lastClaim: 0 };
    }
}

// Update login streak (increment or reset)
async function updateLoginStreak(userId, isNewClaim = true) {
    try {
        await getUserMoney(userId); // Ensure user exists

        const streakData = await getLoginStreak(userId);
        const now = Date.now();
        const lastClaim = streakData.lastClaim;
        const timeSinceLastClaim = now - lastClaim;
        const fortyEightHours = 48 * 60 * 60 * 1000;

        let newStreak = 0;

        if (isNewClaim) {
            // Check if streak should continue or reset
            if (timeSinceLastClaim < fortyEightHours && timeSinceLastClaim > 0) {
                // Continue streak
                newStreak = streakData.currentStreak + 1;
            } else {
                // Reset streak (missed a day or first claim)
                newStreak = 1;
            }

            // Update database
            await query(
                `UPDATE users
                 SET login_streak = $1,
                     best_login_streak = GREATEST(best_login_streak, $1),
                     last_streak_claim = $2
                 WHERE discord_id = $3`,
                [newStreak, now, userId]
            );

            // Get updated best streak
            const updatedData = await getLoginStreak(userId);
            return {
                currentStreak: newStreak,
                bestStreak: updatedData.bestStreak,
                wasReset: newStreak === 1 && streakData.currentStreak > 0
            };
        } else {
            // Just checking, not claiming
            if (timeSinceLastClaim >= fortyEightHours && streakData.currentStreak > 0) {
                // Streak expired, reset it
                await query(
                    'UPDATE users SET login_streak = 0 WHERE discord_id = $1',
                    [userId]
                );
                return { currentStreak: 0, bestStreak: streakData.bestStreak, wasReset: true };
            }

            return { ...streakData, wasReset: false };
        }
    } catch (error) {
        console.error('Error updating login streak:', error);
        return { currentStreak: 0, bestStreak: 0, wasReset: false };
    }
}

// Calculate streak bonus multiplier
function getStreakMultiplier(streak) {
    if (streak <= 1) return 1.0;
    if (streak === 2) return 1.2;
    if (streak === 3) return 1.5;
    if (streak === 4) return 1.8;
    if (streak === 5) return 2.2;
    if (streak === 6) return 2.5;
    if (streak >= 7 && streak < 14) return 3.0;
    if (streak >= 14 && streak < 30) return 5.0;
    if (streak >= 30) return 10.0;
    return 1.0;
}

// Get next milestone for streak
function getNextStreakMilestone(currentStreak) {
    const milestones = [2, 3, 5, 7, 14, 30];
    for (const milestone of milestones) {
        if (currentStreak < milestone) {
            return milestone;
        }
    }
    return null; // Max milestone reached
}

module.exports = {
    getLoginStreak,
    updateLoginStreak,
    getStreakMultiplier,
    getNextStreakMilestone
};
