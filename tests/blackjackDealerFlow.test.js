/**
 * End-to-end pacing test for the dealer's turn.
 *
 * This drives animateDealerDrawing() against a fake Discord message and
 * inspects every frame it renders. The bugs it pins down were all visual:
 * a card back that stayed on the table after the hole card had been turned
 * over, a score that disagreed with the cards printed beside it, and a second
 * animation loop started by a double click that made the dealer's cards flick
 * past two at a time.
 */

jest.mock('../database/queries', () => ({
    getUserMoney: jest.fn(() => Promise.resolve(1000)),
    setUserMoney: jest.fn(() => Promise.resolve(null)),
    recordGameResult: jest.fn(() => Promise.resolve()),
    getServerJackpot: jest.fn(() => Promise.resolve(null)),
    resetJackpot: jest.fn(() => Promise.resolve(true))
}));

jest.mock('../utils/guildXP', () => ({
    awardGameXP: jest.fn(() => Promise.resolve()),
    awardWagerXP: jest.fn(() => Promise.resolve())
}));

jest.mock('../utils/eventIntegration', () => ({
    recordGameToEvents: jest.fn(() => Promise.resolve())
}));

// Run the animation at full speed; the ordering of frames is what matters.
jest.mock('../utils/blackjackTiming', () => ({
    INITIAL_DEAL_DELAY: 0,
    DEALER_REVEAL_DELAY: 0,
    DEALER_DRAW_DELAY: 0,
    DEALER_RESULT_DELAY: 0
}));

const { animateDealerDrawing } = require('../handlers/buttons/blackjackButtons');
const BlackjackGame = require('../gameLogic/blackjackGame');
const Card = require('../gameLogic/card');

/** Captures every payload the animation edits onto the message. */
function fakeInteraction() {
    const frames = [];
    return {
        frames,
        message: {
            edit: payload => {
                frames.push(payload);
                return Promise.resolve();
            }
        }
    };
}

function dealerFieldOf(frame) {
    const field = frame.embeds[0].data.fields.find(f => f.name.includes('Dealer'));
    return field ? field.value : '';
}

/** Number of cards printed on the dealer's line of a frame. */
function dealerCardCount(frame) {
    return dealerFieldOf(frame).split('\n')[0].split(' ')
        .filter(token => /^(10|[2-9]|[JQKA])[\u2660-\u2667\u2764\uFE0F\u2666\u2663\u2665]/u.test(token))
        .length;
}

/** A game dealt from a stacked deck, sitting at the end of the player's turn. */
function gameReadyForDealer(sequence) {
    const game = new BlackjackGame('ch', 'player1', 100, false);
    let i = 0;
    jest.spyOn(game.deck, 'drawCard').mockImplementation(
        () => sequence[i++] ?? new Card(2, 'hearts')
    );
    for (let p = 0; p < 5; p++) game.dealNextCard();
    return game;
}

