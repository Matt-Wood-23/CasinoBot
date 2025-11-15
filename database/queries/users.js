const { query, getClient } = require('../connection');

// In-memory storage for pending notifications (cleared on retrieval)
// This mimics the old JSON behavior where notifications were stored temporarily
const pendingNotifications = new Map();

// Helper function to convert snake_case to camelCase
function snakeToCamel(str) {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Helper function to recursively convert object keys from snake_case to camelCase
function convertKeysToCamelCase(obj) {
    if (obj === null || obj === undefined) return obj;

    if (Array.isArray(obj)) {
        return obj.map(item => convertKeysToCamelCase(item));
    }

    if (typeof obj === 'object' && obj.constructor === Object) {
        const converted = {};
        for (const [key, value] of Object.entries(obj)) {
            const camelKey = snakeToCamel(key);
            converted[camelKey] = convertKeysToCamelCase(value);
        }
        return converted;
    }

    return obj;
}

// Initialize database - called on bot startup
async function loadUserData() {
    try {
        const result = await query('SELECT COUNT(*) FROM users');
        console.log(`Database loaded successfully with ${result.rows[0].count} users`);
    } catch (error) {
        console.error('Error loading user data:', error);
        throw error;
    }
}

// No longer needed with database (auto-saves), but keeping for compatibility
async function saveUserData() {
    // Database auto-saves, so this is a no-op
    console.log('Database auto-save (no action needed)');
}

// Get or create user and return money
async function getUserMoney(userId) {
    try {
        // Try to get existing user
        let result = await query(
            'SELECT money FROM users WHERE discord_id = $1',
            [userId]
        );

        if (result.rows.length === 0) {
            // User doesn't exist, create new user
            const client = await getClient();
            try {
                await client.query('BEGIN');

                // Insert user
                const userResult = await client.query(
                    `INSERT INTO users (discord_id, money, last_daily, last_work, credit_score)
                     VALUES ($1, 500, 0, 0, 500)
                     RETURNING id, money`,
                    [userId]
                );

                const newUserId = userResult.rows[0].id;

                // Insert default statistics
                await client.query(
                    `INSERT INTO user_statistics (user_id)
                     VALUES ($1)`,
                    [newUserId]
                );

                await client.query('COMMIT');
                console.log(`Created new user: ${userId}`);

                return 500; // Default starting money
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
        }

        return parseInt(result.rows[0].money);
    } catch (error) {
        console.error('Error getting user money:', error);
        throw error;
    }
}

// Set user money - returns loan deduction info if applicable
async function setUserMoney(userId, amount) {
    try {
        await getUserMoney(userId); // Ensure user exists

        const oldMoneyResult = await query(
            'SELECT money FROM users WHERE discord_id = $1',
            [userId]
        );
        const oldMoney = parseInt(oldMoneyResult.rows[0].money);
        const newMoney = Math.max(0, Math.floor(amount));

        // If money increased (winnings), check for loan deduction
        if (newMoney > oldMoney) {
            // Check for active loan
            const loanResult = await query(
                `SELECT l.id, l.amount_owed FROM loans l
                 JOIN users u ON u.id = l.user_id
                 WHERE u.discord_id = $1 AND l.is_active = TRUE
                 ORDER BY l.id DESC LIMIT 1`,
                [userId]
            );

            if (loanResult.rows.length > 0) {
                const { deductFromWinnings } = require('../../utils/loanSystem');
                const winnings = newMoney - oldMoney;

                const { deducted, remaining } = await deductFromWinnings(userId, winnings);

                if (deducted > 0) {
                    const finalMoney = Math.max(0, Math.floor(oldMoney + remaining));
                    await query(
                        'UPDATE users SET money = $1 WHERE discord_id = $2',
                        [finalMoney, userId]
                    );
                    console.log(`Auto-deducted ${deducted} from ${userId}'s winnings for loan payment`);

                    // Return loan deduction info
                    return {
                        loanDeducted: deducted,
                        actualReceived: remaining
                    };
                }
            }
        }

        // Normal money update (no loan deduction)
        await query(
            'UPDATE users SET money = $1 WHERE discord_id = $2',
            [newMoney, userId]
        );

        // Return no deduction
        return {
            loanDeducted: 0,
            actualReceived: newMoney - oldMoney
        };
    } catch (error) {
        console.error('Error setting user money:', error);
        throw error;
    }
}

// Check if user can claim daily
async function canClaimDaily(userId) {
    await getUserMoney(userId); // Ensure user exists

    const result = await query(
        'SELECT last_daily FROM users WHERE discord_id = $1',
        [userId]
    );

    const lastDaily = parseInt(result.rows[0].last_daily) || 0;
    const now = Date.now();
    const timeSinceLastDaily = now - lastDaily;
    const oneDayInMs = 24 * 60 * 60 * 1000;

    return timeSinceLastDaily >= oneDayInMs;
}

// Set last daily timestamp
async function setLastDaily(userId, timestamp = null) {
    await getUserMoney(userId); // Ensure user exists

    const time = timestamp !== null ? timestamp : Date.now();
    await query(
        'UPDATE users SET last_daily = $1 WHERE discord_id = $2',
        [time, userId]
    );
}

// Set last work timestamp
async function setLastWork(userId, timestamp = null) {
    await getUserMoney(userId); // Ensure user exists

    const time = timestamp !== null ? timestamp : Date.now();
    await query(
        'UPDATE users SET last_work = $1 WHERE discord_id = $2',
        [time, userId]
    );
}

// Get time until next daily
async function getTimeUntilNextDaily(userId) {
    const result = await query(
        'SELECT last_daily FROM users WHERE discord_id = $1',
        [userId]
    );

    if (result.rows.length === 0) return 0;

    const lastDaily = parseInt(result.rows[0].last_daily) || 0;
    const now = Date.now();
    const oneDayInMs = 24 * 60 * 60 * 1000;
    const timeUntilNext = oneDayInMs - (now - lastDaily);

    return Math.max(0, timeUntilNext);
}

// Get all user data (for leaderboards, etc.)
async function getAllUserData() {
    try {
        const result = await query(
            `SELECT
                u.discord_id,
                u.money,
                u.last_daily,
                u.last_work,
                u.credit_score,
                u.gifts_received,
                u.gifts_sent,
                u.total_gifts_received,
                u.total_gifts_sent,
                row_to_json(s.*) as statistics
             FROM users u
             LEFT JOIN user_statistics s ON s.user_id = u.id`
        );

        // Convert to old format: { discordId: userData }
        const userData = {};
        for (const row of result.rows) {
            userData[row.discord_id] = {
                money: parseInt(row.money),
                lastDaily: parseInt(row.last_daily),
                lastWork: parseInt(row.last_work),
                creditScore: parseInt(row.credit_score),
                giftsReceived: parseInt(row.gifts_received),
                giftsSent: parseInt(row.gifts_sent),
                totalGiftsReceived: parseInt(row.total_gifts_received),
                totalGiftsSent: parseInt(row.total_gifts_sent),
                statistics: convertKeysToCamelCase(row.statistics) || {}
            };
        }

        return userData;
    } catch (error) {
        console.error('Error getting all user data:', error);
        throw error;
    }
}

// Get single user data
async function getUserData(userId) {
    try {
        const result = await query(
            `SELECT
                u.*,
                row_to_json(s.*) as statistics,
                (SELECT json_agg(gh.* ORDER BY gh.timestamp DESC)
                 FROM game_history gh
                 WHERE gh.user_id = u.id) as game_history,
                (SELECT row_to_json(l.*)
                 FROM loans l
                 WHERE l.user_id = u.id AND l.is_active = TRUE
                 ORDER BY l.id DESC LIMIT 1) as active_loan,
                (SELECT json_agg(l.* ORDER BY l.taken_at DESC)
                 FROM loans l
                 WHERE l.user_id = u.id) as loan_history
             FROM users u
             LEFT JOIN user_statistics s ON s.user_id = u.id
             WHERE u.discord_id = $1`,
            [userId]
        );

        if (result.rows.length === 0) return null;

        const row = result.rows[0];

        // Convert all nested objects from snake_case to camelCase for compatibility
        return {
            money: parseInt(row.money),
            lastDaily: parseInt(row.last_daily),
            lastWork: parseInt(row.last_work),
            creditScore: parseInt(row.credit_score),
            giftsReceived: parseInt(row.gifts_received),
            giftsSent: parseInt(row.gifts_sent),
            totalGiftsReceived: parseInt(row.total_gifts_received),
            totalGiftsSent: parseInt(row.total_gifts_sent),
            statistics: convertKeysToCamelCase(row.statistics) || {},
            gameHistory: convertKeysToCamelCase(row.game_history) || [],
            activeLoan: convertKeysToCamelCase(row.active_loan) || null,
            loanHistory: convertKeysToCamelCase(row.loan_history) || []
        };
    } catch (error) {
        console.error('Error getting user data:', error);
        throw error;
    }
}

// Update user gifts
async function updateUserGifts(senderId, receiverId, amount) {
    await getUserMoney(senderId); // Ensure both users exist
    await getUserMoney(receiverId);

    await query(
        'UPDATE users SET gifts_sent = gifts_sent + 1, total_gifts_sent = total_gifts_sent + $1 WHERE discord_id = $2',
        [amount, senderId]
    );

    await query(
        'UPDATE users SET gifts_received = gifts_received + 1, total_gifts_received = total_gifts_received + $1 WHERE discord_id = $2',
        [amount, receiverId]
    );
}

// Clean user data (not needed with database, but keeping for compatibility)
function cleanUserData() {
    console.log('cleanUserData() called - not needed with database (data integrity ensured by schema)');
}

// Get and clear pending notifications
function getPendingNotifications(userId) {
    if (!pendingNotifications.has(userId)) {
        return { achievements: [], challenges: [], messages: [] };
    }

    const notifications = pendingNotifications.get(userId);
    pendingNotifications.delete(userId);

    return notifications;
}

// Store a boost notification message
function storeBoostNotification(userId, notification) {
    if (!pendingNotifications.has(userId)) {
        pendingNotifications.set(userId, { achievements: [], challenges: [], messages: [] });
    }

    const notifications = pendingNotifications.get(userId);
    if (!notifications.messages) {
        notifications.messages = [];
    }
    notifications.messages.push(notification);
}

module.exports = {
    snakeToCamel,
    convertKeysToCamelCase,
    loadUserData,
    saveUserData,
    getUserMoney,
    setUserMoney,
    getUserData,
    getAllUserData,
    canClaimDaily,
    setLastDaily,
    setLastWork,
    getTimeUntilNextDaily,
    updateUserGifts,
    cleanUserData,
    getPendingNotifications,
    storeBoostNotification,
    pendingNotifications
};
