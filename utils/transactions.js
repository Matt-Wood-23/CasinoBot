/**
 * Transaction tracking utilities
 * Provides functions to record and query user transaction history
 */

const { query } = require('../database/connection');

/**
 * Transaction types enum
 */
const TransactionTypes = {
    LOAN_TAKEN: 'loan_taken',
    LOAN_REPAYMENT: 'loan_repayment',
    GIFT_SENT: 'gift_sent',
    GIFT_RECEIVED: 'gift_received',
    SHOP_PURCHASE: 'shop_purchase',
    PROPERTY_PURCHASE: 'property_purchase',
    VIP_PURCHASE: 'vip_purchase',
    ADMIN_GIVE: 'admin_give',
    ADMIN_TAKE: 'admin_take',
    WORK: 'work',
    DAILY: 'daily',
    WEEKLY: 'weekly',
    WELFARE: 'welfare',
    GAME_WIN: 'game_win',
    GAME_LOSS: 'game_loss'
};

/**
 * Records a transaction in the database
 * @param {Object} transaction - Transaction details
 * @param {string} transaction.userId - User's Discord ID
 * @param {string} transaction.type - Transaction type (from TransactionTypes)
 * @param {number} transaction.amount - Amount (positive for gains, negative for losses)
 * @param {number} transaction.balanceAfter - User's balance after transaction
 * @param {string} transaction.relatedUserId - Optional related user ID (for gifts, admin actions)
 * @param {string} transaction.description - Human-readable description
 * @param {Object} transaction.metadata - Optional additional data
 * @returns {Promise<boolean>} Success status
 */
async function recordTransaction({
    userId,
    type,
    amount,
    balanceAfter,
    relatedUserId = null,
    description,
    metadata = null
}) {
    try {
        await query(
            `INSERT INTO transactions
             (user_id, transaction_type, amount, balance_after, related_user_id, description, metadata, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                userId,
                type,
                amount,
                balanceAfter,
                relatedUserId,
                description,
                metadata ? JSON.stringify(metadata) : null,
                Date.now()
            ]
        );
        return true;
    } catch (error) {
        console.error('Error recording transaction:', error);
        return false;
    }
}

/**
 * Gets transaction history for a user
 * @param {string} userId - User's Discord ID
 * @param {Object} options - Query options
 * @param {number} options.limit - Maximum number of transactions to return (default 50)
 * @param {number} options.offset - Number of transactions to skip (for pagination)
 * @param {string} options.type - Filter by transaction type
 * @param {number} options.startDate - Filter transactions after this timestamp
 * @param {number} options.endDate - Filter transactions before this timestamp
 * @returns {Promise<Array>} Array of transaction records
 */
async function getUserTransactions(userId, options = {}) {
    const {
        limit = 50,
        offset = 0,
        type = null,
        startDate = null,
        endDate = null
    } = options;

    try {
        let queryStr = 'SELECT * FROM transactions WHERE user_id = $1';
        const params = [userId];
        let paramIndex = 2;

        if (type) {
            queryStr += ` AND transaction_type = $${paramIndex}`;
            params.push(type);
            paramIndex++;
        }

        if (startDate) {
            queryStr += ` AND created_at >= $${paramIndex}`;
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            queryStr += ` AND created_at <= $${paramIndex}`;
            params.push(endDate);
            paramIndex++;
        }

        queryStr += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);

        const result = await query(queryStr, params);
        return result.rows || [];
    } catch (error) {
        console.error('Error getting user transactions:', error);
        return [];
    }
}

/**
 * Gets transaction statistics for a user
 * @param {string} userId - User's Discord ID
 * @param {Object} options - Query options
 * @param {number} options.startDate - Start of date range
 * @param {number} options.endDate - End of date range
 * @returns {Promise<Object>} Transaction statistics
 */
async function getTransactionStats(userId, options = {}) {
    const {
        startDate = null,
        endDate = null
    } = options;

    try {
        let queryStr = `
            SELECT
                transaction_type,
                COUNT(*) as count,
                SUM(amount) as total_amount,
                AVG(amount) as avg_amount,
                MIN(amount) as min_amount,
                MAX(amount) as max_amount
            FROM transactions
            WHERE user_id = $1
        `;
        const params = [userId];
        let paramIndex = 2;

        if (startDate) {
            queryStr += ` AND created_at >= $${paramIndex}`;
            params.push(startDate);
            paramIndex++;
        }

        if (endDate) {
            queryStr += ` AND created_at <= $${paramIndex}`;
            params.push(endDate);
            paramIndex++;
        }

        queryStr += ' GROUP BY transaction_type';

        const result = await query(queryStr, params);
        return result.rows || [];
    } catch (error) {
        console.error('Error getting transaction stats:', error);
        return [];
    }
}

/**
 * Gets the count of transactions for a user
 * @param {string} userId - User's Discord ID
 * @param {Object} options - Query options
 * @param {string} options.type - Filter by transaction type
 * @returns {Promise<number>} Transaction count
 */
async function getTransactionCount(userId, options = {}) {
    const { type = null } = options;

    try {
        let queryStr = 'SELECT COUNT(*) as count FROM transactions WHERE user_id = $1';
        const params = [userId];

        if (type) {
            queryStr += ' AND transaction_type = $2';
            params.push(type);
        }

        const result = await query(queryStr, params);
        return parseInt(result.rows[0]?.count || 0);
    } catch (error) {
        console.error('Error getting transaction count:', error);
        return 0;
    }
}

module.exports = {
    TransactionTypes,
    recordTransaction,
    getUserTransactions,
    getTransactionStats,
    getTransactionCount
};
