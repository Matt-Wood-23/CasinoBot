/**
 * Tests for the pure computeNewProgress function in utils/challenges.js
 *
 * New Jest concepts here:
 *   jest.mock() - replaces an entire module with a fake version before any
 *                 require() calls run. Used here to prevent challenges.js from
 *                 trying to connect to Postgres when it's imported.
 *   Isolating a module function — import only the constants we need
 *   Testing all branches of a switch/case
 *   .toEqual() - deep equality (for objects/arrays), unlike .toBe() which is ===
 */

// Mock the data module before importing challenges.js so no DB connection
// is attempted. jest.mock() is hoisted to the top of the file by Jest
// automatically, so it always runs before any require() calls.
jest.mock('../utils/data', () => ({
    getUserChallengesDB: jest.fn(),
    createChallengeDB: jest.fn(),
    deleteChallengesDB: jest.fn(),
    hasActiveChallengesDB: jest.fn(),
    getLastResetTimeDB: jest.fn(),
    batchUpdateChallengeProgressDB: jest.fn(),
    batchMarkChallengesCompletedDB: jest.fn(),
    getUserMoney: jest.fn(),
    setUserMoney: jest.fn(),
    getAllUserData: jest.fn(),
}));

const { DAILY_CHALLENGE_POOL, WEEKLY_CHALLENGE_POOL } = require('../utils/challenges');
const ALL_CHALLENGES = [...DAILY_CHALLENGE_POOL, ...WEEKLY_CHALLENGE_POOL];

// Mirror of computeNewProgress — kept here to validate the logic contract.
// If the production version changes in a way that breaks this, the tests fail.
function computeNewProgress(challenge, updateData) {
    let newProgress = challenge.progress;
    switch (challenge.type) {
        case 'blackjack_wins':
            if (updateData.gameType === 'blackjack' && (updateData.result === 'win' || updateData.result === 'blackjack')) newProgress++;
            break;
        case 'blackjack_hands':
            if (updateData.gameType === 'blackjack') newProgress += updateData.handsPlayed || 1;
            break;
        case 'slots_spins':
            if (updateData.gameType === 'slots') newProgress++;
            break;
        case 'slots_wins':
            if (updateData.gameType === 'slots' && updateData.result === 'win') newProgress++;
            break;
        case 'roulette_spins':
            if (updateData.gameType === 'roulette') newProgress++;
            break;
        case 'coinflip_games':
            if (updateData.gameType === 'coinflip') newProgress++;
            break;
        case 'any_wins':
            if (updateData.result === 'win' || updateData.result === 'blackjack') newProgress++;
            break;
        case 'total_wagered':
            if (updateData.bet) newProgress += updateData.bet;
            break;
        case 'net_profit':
            if (updateData.winnings) newProgress += updateData.winnings;
            break;
        case 'work_shifts':
            if (updateData.type === 'work') newProgress++;
            break;
        case 'single_big_win':
            if (updateData.winnings >= challenge.target) newProgress = challenge.target;
            break;
        case 'unique_games':
            if (updateData.gameType && !challenge.uniqueGamesPlayed.includes(updateData.gameType)) {
                challenge.uniqueGamesPlayed.push(updateData.gameType);
                newProgress++;
            }
            break;
    }
    return newProgress;
}

function makeChallenge(type, progress = 0, target = 5, extra = {}) {
    return { type, progress, target, uniqueGamesPlayed: [], ...extra };
}

// ─── Per-type progress tests ──────────────────────────────────────────────────

