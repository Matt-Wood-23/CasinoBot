const {
    getActiveLoan,
    createLoanDB,
    updateLoanPayment,
    markLoanRepaid,
    updateCreditScore,
    getCreditScore,
    updateOverdueLoan,
    getOverdueLoans
} = require('./data');

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
async function canGetLoan(userId) {
    const activeLoan = await getActiveLoan(userId);

    if (activeLoan) {
        return { canLoan: false, reason: 'You already have an active loan!' };
    }

    return { canLoan: true };
}

// Create a new loan
async function createLoan(userId, amount) {
    const creditScore = await getCreditScore(userId);

    const interestRate = getInterestRate(creditScore, amount);
    const interest = Math.floor(amount * (interestRate / 100));
    const totalOwed = amount + interest;
    const repaymentDays = getRepaymentDays(amount);
    const dueDate = Date.now() + (repaymentDays * 24 * 60 * 60 * 1000);

    const loanId = await createLoanDB(userId, amount, interestRate, totalOwed, dueDate);

    if (!loanId) return null;

    return {
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
}

// Make a loan payment
async function makePayment(userId, amount) {
    const loan = await getActiveLoan(userId);
    if (!loan) return null;

    const payment = Math.min(amount, loan.totalOwed - loan.amountPaid);

    const result = await updateLoanPayment(userId, payment);
    if (!result) return null;

    // Loan fully paid
    if (result.paidOff) {
        // Calculate days overdue
        const daysOverdue = Math.max(0, Math.floor((Date.now() - loan.dueDate) / (24 * 60 * 60 * 1000)));
        const wasOnTime = daysOverdue === 0;

        // Update credit score
        if (wasOnTime) {
            await updateCreditScore(userId, 25); // +25 for on-time payment
        } else if (daysOverdue <= 2) {
            await updateCreditScore(userId, -10); // -10 for slightly late
        } else {
            await updateCreditScore(userId, -50); // -50 for very late
        }

        // Mark loan as repaid in DB
        await markLoanRepaid(userId, wasOnTime);

        // Check loan achievements
        const { checkLoanAchievements } = require('./achievements');
        await checkLoanAchievements(userId, loan.principalAmount);
    }

    return result;
}

// Check and update overdue loans (run daily)
async function checkOverdueLoans() {
    const overdueLoans = await getOverdueLoans();
    const overdueUsers = [];

    for (const loan of overdueLoans) {
        const daysOverdue = loan.daysOverdue;

        // Escalating interest: +5% per day overdue
        const additionalInterest = Math.floor(loan.principalAmount * 0.05);

        // Update loan with additional interest
        await updateOverdueLoan(loan.userId, additionalInterest, daysOverdue);

        // Decrease credit score daily
        await updateCreditScore(loan.userId, -5);

        overdueUsers.push({
            userId: loan.userId,
            daysOverdue,
            totalOwed: loan.totalOwed + additionalInterest
        });
    }

    return overdueUsers;
}

// Auto-deduct from winnings
async function deductFromWinnings(userId, winnings) {
    const loan = await getActiveLoan(userId);
    if (!loan || winnings <= 0) {
        return { deducted: 0, remaining: winnings };
    }

    const remaining = loan.totalOwed - loan.amountPaid;

    // Take 25% of winnings for loan payment
    const deduction = Math.min(Math.floor(winnings * 0.25), remaining);

    if (deduction > 0) {
        await makePayment(userId, deduction);
    }

    return { deducted: deduction, remaining: winnings - deduction };
}

// Check if user can play games
async function canPlayGames(userId) {
    const loan = await getActiveLoan(userId);
    if (!loan) return { canPlay: true };

    // Calculate days overdue
    const daysOverdue = Math.max(0, Math.floor((Date.now() - loan.dueDate) / (24 * 60 * 60 * 1000)));

    // If overdue by 3+ days, can't play
    if (daysOverdue >= 3) {
        return {
            canPlay: false,
            reason: `Your loan is ${daysOverdue} days overdue! You must repay ${(loan.totalOwed - loan.amountPaid).toLocaleString()} to play games.`
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
