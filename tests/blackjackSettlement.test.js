/**
 * Tests for utils/blackjackSettlement.js
 *
 * The database, holiday events, guild XP and event tracking are all mocked, so
 * these tests are about one thing: a finished hand is paid out exactly once,
 * with the right amount, no matter how many code paths race into it.
 */

jest.mock('../database/queries', () => ({
    getUserMoney: jest.fn(),
    setUserMoney: jest.fn(),
    recordGameResult: jest.fn(),
    getServerJackpot: jest.fn(),
    resetJackpot: jest.fn()
}));

jest.mock('../utils/holidayEvents', () => ({
    applyHolidayWinningsBonus: jest.fn(winnings => winnings)
}));

jest.mock('../utils/guildXP', () => ({
    awardGameXP: jest.fn(() => Promise.resolve()),
    awardWagerXP: jest.fn(() => Promise.resolve())
}));

jest.mock('../utils/eventIntegration', () => ({
    recordGameToEvents: jest.fn(() => Promise.resolve())
}));

const queries = require('../database/queries');
const { settleBlackjackGame } = require('../utils/blackjackSettlement');
const BlackjackGame = require('../gameLogic/blackjackGame');
const Card = require('../gameLogic/card');

const STARTING_BALANCE = 1000;

/** A finished single-player hand with the given cards already on the table. */
function finishedGame(playerCards, dealerCards, bet = 100) {
    const game = new BlackjackGame('ch', 'player1', bet, false);
    game.players.get('player1').hands[0].cards = playerCards;
    game.dealer.cards = dealerCards;
    game.dealerHoleCard = null;
    game.dealingPhase = 5;
    game.gameOver = true;
    return game;
}

beforeEach(() => {
    jest.clearAllMocks();
    queries.getUserMoney.mockResolvedValue(STARTING_BALANCE);
    queries.setUserMoney.mockResolvedValue(null);
    queries.recordGameResult.mockResolvedValue(undefined);
    queries.getServerJackpot.mockResolvedValue(null);
    queries.resetJackpot.mockResolvedValue(true);
});

