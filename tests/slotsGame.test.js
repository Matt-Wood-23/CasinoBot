/**
 * Tests for gameLogic/slotsGame.js
 *
 * New Jest concepts here:
 *   jest.spyOn(object, 'method') - wraps a method to observe/control it
 *   mockImplementation() - replace the method's implementation entirely
 *   afterEach(jest.restoreAllMocks) - undo all spies after each test
 *   .toContain() - check array/string contains a value
 *   .toHaveLength() - check array length
 *   .toBeGreaterThan() / .toBe(0) - numeric assertions
 */

const SlotsGame = require('../gameLogic/slotsGame');

// Restore Math.random after each test so spies don't leak between tests
afterEach(() => jest.restoreAllMocks());

// Helper: force the reels to a known state by controlling Math.random
// symbolIndex maps: 0=🍒 1=🍋 2=🍊 3=🍇 4=🔔 5=⭐ 6=7️⃣
function makeGameWithReels(reels) {
    // reels is a 3x3 array: reels[col][row] = symbol string
    const game = new SlotsGame('user1', 100);
    game.reels = reels;
    game.calculateWinnings(); // recalculate with our forced reels
    return game;
}

// ─── Payout table ────────────────────────────────────────────────────────────

describe('SlotsGame payout table', () => {
    test('getPayoutTable returns an object with 7 entries', () => {
        const table = SlotsGame.getPayoutTable();
        expect(Object.keys(table)).toHaveLength(7);
    });

    test('7️⃣7️⃣7️⃣ has the highest multiplier (50x)', () => {
        const table = SlotsGame.getPayoutTable();
        const max = Math.max(...Object.values(table));
        expect(max).toBe(50);
        expect(table['7️⃣7️⃣7️⃣']).toBe(50);
    });

    test('🍒🍒🍒 has the lowest multiplier (2x)', () => {
        const table = SlotsGame.getPayoutTable();
        const min = Math.min(...Object.values(table));
        expect(min).toBe(2);
        expect(table['🍒🍒🍒']).toBe(2);
    });
});

// ─── calculateWinnings ───────────────────────────────────────────────────────

describe('calculateWinnings', () => {
    test('no matching lines → winnings = 0', () => {
        // All different symbols on each payline
        const game = makeGameWithReels([
            ['🍒', '🍋', '🍊'],
            ['🍇', '🔔', '⭐'],
            ['7️⃣', '🍒', '🍋'],
        ]);
        expect(game.winnings).toBe(0);
        expect(game.winningLines).toHaveLength(0);
        expect(game.hasWon()).toBe(false);
    });

    test('middle row triple 🍒 pays 2x bet', () => {
        // reels[col][row], middle row = index 1
        const game = makeGameWithReels([
            ['🍋', '🍒', '🍊'],
            ['🍊', '🍒', '🍋'],
            ['🍇', '🍒', '🍒'],
        ]);
        expect(game.winnings).toBe(200); // 100 bet * 2
        expect(game.winningLines).toHaveLength(1);
        expect(game.hasWon()).toBe(true);
    });

    test('triple 7️⃣ on top line pays 50x bet', () => {
        // Top row (index 0): 7️⃣7️⃣7️⃣ — middle/bottom rows are all different so no extra wins
        const game = makeGameWithReels([
            ['7️⃣', '🍒', '🍊'],
            ['7️⃣', '🍋', '🍇'],
            ['7️⃣', '🍊', '🔔'],
        ]);
        expect(game.winnings).toBe(5000); // 100 bet * 50
        expect(game.winningLines).toHaveLength(1);
    });

    test('two winning lines sum correctly', () => {
        // Top row: 🍒🍒🍒 (2x=200), Middle row: ⭐⭐⭐ (20x=2000)
        const game = makeGameWithReels([
            ['🍒', '⭐', '🍊'],
            ['🍒', '⭐', '🍋'],
            ['🍒', '⭐', '🍒'],
        ]);
        expect(game.winnings).toBe(2200);
        expect(game.winningLines).toHaveLength(2);
    });
});

// ─── getNetProfit ─────────────────────────────────────────────────────────────

describe('getNetProfit', () => {
    test('winning game has positive net profit', () => {
        const game = makeGameWithReels([
            ['7️⃣', '🍒', '🍊'],
            ['7️⃣', '🍋', '🍇'],
            ['7️⃣', '🍊', '🔔'],
        ]);
        expect(game.getNetProfit()).toBe(4900); // 5000 winnings - 100 bet
    });

    test('losing game has negative net profit equal to -bet', () => {
        const game = makeGameWithReels([
            ['🍒', '🍋', '🍊'],
            ['🍇', '🔔', '⭐'],
            ['7️⃣', '🍒', '🍋'],
        ]);
        expect(game.getNetProfit()).toBe(-100);
    });
});

// ─── getPaylineSymbols ────────────────────────────────────────────────────────

describe('getPaylineSymbols', () => {
    test('returns 3 symbols for a valid line index', () => {
        const game = makeGameWithReels([
            ['🍒', '🍋', '🍊'],
            ['🍇', '🔔', '⭐'],
            ['7️⃣', '🍒', '🍋'],
        ]);
        const symbols = game.getPaylineSymbols(0);
        expect(symbols).toHaveLength(3);
        expect(symbols[0]).toBe('🍒');
        expect(symbols[1]).toBe('🍇');
        expect(symbols[2]).toBe('7️⃣');
    });

    test('returns empty array for out-of-bounds line index', () => {
        const game = makeGameWithReels([['🍒','🍋','🍊'],['🍇','🔔','⭐'],['7️⃣','🍒','🍋']]);
        expect(game.getPaylineSymbols(-1)).toHaveLength(0);
        expect(game.getPaylineSymbols(3)).toHaveLength(0);
    });
});
