const { query, getClient } = require('../connection');

// Get user heist stats
async function getUserHeistStats(userId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return null;

        const dbUserId = userResult.rows[0].id;

        // Ensure heist stats row exists
        await query(
            `INSERT INTO user_heist_stats (user_id)
             VALUES ($1)
             ON CONFLICT (user_id) DO NOTHING`,
            [dbUserId]
        );

        const result = await query(
            `SELECT last_heist, cooldown_until, total_heists, successful_heists, total_earned, total_lost, biggest_score
             FROM user_heist_stats
             WHERE user_id = $1`,
            [dbUserId]
        );

        if (result.rows.length === 0) return null;

        const row = result.rows[0];
        return {
            lastHeist: parseInt(row.last_heist) || 0,
            cooldownUntil: parseInt(row.cooldown_until) || 0,
            totalHeists: parseInt(row.total_heists) || 0,
            successfulHeists: parseInt(row.successful_heists) || 0,
            totalEarned: parseInt(row.total_earned) || 0,
            totalLost: parseInt(row.total_lost) || 0,
            biggestScore: parseInt(row.biggest_score) || 0
        };
    } catch (error) {
        console.error('Error getting user heist stats:', error);
        return null;
    }
}

// Update heist cooldown
async function updateHeistCooldown(userId, cooldownUntil) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const dbUserId = userResult.rows[0].id;

        // Ensure heist stats row exists
        await query(
            `INSERT INTO user_heist_stats (user_id)
             VALUES ($1)
             ON CONFLICT (user_id) DO NOTHING`,
            [dbUserId]
        );

        await query(
            `UPDATE user_heist_stats
             SET cooldown_until = $1, last_heist = $2
             WHERE user_id = $3`,
            [cooldownUntil, Date.now(), dbUserId]
        );

        return true;
    } catch (error) {
        console.error('Error updating heist cooldown:', error);
        return false;
    }
}

// Record heist attempt
async function recordHeistAttempt(userId, success, amount) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const dbUserId = userResult.rows[0].id;

        // Ensure heist stats row exists
        await query(
            `INSERT INTO user_heist_stats (user_id)
             VALUES ($1)
             ON CONFLICT (user_id) DO NOTHING`,
            [dbUserId]
        );

        if (success) {
            // Update successful heist stats
            await query(
                `UPDATE user_heist_stats
                 SET total_heists = total_heists + 1,
                     successful_heists = successful_heists + 1,
                     total_earned = total_earned + $1,
                     biggest_score = GREATEST(biggest_score, $1)
                 WHERE user_id = $2`,
                [amount, dbUserId]
            );
        } else {
            // Update failed heist stats
            await query(
                `UPDATE user_heist_stats
                 SET total_heists = total_heists + 1,
                     total_lost = total_lost + $1
                 WHERE user_id = $2`,
                [amount, dbUserId]
            );
        }

        return true;
    } catch (error) {
        console.error('Error recording heist attempt:', error);
        return false;
    }
}

// Get heist debt
async function getHeistDebt(userId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return 0;

        const dbUserId = userResult.rows[0].id;

        // Ensure debt row exists
        await query(
            `INSERT INTO user_heist_debt (user_id)
             VALUES ($1)
             ON CONFLICT (user_id) DO NOTHING`,
            [dbUserId]
        );

        const result = await query(
            'SELECT debt_amount FROM user_heist_debt WHERE user_id = $1',
            [dbUserId]
        );

        if (result.rows.length === 0) return 0;

        return parseInt(result.rows[0].debt_amount) || 0;
    } catch (error) {
        console.error('Error getting heist debt:', error);
        return 0;
    }
}

// Add heist debt
async function addHeistDebt(userId, amount) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const dbUserId = userResult.rows[0].id;

        // Ensure debt row exists
        await query(
            `INSERT INTO user_heist_debt (user_id)
             VALUES ($1)
             ON CONFLICT (user_id) DO NOTHING`,
            [dbUserId]
        );

        await query(
            `UPDATE user_heist_debt
             SET debt_amount = debt_amount + $1,
                 total_debt_incurred = total_debt_incurred + $1
             WHERE user_id = $2`,
            [amount, dbUserId]
        );

        return true;
    } catch (error) {
        console.error('Error adding heist debt:', error);
        return false;
    }
}

// Pay heist debt
async function payHeistDebt(userId, amount) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return null;

        const dbUserId = userResult.rows[0].id;

        // Ensure debt row exists
        await query(
            `INSERT INTO user_heist_debt (user_id)
             VALUES ($1)
             ON CONFLICT (user_id) DO NOTHING`,
            [dbUserId]
        );

        // Get current debt
        const debtResult = await query(
            'SELECT debt_amount FROM user_heist_debt WHERE user_id = $1',
            [dbUserId]
        );

        const currentDebt = parseInt(debtResult.rows[0].debt_amount) || 0;

        if (currentDebt === 0) {
            return { success: false, message: "You don't have any heist debt!" };
        }

        const payment = Math.min(amount, currentDebt);

        // Update debt
        await query(
            `UPDATE user_heist_debt
             SET debt_amount = debt_amount - $1,
                 total_debt_repaid = total_debt_repaid + $1,
                 last_payment_date = $2
             WHERE user_id = $3`,
            [payment, Date.now(), dbUserId]
        );

        return {
            success: true,
            payment,
            remainingDebt: currentDebt - payment
        };
    } catch (error) {
        console.error('Error paying heist debt:', error);
        return null;
    }
}