describe('settleBlackjackGame', () => {
    test('a winning hand returns the stake and pays even money', async () => {
        const game = finishedGame(
            [new Card(10, 'hearts'), new Card(9, 'spades')],  // 19
            [new Card(10, 'clubs'), new Card(8, 'diamonds')]  // 18
        );

        expect(await settleBlackjackGame(game)).toBe(true);
        // Stake (100) came back plus 100 in winnings.
        expect(queries.setUserMoney).toHaveBeenCalledWith('player1', STARTING_BALANCE + 200);
    });

    test('a losing hand leaves the balance where the stake left it', async () => {
        const game = finishedGame(
            [new Card(10, 'hearts'), new Card(6, 'spades')],  // 16
            [new Card(10, 'clubs'), new Card(9, 'diamonds')]  // 19
        );

        await settleBlackjackGame(game);
        expect(queries.setUserMoney).toHaveBeenCalledWith('player1', STARTING_BALANCE);
    });

    test('a natural blackjack pays 3:2', async () => {
        const game = finishedGame(
            [new Card(14, 'hearts'), new Card(13, 'spades')], // A+K
            [new Card(10, 'clubs'), new Card(9, 'diamonds')]  // 19
        );

        await settleBlackjackGame(game);
        expect(queries.setUserMoney).toHaveBeenCalledWith('player1', STARTING_BALANCE + 250);
    });

    test('settles only once, however many callers race into it', async () => {
        const game = finishedGame(
            [new Card(10, 'hearts'), new Card(9, 'spades')],
            [new Card(10, 'clubs'), new Card(8, 'diamonds')]
        );

        const [first, ...rest] = await Promise.all([
            settleBlackjackGame(game),
            settleBlackjackGame(game),
            settleBlackjackGame(game)
        ]);

        expect(first).toBe(true);
        expect(rest).toEqual([false, false]);
        expect(queries.setUserMoney).toHaveBeenCalledTimes(1);
        expect(queries.recordGameResult).toHaveBeenCalledTimes(1);
    });

    test('a sequential second call is also a no-op', async () => {
        const game = finishedGame(
            [new Card(10, 'hearts'), new Card(9, 'spades')],
            [new Card(10, 'clubs'), new Card(8, 'diamonds')]
        );

        expect(await settleBlackjackGame(game)).toBe(true);
        expect(await settleBlackjackGame(game)).toBe(false);
        expect(queries.setUserMoney).toHaveBeenCalledTimes(1);
    });

    test('refuses to settle a hand that is still in play', async () => {
        const game = finishedGame(
            [new Card(10, 'hearts'), new Card(9, 'spades')],
            [new Card(10, 'clubs'), new Card(8, 'diamonds')]
        );
        game.gameOver = false;

        expect(await settleBlackjackGame(game)).toBe(false);
        expect(queries.setUserMoney).not.toHaveBeenCalled();
    });

    test('awards the progressive jackpot on a natural blackjack', async () => {
        queries.getServerJackpot.mockResolvedValue({ currentAmount: 5000 });

        const game = finishedGame(
            [new Card(14, 'hearts'), new Card(13, 'spades')],
            [new Card(10, 'clubs'), new Card(9, 'diamonds')]
        );
        game.serverId = 'guild1';

        await settleBlackjackGame(game);

        expect(queries.setUserMoney).toHaveBeenLastCalledWith('player1', STARTING_BALANCE + 250 + 5000);
        expect(queries.resetJackpot).toHaveBeenCalledWith('guild1', 'player1', 5000);
        expect(game.jackpotAmount).toBe(5000);
    });

    test('a split hand making 21 does not claim the jackpot', async () => {
        queries.getServerJackpot.mockResolvedValue({ currentAmount: 5000 });

        const game = finishedGame(
            [new Card(14, 'hearts'), new Card(13, 'spades')], // A+K, but split
            [new Card(10, 'clubs'), new Card(9, 'diamonds')]
        );
        const player = game.players.get('player1');
        player.hasSplit = true;
        player.hands.push({ cards: [new Card(14, 'clubs'), new Card(9, 'hearts')], bet: 100 });
        game.serverId = 'guild1';

        await settleBlackjackGame(game);

        expect(queries.resetJackpot).not.toHaveBeenCalled();
        // Two winning hands at even money: 2 × (100 stake + 100 winnings).
        expect(queries.setUserMoney).toHaveBeenCalledWith('player1', STARTING_BALANCE + 400);
    });

    test('the jackpot is only paid to one player per game', async () => {
        queries.getServerJackpot.mockResolvedValue({ currentAmount: 5000 });

        const game = new BlackjackGame('ch', 'player1', 100, true);
        game.addPlayer('player2', 100);
        game.serverId = 'guild1';
        for (const player of game.players.values()) {
            player.hands[0].cards = [new Card(14, 'hearts'), new Card(13, 'spades')];
        }
        game.dealer.cards = [new Card(10, 'clubs'), new Card(9, 'diamonds')];
        game.dealingPhase = 5;
        game.gameOver = true;

        await settleBlackjackGame(game);

        expect(queries.resetJackpot).toHaveBeenCalledTimes(1);
    });

    test('a duel pays the whole pot to the winner', async () => {
        const game = new BlackjackGame('ch', 'player1', 100, true, true);
        game.addPlayer('player2', 100);
        game.players.get('player1').hands[0].cards = [new Card(10, 'hearts'), new Card(10, 'spades')]; // 20
        game.players.get('player2').hands[0].cards = [new Card(10, 'clubs'), new Card(8, 'diamonds')]; // 18
        game.gameOver = true;

        await settleBlackjackGame(game);

        expect(queries.setUserMoney).toHaveBeenCalledTimes(1);
        expect(queries.setUserMoney).toHaveBeenCalledWith('player1', STARTING_BALANCE + 200);
        expect(game.pvpResult).toEqual({ winnerId: 'player1', amount: 200 });
    });

    test('a duel that ties refunds both stakes', async () => {
        const game = new BlackjackGame('ch', 'player1', 100, true, true);
        game.addPlayer('player2', 100);
        for (const player of game.players.values()) {
            player.hands[0].cards = [new Card(10, 'hearts'), new Card(9, 'spades')];
        }
        game.gameOver = true;

        await settleBlackjackGame(game);

        expect(queries.setUserMoney).toHaveBeenCalledTimes(2);
        expect(queries.setUserMoney).toHaveBeenCalledWith('player1', STARTING_BALANCE + 100);
        expect(queries.setUserMoney).toHaveBeenCalledWith('player2', STARTING_BALANCE + 100);
        expect(game.pvpResult).toEqual({ isPush: true });
    });

    test('the holiday bonus reaches every payout path', async () => {
        const { applyHolidayWinningsBonus } = require('../utils/holidayEvents');
        applyHolidayWinningsBonus.mockImplementation(w => (w > 0 ? w * 2 : w));

        const game = finishedGame(
            [new Card(10, 'hearts'), new Card(9, 'spades')],
            [new Card(10, 'clubs'), new Card(8, 'diamonds')]
        );

        await settleBlackjackGame(game);
        // 100 stake back, 100 winnings doubled to 200.
        expect(queries.setUserMoney).toHaveBeenCalledWith('player1', STARTING_BALANCE + 300);
    });
});
