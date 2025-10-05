const { getUserData, saveUserData } = require('./data');

// Calculate max loan amount based on credit score
function getMaxLoanAmount(creditScore) {
    if (creditScore >= 800) return 5000;
    if (creditScore >= 600) return 3000;
    if (creditScore >= 400) return 1500;
    if (creditScore >= 200) return 750;
    return 500; // Minimum for very bad credit
}

// Calculate interest rate based on credit score and loan amount
function getInterestRate(creditScore, loanAmount) {
    let baseRate = 10; // 10% base

    // Credit score affects rate
    if (creditScore < 300) baseRate += 10; // +10% for terrible credit
    else if (creditScore < 500) baseRate += 5; // +5% for bad credit
    else if (creditScore >= 700) baseRate -= 3; // -3% for good credit
    else if (creditScore >= 850) baseRate -= 5; // -5% for excellent credit

    // Larger loans have slightly higher rates
    if (loanAmount >= 3000) baseRate += 2;
    else if (loanAmount >= 1500) baseRate += 1;

    return Math.max(5, Math.min(25, baseRate)); // Between 5% and 25%
}

// Calculate repayment days based on loan amount
function getRepaymentDays(loanAmount) {
    if (loanAmount >= 3000) return 7;
    if (loanAmount >= 1500) return 5;
    return 3;
}

// Check if user can get a loan
function canGetLoan(userId) {
    const userData = getUserData(userId);
    if (!userData) return { canLoan: false, reason: 'User not found' };

    if (userData.activeLoan) {
        return { canLoan: false, reason: 'You already have an active loan!' };
    }

    return { canLoan: true };
}

// Create a new loan
async function createLoan(userId, amount) {
    const userData = getUserData(userId);
    if (!userData) return null;

    const interestRate = getInterestRate(userData.creditScore, amount);
    const interest = Math.floor(amount * (interestRate / 100));
    const totalOwed = amount + interest;
    const repaymentDays = getRepaymentDays(amount);
    const dueDate = Date.now() + (repaymentDays * 24 * 60 * 60 * 1000);

    userData.activeLoan = {
        principalAmount: amount,
        interestRate: interestRate,
        interestAmount: interest,
        totalOwed: totalOwed,
        amountPaid: 0,
        dueDate: dueDate,
        takenDate: Date.now(),
        daysOverdue: 0,
        originalDueDays: repaymentDays
    };

    await saveUserData();
    return userData.activeLoan;
}

// Make a loan payment
async function makePayment(userId, amount) {
    const userData = getUserData(userId);
    if (!userData || !userData.activeLoan) return null;

    const loan = userData.activeLoan;
    const payment = Math.min(amount, loan.totalOwed - loan.amountPaid);

    loan.amountPaid += payment;

    const remaining = loan.totalOwed - loan.amountPaid;

    // Loan fully paid
    if (remaining <= 0) {
        const wasOnTime = Date.now() <= loan.dueDate;

        // Update credit score
        if (wasOnTime) {
            userData.creditScore = Math.min(1000, userData.creditScore + 25); // +25 for on-time payment
        } else if (loan.daysOverdue <= 2) {
            userData.creditScore = Math.max(0, userData.creditScore - 10); // -10 for slightly late
        } else {
            userData.creditScore = Math.max(0, userData.creditScore - 50); // -50 for very late
        }

        // Add to history
        userData.loanHistory.push({
            amount: loan.principalAmount,
            paidOnTime: wasOnTime,
            daysOverdue: loan.daysOverdue,
            date: Date.now()
        });

        userData.activeLoan = null;
    }

    await saveUserData();
    return { payment, remaining, paidOff: remaining <= 0 };
}

// Check and update overdue loans (run daily)
async function checkOverdueLoans() {
    const allUserData = require('./data').getAllUserData();
    const overdueUsers = [];

    for (const [userId, userData] of Object.entries(allUserData)) {
        if (userData.activeLoan && Date.now() > userData.activeLoan.dueDate) {
            const daysOverdue = Math.floor((Date.now() - userData.activeLoan.dueDate) / (24 * 60 * 60 * 1000));
            userData.activeLoan.daysOverdue = daysOverdue;

            // Escalating interest: +5% per day overdue
            const additionalInterest = Math.floor(userData.activeLoan.principalAmount * 0.05 * daysOverdue);
            userData.activeLoan.totalOwed = userData.activeLoan.principalAmount + userData.activeLoan.interestAmount + additionalInterest;

            // Decrease credit score daily
            userData.creditScore = Math.max(0, userData.creditScore - 5);

            overdueUsers.push({
                userId,
                daysOverdue,
                totalOwed: userData.activeLoan.totalOwed
            });
        }
    }

    if (overdueUsers.length > 0) {
        await saveUserData();
    }

    return overdueUsers;
}

// Auto-deduct from winnings
async function deductFromWinnings(userId, winnings) {
    const userData = getUserData(userId);
    if (!userData || !userData.activeLoan || winnings <= 0) {
        return { deducted: 0, remaining: winnings };
    }

    const loan = userData.activeLoan;
    const remaining = loan.totalOwed - loan.amountPaid;

    // Take 50% of winnings for loan payment
    const deduction = Math.min(Math.floor(winnings * 0.5), remaining);

    if (deduction > 0) {
        await makePayment(userId, deduction);
    }

    return { deducted: deduction, remaining: winnings - deduction };
}

// Check if user can play games
function canPlayGames(userId) {
    const userData = getUserData(userId);
    if (!userData || !userData.activeLoan) return { canPlay: true };

    const loan = userData.activeLoan;

    // If overdue by 3+ days, can't play
    if (loan.daysOverdue >= 3) {
        return {
            canPlay: false,
            reason: `Your loan is ${loan.daysOverdue} days overdue! You must repay ${(loan.totalOwed - loan.amountPaid).toLocaleString()} to play games.`
        };
    }

    return { canPlay: true };
}

module.exports = {
    getMaxLoanAmount,
    getInterestRate,
    getRepaymentDays,
    canGetLoan,
    createLoan,
    makePayment,
    checkOverdueLoans,
    deductFromWinnings,
    canPlayGames
};
