/**
 * Tests for pure functions in utils/loanSystem.js
 *
 * These functions have no DB calls so they can be tested directly.
 * Jest concepts used here:
 *   describe() - groups related tests together
 *   test() / it() - a single test case (both are identical)
 *   expect() - makes an assertion
 *   .toBe() - strict equality (===)
 *   .toBeGreaterThanOrEqual() - numeric comparison
 *   .toBeLessThanOrEqual() - numeric comparison
 */

const {
    getMaxLoanAmount,
    getInterestRate,
    getRepaymentDays,
} = require('../utils/loanSystem');

// ─── getMaxLoanAmount ────────────────────────────────────────────────────────

describe('getMaxLoanAmount', () => {
    test('returns 5000 for excellent credit (800+)', () => {
        expect(getMaxLoanAmount(800)).toBe(5000);
        expect(getMaxLoanAmount(1000)).toBe(5000);
    });

    test('returns 3000 for good credit (600-799)', () => {
        expect(getMaxLoanAmount(600)).toBe(3000);
        expect(getMaxLoanAmount(799)).toBe(3000);
    });

    test('returns 1500 for fair credit (400-599)', () => {
        expect(getMaxLoanAmount(400)).toBe(1500);
        expect(getMaxLoanAmount(599)).toBe(1500);
    });

    test('returns 750 for poor credit (200-399)', () => {
        expect(getMaxLoanAmount(200)).toBe(750);
        expect(getMaxLoanAmount(399)).toBe(750);
    });

    test('returns 500 for very bad credit (0-199)', () => {
        expect(getMaxLoanAmount(0)).toBe(500);
        expect(getMaxLoanAmount(199)).toBe(500);
    });
});

// ─── getInterestRate ─────────────────────────────────────────────────────────

describe('getInterestRate', () => {
    test('stays within 5-25% bounds regardless of inputs', () => {
        // Worst case: terrible credit, large loan
        const worst = getInterestRate(0, 5000);
        expect(worst).toBeGreaterThanOrEqual(5);
        expect(worst).toBeLessThanOrEqual(25);

        // Best case: excellent credit, small loan
        const best = getInterestRate(900, 100);
        expect(best).toBeGreaterThanOrEqual(5);
        expect(best).toBeLessThanOrEqual(25);
    });

    test('excellent credit gets lower rate than terrible credit', () => {
        const goodRate = getInterestRate(850, 500);
        const badRate = getInterestRate(200, 500);
        expect(goodRate).toBeLessThan(badRate);
    });

    test('large loans cost more than small loans at same credit score', () => {
        const smallLoanRate = getInterestRate(500, 500);
        const largeLoanRate = getInterestRate(500, 3000);
        expect(largeLoanRate).toBeGreaterThanOrEqual(smallLoanRate);
    });

    test('terrible credit (< 300) adds 10% to base rate', () => {
        // Base 10% + 10% penalty = 20%, no loan size bump for small amount
        expect(getInterestRate(100, 500)).toBe(20);
    });

    test('good credit (>= 700) subtracts 3% from base rate', () => {
        // Base 10% - 3% = 7%, no loan size bump for small amount
        expect(getInterestRate(700, 500)).toBe(7);
    });
});

// ─── getRepaymentDays ────────────────────────────────────────────────────────

describe('getRepaymentDays', () => {
    test('large loans (3000+) get 7 days', () => {
        expect(getRepaymentDays(3000)).toBe(7);
        expect(getRepaymentDays(5000)).toBe(7);
    });

    test('medium loans (1500-2999) get 5 days', () => {
        expect(getRepaymentDays(1500)).toBe(5);
        expect(getRepaymentDays(2999)).toBe(5);
    });

    test('small loans (< 1500) get 3 days', () => {
        expect(getRepaymentDays(100)).toBe(3);
        expect(getRepaymentDays(1499)).toBe(3);
    });
});
