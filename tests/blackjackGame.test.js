/**
 * Tests for gameLogic/blackjackGame.js
 *
 * New Jest concepts here:
 *   beforeEach() - reset state before each test
 *   jest.spyOn() - intercept a method call without replacing it fully
 *   mockReturnValueOnce() - make a spy return a specific value once
 *   .toBeNull() / .not.toBeNull() - check for null
 *
 * Strategy: BlackjackGame depends on a shuffled Deck, which makes results
 * random. We control this by spying on deck.drawCard() and feeding in
 * specific cards so we can predict outcomes.
 */

const BlackjackGame = require('../gameLogic/blackjackGame');
const Card = require('../gameLogic/card');

// Helper: create a game and feed in specific cards via spy
function makeGame(playerCards, dealerVisibleCards, dealerHoleCard, bet = 100) {
    const game = new BlackjackGame('channel1', 'player1', bet, false);

    // Replace the deck's drawCard to return our predetermined cards in order.
    // dealNextCard() calls drawCard in this sequence (from the source):
    //   phase 1: player card 1    phase 2: player card 2
    //   phase 3: dealer visible   phase 4: dealer hole card
    //   phase 5: no draw — just checks for dealer blackjack
    const drawSequence = [
        playerCards[0],
        playerCards[1],
        dealerVisibleCards[0],
        dealerHoleCard,
    ];
    let callCount = 0;
    jest.spyOn(game.deck, 'drawCard').mockImplementation(() => {
        return drawSequence[callCount++] ?? new Card(2, 'hearts');
    });

    // Run all 5 dealing phases
    for (let i = 0; i < 5; i++) game.dealNextCard();

    // Mark game over so getHandResult / getWinnings work.
    // (gameOver is already true if dealer had blackjack in phase 5.)
    game.gameOver = true;

    return game;
}

// ─── calculateScore ──────────────────────────────────────────────────────────

describe('calculateScore', () => {
    let game;
    beforeEach(() => {
        game = new BlackjackGame('ch', 'p1', 100, false);
    });

    test('sums number cards correctly', () => {
        const cards = [new Card(7, 'hearts'), new Card(8, 'spades')];
        expect(game.calculateScore(cards)).toBe(15);
    });

    test('face cards (J/Q/K) count as 10', () => {
        const cards = [new Card(13, 'hearts'), new Card(12, 'spades')];
        expect(game.calculateScore(cards)).toBe(20);
    });

    test('Ace counts as 11 when it does not bust', () => {
        const cards = [new Card(14, 'hearts'), new Card(9, 'spades')];
        expect(game.calculateScore(cards)).toBe(20); // A=11, 9
    });

    test('Ace counts as 1 when 11 would bust', () => {
        const cards = [new Card(14, 'hearts'), new Card(10, 'spades'), new Card(5, 'clubs')];
        expect(game.calculateScore(cards)).toBe(16); // A=1, 10, 5
    });

    test('two Aces: one counts as 11 and one as 1', () => {
        const cards = [new Card(14, 'hearts'), new Card(14, 'spades')];
        expect(game.calculateScore(cards)).toBe(12); // 11 + 1
    });

    test('natural 21 (blackjack hand)', () => {
        const cards = [new Card(14, 'hearts'), new Card(13, 'spades')]; // A + K
        expect(game.calculateScore(cards)).toBe(21);
    });

    test('bust hand returns value over 21', () => {
        const cards = [new Card(10, 'hearts'), new Card(10, 'spades'), new Card(5, 'clubs')];
        expect(game.calculateScore(cards)).toBe(25);
    });
});

// ─── getHandResult / getWinnings ─────────────────────────────────────────────