// Get guild heist stats
async function getGuildHeistStats(guildId) {
    try {
        // Get the database guild ID from guild_id string
        const guildResult = await query(
            'SELECT id FROM guilds WHERE guild_id = $1',
            [guildId]
        );

        if (guildResult.rows.length === 0) return null;

        const dbGuildId = guildResult.rows[0].id;

        // Ensure guild heist stats row exists
        await query(
            `INSERT INTO guild_heist_stats (guild_id)
             VALUES ($1)
             ON CONFLICT (guild_id) DO NOTHING`,
            [dbGuildId]
        );

        const result = await query(
            `SELECT last_heist, cooldown_until, total_heists, successful_heists
             FROM guild_heist_stats
             WHERE guild_id = $1`,
            [dbGuildId]
        );

        if (result.rows.length === 0) return null;

        const row = result.rows[0];
        return {
            lastHeist: parseInt(row.last_heist) || 0,
            cooldownUntil: parseInt(row.cooldown_until) || 0,
            totalHeists: parseInt(row.total_heists) || 0,
            successfulHeists: parseInt(row.successful_heists) || 0
        };
    } catch (error) {
        console.error('Error getting guild heist stats:', error);
        return null;
    }
}

// Update guild heist cooldown
async function updateGuildHeistCooldown(guildId, cooldownUntil) {
    try {
        // Get the database guild ID from guild_id string
        const guildResult = await query(
            'SELECT id FROM guilds WHERE guild_id = $1',
            [guildId]
        );

        if (guildResult.rows.length === 0) return false;

        const dbGuildId = guildResult.rows[0].id;

        // Ensure guild heist stats row exists
        await query(
            `INSERT INTO guild_heist_stats (guild_id)
             VALUES ($1)
             ON CONFLICT (guild_id) DO NOTHING`,
            [dbGuildId]
        );

        await query(
            `UPDATE guild_heist_stats
             SET cooldown_until = $1, last_heist = $2
             WHERE guild_id = $3`,
            [cooldownUntil, Date.now(), dbGuildId]
        );

        return true;
    } catch (error) {
        console.error('Error updating guild heist cooldown:', error);
        return false;
    }
}

// Get all user heist stats (for leaderboards)
async function getAllUserHeistStats() {
    try {
        const result = await query(
            `SELECT u.discord_id, uhs.last_heist, uhs.cooldown_until, uhs.total_heists,
                    uhs.successful_heists, uhs.total_earned, uhs.total_lost, uhs.biggest_score
             FROM user_heist_stats uhs
             JOIN users u ON u.id = uhs.user_id
             WHERE uhs.total_heists > 0
             ORDER BY uhs.successful_heists DESC`
        );

        return result.rows.map(row => ({
            userId: row.discord_id,
            lastHeist: parseInt(row.last_heist) || 0,
            cooldownUntil: parseInt(row.cooldown_until) || 0,
            totalHeists: parseInt(row.total_heists) || 0,
            successfulHeists: parseInt(row.successful_heists) || 0,
            totalEarned: parseInt(row.total_earned) || 0,
            totalLost: parseInt(row.total_lost) || 0,
            biggestScore: parseInt(row.biggest_score) || 0,
            successRate: row.total_heists > 0
                ? ((parseInt(row.successful_heists) / parseInt(row.total_heists)) * 100)
                : 0
        }));
    } catch (error) {
        console.error('Error getting all user heist stats:', error);
        return [];
    }
}

// Record guild heist attempt
async function recordGuildHeistAttempt(guildId, participantIds, success) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Get the database guild ID from guild_id string
        const guildResult = await client.query(
            'SELECT id FROM guilds WHERE guild_id = $1',
            [guildId]
        );

        if (guildResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return false;
        }

        const dbGuildId = guildResult.rows[0].id;

        // Ensure guild heist stats row exists
        await client.query(
            `INSERT INTO guild_heist_stats (guild_id)
             VALUES ($1)
             ON CONFLICT (guild_id) DO NOTHING`,
            [dbGuildId]
        );

        // Update guild stats
        if (success) {
            await client.query(
                `UPDATE guild_heist_stats
                 SET total_heists = total_heists + 1,
                     successful_heists = successful_heists + 1
                 WHERE guild_id = $1`,
                [dbGuildId]
            );
        } else {
            await client.query(
                `UPDATE guild_heist_stats
                 SET total_heists = total_heists + 1
                 WHERE guild_id = $1`,
                [dbGuildId]
            );
        }

        // Update user statistics for guild heists
        for (const userId of participantIds) {
            const userResult = await client.query(
                'SELECT id FROM users WHERE discord_id = $1',
                [userId]
            );

            if (userResult.rows.length > 0) {
                const dbUserId = userResult.rows[0].id;

                if (success) {
                    await client.query(
                        `UPDATE user_statistics
                         SET guild_heists_participated = guild_heists_participated + 1,
                             guild_heists_won = guild_heists_won + 1
                         WHERE user_id = $1`,
                        [dbUserId]
                    );
                } else {
                    await client.query(
                        `UPDATE user_statistics
                         SET guild_heists_participated = guild_heists_participated + 1
                         WHERE user_id = $1`,
                        [dbUserId]
                    );
                }
            }
        }

        await client.query('COMMIT');
        return true;
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error recording guild heist attempt:', error);
        return false;
    } finally {
        client.release();
    }
}

module.exports = {
    getUserHeistStats,
    updateHeistCooldown,
    recordHeistAttempt,
    getHeistDebt,
    addHeistDebt,
    payHeistDebt,
    getGuildHeistStats,
    updateGuildHeistCooldown,
    recordGuildHeistAttempt,
    getAllUserHeistStats
};
