const { query } = require('../connection');
const { getUserMoney } = require('./users');

// Get active loan for user
async function getActiveLoan(userId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return null;

        const dbUserId = userResult.rows[0].id;

        const result = await query(
            `SELECT id, amount, interest_rate, amount_owed, original_amount, due_date, taken_at, repaid_amount
             FROM loans
             WHERE user_id = $1 AND is_active = TRUE
             ORDER BY id DESC LIMIT 1`,
            [dbUserId]
        );

        if (result.rows.length === 0) return null;

        const loan = result.rows[0];
        return {
            id: loan.id,
            principalAmount: parseInt(loan.amount),
            interestRate: parseFloat(loan.interest_rate),
            totalOwed: parseInt(loan.amount_owed),
            amountPaid: parseInt(loan.repaid_amount),
            dueDate: parseInt(loan.due_date),
            takenDate: parseInt(loan.taken_at),
            daysOverdue: 0 // Will be calculated
        };
    } catch (error) {
        console.error('Error getting active loan:', error);
        return null;
    }
}

// Create a new loan
async function createLoanDB(userId, amount, interestRate, totalOwed, dueDate) {
    try {
        await getUserMoney(userId); // Ensure user exists

        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );
        const dbUserId = userResult.rows[0].id;

        const result = await query(
            `INSERT INTO loans (user_id, amount, interest_rate, amount_owed, original_amount, due_date, taken_at, is_active, repaid_amount)
             VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, 0)
             RETURNING id`,
            [dbUserId, amount, interestRate, totalOwed, amount, dueDate, Date.now()]
        );

        return result.rows[0].id;
    } catch (error) {
        console.error('Error creating loan:', error);
        return null;
    }
}

// Update loan payment
async function updateLoanPayment(userId, paymentAmount) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return null;

        const dbUserId = userResult.rows[0].id;

        // Get current loan
        const loanResult = await query(
            `SELECT id, amount_owed, repaid_amount
             FROM loans
             WHERE user_id = $1 AND is_active = TRUE
             ORDER BY id DESC LIMIT 1`,
            [dbUserId]
        );

        if (loanResult.rows.length === 0) return null;

        const loan = loanResult.rows[0];
        const newPaidAmount = parseInt(loan.repaid_amount) + paymentAmount;
        const remaining = parseInt(loan.amount_owed) - newPaidAmount;

        await query(
            'UPDATE loans SET repaid_amount = $1 WHERE id = $2',
            [newPaidAmount, loan.id]
        );

        return {
            payment: paymentAmount,
            remaining: Math.max(0, remaining),
            paidOff: remaining <= 0
        };
    } catch (error) {
        console.error('Error updating loan payment:', error);
        return null;
    }
}

// Mark loan as repaid
async function markLoanRepaid(userId, wasOnTime) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const dbUserId = userResult.rows[0].id;

        await query(
            `UPDATE loans
             SET is_active = FALSE, repaid_at = $1, was_defaulted = $2
             WHERE user_id = $3 AND is_active = TRUE`,
            [Date.now(), !wasOnTime, dbUserId]
        );

        return true;
    } catch (error) {
        console.error('Error marking loan repaid:', error);
        return false;
    }
}

// Update credit score
async function updateCreditScore(userId, change) {
    try {
        await getUserMoney(userId); // Ensure user exists

        await query(
            `UPDATE users
             SET credit_score = GREATEST(0, LEAST(1000, credit_score + $1))
             WHERE discord_id = $2`,
            [change, userId]
        );

        return true;
    } catch (error) {
        console.error('Error updating credit score:', error);
        return false;
    }
}

// Get credit score
async function getCreditScore(userId) {
    try {
        const result = await query(
            'SELECT credit_score FROM users WHERE discord_id = $1',
            [userId]
        );

        if (result.rows.length === 0) return 500; // Default

        return parseInt(result.rows[0].credit_score);
    } catch (error) {
        console.error('Error getting credit score:', error);
        return 500;
    }
}

// Update overdue loan (add additional interest and fees)
async function updateOverdueLoan(userId, additionalAmount, daysOverdue) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const dbUserId = userResult.rows[0].id;

        await query(
            `UPDATE loans
             SET amount_owed = amount_owed + $1
             WHERE user_id = $2 AND is_active = TRUE`,
            [additionalAmount, dbUserId]
        );

        return true;
    } catch (error) {
        console.error('Error updating overdue loan:', error);
        return false;
    }
}

// Get all overdue loans
async function getOverdueLoans() {
    try {
        const result = await query(
            `SELECT u.discord_id, l.id, l.amount, l.amount_owed, l.due_date, l.repaid_amount, l.taken_at
             FROM loans l
             JOIN users u ON u.id = l.user_id
             WHERE l.is_active = TRUE AND l.due_date < $1`,
            [Date.now()]
        );

        return result.rows.map(row => ({
            userId: row.discord_id,
            loanId: row.id,
            principalAmount: parseInt(row.amount),
            totalOwed: parseInt(row.amount_owed),
            dueDate: parseInt(row.due_date),
            amountPaid: parseInt(row.repaid_amount),
            takenDate: parseInt(row.taken_at),
            daysOverdue: Math.floor((Date.now() - parseInt(row.due_date)) / (24 * 60 * 60 * 1000))
        }));
    } catch (error) {
        console.error('Error getting overdue loans:', error);
        return [];
    }
}

module.exports = {
    getActiveLoan,
    createLoanDB,
    updateLoanPayment,
    markLoanRepaid,
    updateCreditScore,
    getCreditScore,
    updateOverdueLoan,
    getOverdueLoans
};