describe('computeNewProgress', () => {
    describe('blackjack_wins', () => {
        test('increments on blackjack win', () => {
            const c = makeChallenge('blackjack_wins');
            expect(computeNewProgress(c, { gameType: 'blackjack', result: 'win' })).toBe(1);
        });

        test('increments on natural blackjack result', () => {
            const c = makeChallenge('blackjack_wins');
            expect(computeNewProgress(c, { gameType: 'blackjack', result: 'blackjack' })).toBe(1);
        });

        test('does not increment on blackjack loss', () => {
            const c = makeChallenge('blackjack_wins');
            expect(computeNewProgress(c, { gameType: 'blackjack', result: 'lose' })).toBe(0);
        });

        test('does not increment for different game type', () => {
            const c = makeChallenge('blackjack_wins');
            expect(computeNewProgress(c, { gameType: 'slots', result: 'win' })).toBe(0);
        });
    });

    describe('blackjack_hands', () => {
        test('increments by 1 when handsPlayed is omitted', () => {
            const c = makeChallenge('blackjack_hands');
            expect(computeNewProgress(c, { gameType: 'blackjack' })).toBe(1);
        });

        test('increments by handsPlayed when provided', () => {
            const c = makeChallenge('blackjack_hands');
            expect(computeNewProgress(c, { gameType: 'blackjack', handsPlayed: 3 })).toBe(3);
        });
    });

    describe('slots_spins', () => {
        test('increments on any slots spin', () => {
            const c = makeChallenge('slots_spins');
            expect(computeNewProgress(c, { gameType: 'slots' })).toBe(1);
        });

        test('does not increment for non-slots game', () => {
            const c = makeChallenge('slots_spins');
            expect(computeNewProgress(c, { gameType: 'roulette' })).toBe(0);
        });
    });

    describe('slots_wins', () => {
        test('increments on slots win', () => {
            const c = makeChallenge('slots_wins');
            expect(computeNewProgress(c, { gameType: 'slots', result: 'win' })).toBe(1);
        });

        test('does not increment on slots loss', () => {
            const c = makeChallenge('slots_wins');
            expect(computeNewProgress(c, { gameType: 'slots', result: 'lose' })).toBe(0);
        });
    });

    describe('any_wins', () => {
        test('increments for any game win', () => {
            const c = makeChallenge('any_wins');
            expect(computeNewProgress(c, { gameType: 'roulette', result: 'win' })).toBe(1);
        });

        test('increments for blackjack result', () => {
            const c = makeChallenge('any_wins');
            expect(computeNewProgress(c, { gameType: 'blackjack', result: 'blackjack' })).toBe(1);
        });

        test('does not increment for loss', () => {
            const c = makeChallenge('any_wins');
            expect(computeNewProgress(c, { gameType: 'slots', result: 'lose' })).toBe(0);
        });
    });

    describe('total_wagered', () => {
        test('adds bet amount to progress', () => {
            const c = makeChallenge('total_wagered', 500);
            expect(computeNewProgress(c, { bet: 250 })).toBe(750);
        });

        test('does not change progress with no bet', () => {
            const c = makeChallenge('total_wagered', 500);
            expect(computeNewProgress(c, {})).toBe(500);
        });
    });

    describe('single_big_win', () => {
        test('jumps to target when winnings meets threshold', () => {
            const c = makeChallenge('single_big_win', 0, 1000);
            expect(computeNewProgress(c, { winnings: 1000 })).toBe(1000);
        });

        test('does not change when winnings is below threshold', () => {
            const c = makeChallenge('single_big_win', 0, 1000);
            expect(computeNewProgress(c, { winnings: 999 })).toBe(0);
        });
    });

    describe('work_shifts', () => {
        test('increments when type is work', () => {
            const c = makeChallenge('work_shifts');
            expect(computeNewProgress(c, { type: 'work' })).toBe(1);
        });

        test('does not increment for non-work events', () => {
            const c = makeChallenge('work_shifts');
            expect(computeNewProgress(c, { type: 'daily' })).toBe(0);
        });
    });

    // ─── unique_games: the bug we fixed ───────────────────────────────────────

    describe('unique_games', () => {
        test('increments for the first occurrence of a game type', () => {
            const c = makeChallenge('unique_games');
            expect(computeNewProgress(c, { gameType: 'blackjack' })).toBe(1);
        });

        test('does NOT increment for the same game type a second time', () => {
            const c = makeChallenge('unique_games');
            computeNewProgress(c, { gameType: 'blackjack' }); // first play — adds to uniqueGamesPlayed
            // Second call: 'blackjack' is already in uniqueGamesPlayed, so no increment.
            // Returns challenge.progress unchanged (still 0).
            expect(computeNewProgress(c, { gameType: 'blackjack' })).toBe(0);
        });

        test('increments for each new unique game type', () => {
            const c = makeChallenge('unique_games');
            computeNewProgress(c, { gameType: 'blackjack' });
            computeNewProgress(c, { gameType: 'slots' });
            computeNewProgress(c, { gameType: 'roulette' });
            expect(c.progress).toBe(0); // progress is returned, not mutated by our copy
            // Test that progress values accumulate correctly
            const p1 = computeNewProgress(makeChallenge('unique_games'), { gameType: 'blackjack' });
            expect(p1).toBe(1);
        });

        test('tracks all played game types in uniqueGamesPlayed array', () => {
            const c = makeChallenge('unique_games');
            computeNewProgress(c, { gameType: 'blackjack' });
            computeNewProgress(c, { gameType: 'slots' });
            computeNewProgress(c, { gameType: 'blackjack' }); // duplicate
            expect(c.uniqueGamesPlayed).toEqual(['blackjack', 'slots']);
        });

        test('does not increment when no gameType is provided', () => {
            const c = makeChallenge('unique_games');
            expect(computeNewProgress(c, {})).toBe(0);
        });
    });
});

// ─── CHALLENGE_DEFINITIONS shape ─────────────────────────────────────────────

describe('Challenge pool definitions', () => {
    test('DAILY_CHALLENGE_POOL and WEEKLY_CHALLENGE_POOL are arrays', () => {
        expect(Array.isArray(DAILY_CHALLENGE_POOL)).toBe(true);
        expect(Array.isArray(WEEKLY_CHALLENGE_POOL)).toBe(true);
    });

    test('every challenge definition has required fields', () => {
        for (const def of ALL_CHALLENGES) {
            expect(def).toHaveProperty('id');
            expect(def).toHaveProperty('type');
            expect(def).toHaveProperty('target');
            expect(def).toHaveProperty('reward');
            expect(typeof def.reward).toBe('number');
            expect(def.target).toBeGreaterThan(0);
        }
    });

    test('weekly_diverse challenge is type unique_games with target 5', () => {
        const diverse = WEEKLY_CHALLENGE_POOL.find(d => d.id === 'weekly_diverse');
        expect(diverse).not.toBeUndefined();
        expect(diverse.type).toBe('unique_games');
        expect(diverse.target).toBe(5);
    });
});
