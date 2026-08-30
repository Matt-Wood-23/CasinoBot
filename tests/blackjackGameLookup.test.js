/**
 * Tests for resolving which blackjack game a button click belongs to.
 *
 * Games are filed under a user id (single player) or a channel id (tables),
 * while every render targets the message that was clicked. When those two
 * disagree, one hand's cards get drawn onto another hand's message — two games
 * appearing to swap cards. These tests pin the message down as the thing that
 * decides which game a click acts on.
 */

jest.mock('../database/queries', () => ({
    getUserMoney: jest.fn(() => Promise.resolve(1000)),
    setUserMoney: jest.fn(() => Promise.resolve(null)),
    recordGameResult: jest.fn(() => Promise.resolve()),
    getServerJackpot: jest.fn(() => Promise.resolve(null)),
    resetJackpot: jest.fn(() => Promise.resolve(true)),
    addToJackpot: jest.fn(() => Promise.resolve(true)),
    isGamblingBanned: jest.fn(() => Promise.resolve(false)),
    getGamblingBanTime: jest.fn(() => Promise.resolve(0))
}));

jest.mock('../utils/guildXP', () => ({
    awardGameXP: jest.fn(() => Promise.resolve()),
    awardWagerXP: jest.fn(() => Promise.resolve())
}));

jest.mock('../utils/eventIntegration', () => ({
    recordGameToEvents: jest.fn(() => Promise.resolve())
}));

jest.mock('../utils/blackjackTiming', () => ({
    INITIAL_DEAL_DELAY: 0,
    DEALER_REVEAL_DELAY: 0,
    DEALER_DRAW_DELAY: 0,
    DEALER_RESULT_DELAY: 0
}));

const { handleBlackjackButtons, findGameByMessage } = require('../handlers/buttons/blackjackButtons');
const BlackjackGame = require('../gameLogic/blackjackGame');
const Card = require('../gameLogic/card');

const CHANNEL = 'channel-1';

// Multiplayer games arm a 30s turn timer when they are played, which would
// otherwise keep the Jest process alive after the run.
const createdGames = [];
afterEach(() => {
    for (const game of createdGames.splice(0)) {
        if (game.turnTimer) clearTimeout(game.turnTimer);
    }
});

/** A dealt, playable game bound to a message. */
function dealtGame({ messageId, creatorId = 'player1', multiPlayer = false, cards }) {
    const game = new BlackjackGame(CHANNEL, creatorId, 100, multiPlayer);
    game.messageId = messageId;
    createdGames.push(game);

    let i = 0;
    const sequence = cards || [
        new Card(5, 'hearts'), new Card(6, 'spades'),   // player 11
        new Card(9, 'clubs'), new Card(4, 'diamonds')   // dealer 9 up
    ];
    jest.spyOn(game.deck, 'drawCard').mockImplementation(
        () => sequence[i++] ?? new Card(2, 'hearts')
    );
    for (let p = 0; p < 5; p++) game.dealNextCard();
    return game;
}

function fakeInteraction({ messageId, userId = 'player1', customId = 'hit' }) {
    const replies = [];
    const edits = [];
    return {
        replies,
        edits,
        customId,
        channelId: CHANNEL,
        user: { id: userId },
        message: {
            id: messageId,
            edit: payload => { edits.push(payload); return Promise.resolve(); }
        },
        reply: payload => { replies.push(payload); return Promise.resolve(); },
        followUp: payload => { replies.push(payload); return Promise.resolve(); },
        deferUpdate: () => Promise.resolve()
    };
}

const client = { users: { cache: { get: () => ({ username: 'Someone' }) } } };

describe('findGameByMessage', () => {
    test('picks the game bound to that message', () => {
        const games = new Map();
        const oldGame = dealtGame({ messageId: 'msg-old' });
        const newGame = dealtGame({ messageId: 'msg-new' });
        games.set('player1', newGame);
        games.set(CHANNEL, oldGame);

        expect(findGameByMessage(games, 'msg-old')).toBe(oldGame);
        expect(findGameByMessage(games, 'msg-new')).toBe(newGame);
    });

    test('ignores entries that are not blackjack games', () => {
        const games = new Map();
        // Duel challenges and other games share the same map.
        games.set('duel_challenge_a_b', { messageId: 'msg-1', bet: 100 });
        expect(findGameByMessage(games, 'msg-1')).toBeNull();
    });

    test('returns null for an unknown or missing message', () => {
        const games = new Map([['player1', dealtGame({ messageId: 'msg-1' })]]);
        expect(findGameByMessage(games, 'msg-other')).toBeNull();
        expect(findGameByMessage(games, null)).toBeNull();
    });
});

