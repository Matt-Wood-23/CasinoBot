const { query } = require('../connection');
const { getUserMoney } = require('./users');

// Purchase or renew VIP
async function purchaseVIPDB(userId, tier, expiresAt, isRenewal = false) {
    try {
        await getUserMoney(userId); // Ensure user exists

        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );
        const dbUserId = userResult.rows[0].id;

        // Check if user already has VIP
        const existing = await query(
            'SELECT tier, renewal_count FROM user_vip WHERE user_id = $1',
            [dbUserId]
        );

        if (existing.rows.length > 0) {
            // Update existing VIP
            const renewalCount = isRenewal ? (existing.rows[0].renewal_count + 1) : 0;
            await query(
                `UPDATE user_vip
                 SET tier = $1, expires_at = $2, activated_at = $3, renewal_count = $4, is_active = TRUE
                 WHERE user_id = $5`,
                [tier, expiresAt, Date.now(), renewalCount, dbUserId]
            );
        } else {
            // Insert new VIP
            await query(
                `INSERT INTO user_vip (user_id, tier, activated_at, expires_at, renewal_count, last_weekly_bonus, is_active)
                 VALUES ($1, $2, $3, $4, 0, 0, TRUE)`,
                [dbUserId, tier, Date.now(), expiresAt]
            );
        }

        return true;
    } catch (error) {
        console.error('Error purchasing VIP:', error);
        return false;
    }
}

// Get user's VIP status
async function getUserVIPDB(userId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return null;

        const dbUserId = userResult.rows[0].id;

        const result = await query(
            `SELECT tier, activated_at, expires_at, renewal_count, last_weekly_bonus, is_active
             FROM user_vip
             WHERE user_id = $1`,
            [dbUserId]
        );

        if (result.rows.length === 0) return null;

        const row = result.rows[0];

        return {
            tier: row.tier,
            activatedAt: parseInt(row.activated_at),
            expiresAt: parseInt(row.expires_at),
            renewalCount: parseInt(row.renewal_count),
            lastWeeklyBonus: parseInt(row.last_weekly_bonus),
            isActive: row.is_active
        };
    } catch (error) {
        console.error('Error getting user VIP:', error);
        return null;
    }
}

// Update weekly bonus claim time
async function claimVIPWeeklyBonusDB(userId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const dbUserId = userResult.rows[0].id;

        await query(
            'UPDATE user_vip SET last_weekly_bonus = $1 WHERE user_id = $2',
            [Date.now(), dbUserId]
        );

        return true;
    } catch (error) {
        console.error('Error claiming VIP weekly bonus:', error);
        return false;
    }
}

// Expire VIP for all users (run as a cron job)
async function expireVIPsDB() {
    try {
        const now = Date.now();

        const result = await query(
            `UPDATE user_vip
             SET is_active = FALSE
             WHERE expires_at <= $1 AND is_active = TRUE
             RETURNING (SELECT discord_id FROM users WHERE id = user_vip.user_id) as discord_id, tier`,
            [now]
        );

        return result.rows.map(row => ({
            userId: row.discord_id,
            tier: row.tier
        }));
    } catch (error) {
        console.error('Error expiring VIPs:', error);
        return [];
    }
}

module.exports = {
    purchaseVIPDB,
    getUserVIPDB,
    claimVIPWeeklyBonusDB,
    expireVIPsDB
};
