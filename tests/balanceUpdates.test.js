/**
 * Tests for the atomic balance primitives in database/queries/users.js.
 *
 * The database driver is mocked, so these assert two things about the SQL that
 * gets issued rather than about a real balance:
 *
 *   1. A change is expressed as `money = money + $delta` in one statement, so
 *      the database serialises concurrent updates. The old pattern read the
 *      balance on one connection and wrote an absolute total on another, and
 *      two games finishing at once silently discarded one of the results.
 *   2. No loan work happens while a transaction is open. It used to run inside
 *      `BEGIN; SELECT ... FOR UPDATE`, and the loan payoff path writes to the
 *      same users row on a different pool connection, so it blocked on a lock
 *      its own caller was holding.
 */

const issued = [];          // every query, in order, tagged by connection
let clientReleasedAt = null; // how many queries had run when the client was released

jest.mock('../database/connection', () => ({
    query: jest.fn((text, params) => {
        issued.push({ via: 'pool', text, params });
        if (/SELECT money FROM users/i.test(text)) {
            return Promise.resolve({ rows: [{ money: '1000' }] });
        }
        if (/UPDATE users/i.test(text)) {
            return Promise.resolve({ rows: [{ money: '1200' }] });
        }
        return Promise.resolve({ rows: [] });
    }),
    getClient: jest.fn(() => Promise.resolve({
        query: jest.fn(text => {
            issued.push({ via: 'client', text });
            if (/SELECT money FROM users/i.test(text)) {
                return Promise.resolve({ rows: [{ money: '1000' }] });
            }
            return Promise.resolve({ rows: [] });
        }),
        release: jest.fn(() => { clientReleasedAt = issued.length; })
    }))
}));

const mockDeductFromWinnings = jest.fn(() => Promise.resolve({ deducted: 0, remaining: 0 }));
jest.mock('../utils/loanSystem', () => ({
    deductFromWinnings: (...args) => mockDeductFromWinnings(...args)
}));

const { addUserMoney, setUserMoney, adjustBalance } = require('../database/queries/users');

// SQL is written across several lines, so normalise before matching.
const flat = text => text.replace(/\s+/g, ' ').trim();
const texts = () => issued.map(q => flat(q.text));
const updates = () => issued.filter(q => /UPDATE users SET money/i.test(flat(q.text)));

beforeEach(() => {
    issued.length = 0;
    clientReleasedAt = null;
    jest.clearAllMocks();
    mockDeductFromWinnings.mockResolvedValue({ deducted: 0, remaining: 0 });
});

describe('adjustBalance', () => {
    test('moves the balance with a single relative UPDATE', async () => {
        await adjustBalance('user-1', 250);

        const update = updates()[0];
        expect(flat(update.text)).toContain('money = GREATEST(0, money + $1)');
        expect(update.params).toEqual([250, 'user-1']);
        // No read of the current balance: the arithmetic happens in the database.
        expect(texts().some(t => /^SELECT money FROM users/.test(t))).toBe(false);
    });

    test('floors fractional deltas', async () => {
        await adjustBalance('user-1', 10.9);
        expect(updates()[0].params[0]).toBe(10);
    });

    test('a debit is the same statement with a negative delta', async () => {
        await adjustBalance('user-1', -75);
        expect(updates()[0].params).toEqual([-75, 'user-1']);
    });
});

describe('addUserMoney', () => {
    test('credits with one relative UPDATE, never an absolute write', async () => {
        await addUserMoney('user-1', 500);

        const balanceWrites = updates();
        expect(balanceWrites).toHaveLength(1);
        expect(balanceWrites[0].params).toEqual([500, 'user-1']);
        expect(texts().some(t => /money = \$1/.test(t))).toBe(false);
    });

    test('debits with a negative delta', async () => {
        await addUserMoney('user-1', -200);
        expect(updates()[0].params).toEqual([-200, 'user-1']);
    });

    test('a zero delta writes nothing', async () => {
        await addUserMoney('user-1', 0);
        expect(updates()).toHaveLength(0);
    });

    test('never opens a transaction, so nothing can block on its own lock', async () => {
        await addUserMoney('user-1', 500);
        expect(texts()).not.toContain('BEGIN');
        expect(texts().some(t => /FOR UPDATE/i.test(t))).toBe(false);
    });

    test('a credit is offered to the loan system; a debit is not', async () => {
        await addUserMoney('user-1', 500);
        expect(mockDeductFromWinnings).toHaveBeenCalledWith('user-1', 500);

        mockDeductFromWinnings.mockClear();
        await addUserMoney('user-1', -500);
        expect(mockDeductFromWinnings).not.toHaveBeenCalled();
    });

    test('a loan payment is taken back with a second relative UPDATE', async () => {
        mockDeductFromWinnings.mockResolvedValue({ deducted: 125, remaining: 375 });

        const result = await addUserMoney('user-1', 500);

        expect(updates().map(u => u.params[0])).toEqual([500, -125]);
        expect(result).toEqual({ loanDeducted: 125, actualReceived: 375 });
    });

    test('a failure in the loan system does not undo the credit', async () => {
        mockDeductFromWinnings.mockRejectedValue(new Error('loan table down'));

        const result = await addUserMoney('user-1', 500);

        expect(updates().map(u => u.params[0])).toEqual([500]); // credit stands
        expect(result).toEqual({ loanDeducted: 0, actualReceived: 500 });
    });
});

describe('setUserMoney', () => {
    test('still available for genuinely absolute writes', async () => {
        await setUserMoney('user-1', 0);
        expect(texts()).toContain('BEGIN');
        expect(issued.some(q => q.via === 'client' && /UPDATE users SET money = \$1/.test(flat(q.text)))).toBe(true);
    });

    test('releases its connection before any loan work runs', async () => {
        // 1000 -> 2000 is a credit, so the loan system is consulted.
        mockDeductFromWinnings.mockResolvedValue({ deducted: 250, remaining: 750 });

        const result = await setUserMoney('user-1', 2000);

        // The deadlock: the loan payoff path writes to the same users row on
        // another connection, so it must not run while this one holds the lock.
        expect(clientReleasedAt).not.toBeNull();
        const loanWriteIndex = issued.findIndex(
            (q, i) => i >= clientReleasedAt && /UPDATE users SET money = GREATEST/.test(flat(q.text))
        );
        expect(loanWriteIndex).toBeGreaterThanOrEqual(clientReleasedAt);
        expect(result).toEqual({ loanDeducted: 250, actualReceived: 750 });
    });

    test('a decrease is not treated as winnings', async () => {
        await setUserMoney('user-1', 100); // 1000 -> 100
        expect(mockDeductFromWinnings).not.toHaveBeenCalled();
    });
});