describe('button clicks act on the game the message belongs to', () => {
    test('a click on a stale message is refused, not repainted', async () => {
        // The player abandoned a hand, then started a new one. The old message
        // still carries live Hit/Stand buttons.
        const currentGame = dealtGame({ messageId: 'msg-new' });
        const activeGames = new Map([['player1', currentGame]]);

        const interaction = fakeInteraction({ messageId: 'msg-old' });
        await handleBlackjackButtons(interaction, activeGames, client, jest.fn());

        expect(interaction.edits).toHaveLength(0); // the old message is left alone
        expect(interaction.replies).toHaveLength(1);
        expect(interaction.replies[0].content).toMatch(/earlier hand/i);
        // ...and the current hand was not touched.
        expect(currentGame.players.get('player1').hands[0].cards).toHaveLength(2);
    });

    test('a click on the live message plays that hand', async () => {
        const currentGame = dealtGame({ messageId: 'msg-new' });
        const activeGames = new Map([['player1', currentGame]]);

        const interaction = fakeInteraction({ messageId: 'msg-new' });
        await handleBlackjackButtons(interaction, activeGames, client, jest.fn());

        expect(interaction.edits.length).toBeGreaterThan(0);
        expect(currentGame.players.get('player1').hands[0].cards).toHaveLength(3);
    });

    test('a table click plays the table hand, not the clicker\'s solo hand', async () => {
        // The bug: the user key is checked first, so this click used to resolve
        // the solo game and draw its cards onto the table's message.
        const soloGame = dealtGame({ messageId: 'msg-solo' });
        const tableGame = dealtGame({ messageId: 'msg-table', multiPlayer: true });

        const activeGames = new Map([
            ['player1', soloGame],
            [CHANNEL, tableGame]
        ]);

        const interaction = fakeInteraction({ messageId: 'msg-table' });
        await handleBlackjackButtons(interaction, activeGames, client, jest.fn());

        expect(tableGame.players.get('player1').hands[0].cards).toHaveLength(3);
        expect(soloGame.players.get('player1').hands[0].cards).toHaveLength(2);
    });

    test('a solo click plays the solo hand while a table is also open', async () => {
        const soloGame = dealtGame({ messageId: 'msg-solo' });
        const tableGame = dealtGame({ messageId: 'msg-table', multiPlayer: true });

        const activeGames = new Map([
            ['player1', soloGame],
            [CHANNEL, tableGame]
        ]);

        const interaction = fakeInteraction({ messageId: 'msg-solo' });
        await handleBlackjackButtons(interaction, activeGames, client, jest.fn());

        expect(soloGame.players.get('player1').hands[0].cards).toHaveLength(3);
        expect(tableGame.players.get('player1').hands[0].cards).toHaveLength(2);
    });

    test('a duel click resolves the duel, not a solo hand in the same channel', async () => {
        const soloGame = dealtGame({ messageId: 'msg-solo' });
        const duel = new BlackjackGame(CHANNEL, 'player1', 100, true, true);
        duel.addPlayer('player2', 100);
        duel.messageId = 'msg-duel';
        createdGames.push(duel);
        let i = 0;
        const cards = [
            new Card(5, 'hearts'), new Card(7, 'clubs'),
            new Card(6, 'spades'), new Card(8, 'diamonds')
        ];
        jest.spyOn(duel.deck, 'drawCard').mockImplementation(() => cards[i++] ?? new Card(2, 'hearts'));
        for (let p = 0; p < 5; p++) duel.dealNextCard();

        const activeGames = new Map([
            ['player1', soloGame],
            [`duel_game_${duel.gameId}`, duel]
        ]);

        const interaction = fakeInteraction({ messageId: 'msg-duel' });
        await handleBlackjackButtons(interaction, activeGames, client, jest.fn());

        expect(duel.players.get('player1').hands[0].cards).toHaveLength(3);
        expect(soloGame.players.get('player1').hands[0].cards).toHaveLength(2);
    });

    test('an unbound game still resolves, so older games keep working', async () => {
        const game = dealtGame({ messageId: 'msg-1' });
        game.messageId = null; // created before games were bound to messages
        const activeGames = new Map([['player1', game]]);

        const interaction = fakeInteraction({ messageId: 'msg-anything' });
        await handleBlackjackButtons(interaction, activeGames, client, jest.fn());

        expect(game.players.get('player1').hands[0].cards).toHaveLength(3);
    });
});