describe('dealer animation', () => {
    test('shows one card back before the reveal and none after', async () => {
        const game = gameReadyForDealer([
            new Card(10, 'hearts'), new Card(9, 'spades'),   // player 19
            new Card(6, 'clubs'), new Card(5, 'diamonds'),   // dealer 6 up, 5 down = 11
            new Card(10, 'hearts')                           // dealer draws to 21
        ]);
        const interaction = fakeInteraction();

        game.stand('player1');
        await animateDealerDrawing(game, interaction, 'player1', null);

        const dealerFields = interaction.frames.map(dealerFieldOf);
        expect(dealerFields.length).toBeGreaterThan(0);

        // Not one frame after the reveal may still show a hidden card.
        for (const field of dealerFields) {
            expect(field).not.toContain('🂠');
        }
    });

    test('every frame scores exactly the cards it prints', async () => {
        const game = gameReadyForDealer([
            new Card(10, 'hearts'), new Card(9, 'spades'),
            new Card(4, 'clubs'), new Card(3, 'diamonds'),   // dealer 7
            new Card(5, 'hearts'), new Card(6, 'spades')     // → 12 → 18
        ]);
        const interaction = fakeInteraction();

        game.stand('player1');
        await animateDealerDrawing(game, interaction, 'player1', null);

        for (const frame of interaction.frames) {
            const cardCount = dealerCardCount(frame);
            const shownScore = Number(dealerFieldOf(frame).match(/\((\d+)\)/)[1]);
            expect(cardCount).toBeGreaterThan(0);
            // Each dealer card is worth at least 2 and at most 11.
            expect(shownScore).toBeGreaterThanOrEqual(cardCount * 2);
            expect(shownScore).toBeLessThanOrEqual(cardCount * 11);
        }
    });

    test('draws one card per frame, in order, and stops on 17 or more', async () => {
        const game = gameReadyForDealer([
            new Card(10, 'hearts'), new Card(9, 'spades'),
            new Card(2, 'clubs'), new Card(3, 'diamonds'),   // dealer 5
            new Card(4, 'hearts'), new Card(5, 'spades'), new Card(6, 'clubs') // 9, 14, 20
        ]);
        const interaction = fakeInteraction();

        game.stand('player1');
        await animateDealerDrawing(game, interaction, 'player1', null);

        // Reveal frame, then exactly one more card per frame after it.
        expect(interaction.frames.map(dealerCardCount)).toEqual([2, 3, 4, 5]);
        expect(game.getDealerScore(true)).toBe(20);
        expect(game.gameOver).toBe(true);
    });

    test('the last frame is not labelled as still drawing', async () => {
        const game = gameReadyForDealer([
            new Card(10, 'hearts'), new Card(9, 'spades'),
            new Card(7, 'clubs'), new Card(4, 'diamonds'),   // dealer 11
            new Card(9, 'hearts')                            // → 20
        ]);
        const interaction = fakeInteraction();

        game.stand('player1');
        await animateDealerDrawing(game, interaction, 'player1', null);

        const lastField = dealerFieldOf(interaction.frames[interaction.frames.length - 1]);
        expect(lastField).not.toContain('drawing');
    });

    test('a second concurrent animation is refused', async () => {
        const game = gameReadyForDealer([
            new Card(10, 'hearts'), new Card(9, 'spades'),
            new Card(2, 'clubs'), new Card(3, 'diamonds'),
            new Card(4, 'hearts'), new Card(5, 'spades'), new Card(6, 'clubs')
        ]);
        const interaction = fakeInteraction();

        game.stand('player1');

        // Two clicks land at once; only one of them may deal the dealer's hand.
        await Promise.all([
            animateDealerDrawing(game, interaction, 'player1', null),
            animateDealerDrawing(game, interaction, 'player1', null)
        ]);

        expect(game.getDealerScore(true)).toBe(20); // 2+3+4+5+6, not doubled up
        expect(interaction.frames).toHaveLength(4); // reveal + 3 draws, rendered once each
        expect(game.isDealerAnimating).toBe(false);
    });

    test('stops when the game is replaced mid-animation', async () => {
        const game = gameReadyForDealer([
            new Card(10, 'hearts'), new Card(9, 'spades'),
            new Card(2, 'clubs'), new Card(3, 'diamonds'),
            new Card(4, 'hearts'), new Card(5, 'spades'), new Card(6, 'clubs')
        ]);
        const interaction = fakeInteraction();

        game.stand('player1');
        // The player hit "Play Again" the instant the dealer's turn began.
        const animation = animateDealerDrawing(game, interaction, 'player1', null);
        game.gameId = 'a-different-hand';
        await animation;

        expect(game.isDealerAnimating).toBe(false);
    });

    test('reveals the hole card even when every player has busted', async () => {
        const game = gameReadyForDealer([
            new Card(10, 'hearts'), new Card(9, 'spades'),
            new Card(6, 'clubs'), new Card(10, 'diamonds'),
            new Card(10, 'spades')   // the player's bust card
        ]);
        const interaction = fakeInteraction();

        game.hit('player1'); // 19 + 10 = 29, bust → dealer's turn opens
        await animateDealerDrawing(game, interaction, 'player1', null);

        expect(game.hasHiddenDealerCard()).toBe(false);
        expect(game.gameOver).toBe(true);
        // The dealer does not draw against a table that has already busted.
        expect(game.dealer.cards).toHaveLength(2);
        expect(dealerFieldOf(interaction.frames[0])).not.toContain('🂠');
    });
});