describe('getHandResult', () => {
    test('player blackjack (A+K) beats dealer 20', () => {
        const game = makeGame(
            [new Card(14, 'hearts'), new Card(13, 'spades')], // player: A+K = 21 (blackjack)
            [new Card(10, 'hearts')],                          // dealer visible: 10
            new Card(10, 'clubs')                              // dealer hole: 10 → dealer 20
        );
        expect(game.getHandResult('player1', 0)).toBe('blackjack');
    });

    test('player blackjack vs dealer blackjack is a push', () => {
        const game = makeGame(
            [new Card(14, 'hearts'), new Card(13, 'spades')], // A+K
            [new Card(14, 'clubs')],                          // dealer: A
            new Card(13, 'hearts')                            // dealer hole: K → dealer blackjack
        );
        expect(game.getHandResult('player1', 0)).toBe('push');
    });

    test('player busts → lose', () => {
        const game = makeGame(
            [new Card(10, 'hearts'), new Card(10, 'spades')], // player starts 20
            [new Card(7, 'clubs')],
            new Card(8, 'diamonds')
        );
        // Manually add a third card to bust
        const player = game.players.get('player1');
        player.hands[0].cards.push(new Card(5, 'hearts')); // 10+10+5 = 25
        game.gameOver = true;

        expect(game.getHandResult('player1', 0)).toBe('lose');
    });

    test('dealer busts → player wins', () => {
        const game = makeGame(
            [new Card(10, 'hearts'), new Card(8, 'spades')], // player: 18
            [new Card(10, 'clubs')],
            new Card(5, 'diamonds')
        );
        // Manually bust the dealer
        game.dealer.cards.push(new Card(10, 'hearts')); // 10+5+10 = 25
        game.gameOver = true;

        expect(game.getHandResult('player1', 0)).toBe('win');
    });

    test('player higher than dealer → win', () => {
        const game = makeGame(
            [new Card(10, 'hearts'), new Card(9, 'spades')], // player: 19
            [new Card(10, 'clubs')],
            new Card(7, 'diamonds')                          // dealer: 17
        );
        game.gameOver = true;
        expect(game.getHandResult('player1', 0)).toBe('win');
    });

    test('player lower than dealer → lose', () => {
        const game = makeGame(
            [new Card(10, 'hearts'), new Card(6, 'spades')], // player: 16
            [new Card(10, 'clubs')],
            new Card(9, 'diamonds')                          // dealer: 19
        );
        game.gameOver = true;
        expect(game.getHandResult('player1', 0)).toBe('lose');
    });

    test('equal scores → push', () => {
        const game = makeGame(
            [new Card(10, 'hearts'), new Card(8, 'spades')], // player: 18
            [new Card(10, 'clubs')],
            new Card(8, 'diamonds')                          // dealer: 18
        );
        game.gameOver = true;
        expect(game.getHandResult('player1', 0)).toBe('push');
    });
});

// ─── getWinnings ─────────────────────────────────────────────────────────────

describe('getWinnings', () => {
    test('blackjack pays 1.5x bet (floored)', () => {
        const game = makeGame(
            [new Card(14, 'hearts'), new Card(13, 'spades')],
            [new Card(10, 'clubs')],
            new Card(7, 'diamonds'),
            100
        );
        // player blackjack, dealer 17 → blackjack result → +150
        expect(game.getWinnings('player1')).toBe(150);
    });

    test('win pays 1x bet', () => {
        const game = makeGame(
            [new Card(10, 'hearts'), new Card(9, 'spades')], // 19
            [new Card(10, 'clubs')],
            new Card(7, 'diamonds'),                          // dealer 17
            200
        );
        game.gameOver = true;
        expect(game.getWinnings('player1')).toBe(200);
    });

    test('push returns 0 net', () => {
        const game = makeGame(
            [new Card(10, 'hearts'), new Card(8, 'spades')], // 18
            [new Card(10, 'clubs')],
            new Card(8, 'diamonds'),                          // dealer 18
            100
        );
        game.gameOver = true;
        expect(game.getWinnings('player1')).toBe(0);
    });

    test('loss returns negative bet', () => {
        const game = makeGame(
            [new Card(10, 'hearts'), new Card(6, 'spades')], // 16
            [new Card(10, 'clubs')],
            new Card(9, 'diamonds'),                          // dealer 19
            100
        );
        game.gameOver = true;
        expect(game.getWinnings('player1')).toBe(-100);
    });

    test('returns 0 when game is not over', () => {
        const game = new BlackjackGame('ch', 'p1', 100, false);
        expect(game.getWinnings('p1')).toBe(0);
    });
});
