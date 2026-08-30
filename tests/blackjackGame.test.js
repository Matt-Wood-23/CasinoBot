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

// ─── Regressions ─────────────────────────────────────────────────────────────
//
// Each test below pins down a bug that was live in the shipped bot.

/**
 * Build a game whose deck hands out a fixed sequence of cards, with the
 * opening deal already done. Anything drawn beyond `sequence` is a 2.
 */
function stackedGame(sequence, { bet = 100, multiPlayer = false } = {}) {
    const game = new BlackjackGame('ch', 'player1', bet, multiPlayer);
    let i = 0;
    jest.spyOn(game.deck, 'drawCard').mockImplementation(
        () => sequence[i++] ?? new Card(2, 'hearts')
    );
    return game;
}

describe('dealer hole card', () => {
    test('stays hidden until the dealer turn reveals it', () => {
        const game = stackedGame([
            new Card(10, 'hearts'), new Card(9, 'spades'),   // player 19
            new Card(6, 'clubs'), new Card(10, 'diamonds')   // dealer 6 up, 10 down
        ]);
        for (let i = 0; i < 5; i++) game.dealNextCard();

        expect(game.hasHiddenDealerCard()).toBe(true);
        // Only the up card is public, so only the up card is scored.
        expect(game.dealer.cards).toHaveLength(1);
        expect(game.getDealerScore(false)).toBe(6);

        game.stand('player1');
        expect(game.hasHiddenDealerCard()).toBe(true); // dealerPlay no longer flips it

        game.revealDealerHoleCard();
        expect(game.hasHiddenDealerCard()).toBe(false);
        expect(game.dealer.cards).toHaveLength(2);
        expect(game.getDealerScore(false)).toBe(16);
    });

    test('dealerPlay only opens the dealer turn; drawing is a separate step', () => {
        const game = stackedGame([
            new Card(10, 'hearts'), new Card(9, 'spades'),
            new Card(6, 'clubs'), new Card(5, 'diamonds'),   // dealer 11
            new Card(4, 'hearts'), new Card(7, 'spades')     // then 15, then 22
        ]);
        for (let i = 0; i < 5; i++) game.dealNextCard();

        game.stand('player1');
        expect(game.dealer.isDrawing).toBe(true);
        expect(game.gameOver).toBe(false);

        game.revealDealerHoleCard();
        expect(game.drawDealerCard()).toBe(true);  // 11 → 15
        expect(game.gameOver).toBe(false);
        expect(game.drawDealerCard()).toBe(true);  // 15 → 22, dealer done
        expect(game.gameOver).toBe(true);
        expect(game.dealer.isDrawing).toBe(false);
        expect(game.drawDealerCard()).toBe(false); // no cards after the turn ends
    });

    test('shouldDealerContinue reveals the hole card if nothing animated it', () => {
        const game = stackedGame([
            new Card(10, 'hearts'), new Card(9, 'spades'),
            new Card(10, 'clubs'), new Card(8, 'diamonds')   // dealer 18: stands
        ]);
        for (let i = 0; i < 5; i++) game.dealNextCard();

        game.stand('player1');
        expect(game.shouldDealerContinue()).toBe(false);
        expect(game.hasHiddenDealerCard()).toBe(false);
        expect(game.gameOver).toBe(true);
    });
});

describe('double after split', () => {
    test('busting a doubled hand does not stand the next split hand', () => {
        const game = stackedGame([
            new Card(8, 'hearts'), new Card(8, 'spades'),    // player: pair of 8s
            new Card(6, 'clubs'), new Card(10, 'diamonds'),  // dealer
            new Card(3, 'hearts'),   // split → hand 0 gets 3  (8+3 = 11)
            new Card(9, 'clubs'),    // split → hand 1 gets 9  (8+9 = 17)
            new Card(10, 'spades')   // double on hand 0 → 21
        ]);
        for (let i = 0; i < 5; i++) game.dealNextCard();

        expect(game.split('player1')).toBe(true);
        expect(game.double('player1')).toBe(true);

        const player = game.players.get('player1');
        // Hand 0 doubled to 21 and stood; play must now pass to hand 1.
        expect(player.currentHandIndex).toBe(1);
        expect(player.hands[1].stood).toBeFalsy();
        expect(player.stood).toBe(false);
    });

    test('the second split hand is still playable after the first busts', () => {
        const game = stackedGame([
            new Card(8, 'hearts'), new Card(8, 'spades'),
            new Card(6, 'clubs'), new Card(10, 'diamonds'),
            new Card(9, 'hearts'),   // hand 0: 8+9 = 17
            new Card(9, 'clubs'),    // hand 1: 8+9 = 17
            new Card(10, 'spades')   // double on hand 0 → 27, bust
        ]);
        for (let i = 0; i < 5; i++) game.dealNextCard();

        game.split('player1');
        game.double('player1');

        const player = game.players.get('player1');
        expect(game.calculateScore(player.hands[0].cards)).toBeGreaterThan(21);
        expect(player.currentHandIndex).toBe(1);
        // The player never acted on hand 1, so it must not be stood.
        expect(player.hands[1].stood).toBeFalsy();
        expect(player.stood).toBe(false);
        expect(game.hit('player1')).toBe(true); // still their hand to play
    });
});

describe('split hands are not naturals', () => {
    test('A+10 made by splitting aces pays even money, not 3:2', () => {
        const game = stackedGame([
            new Card(14, 'hearts'), new Card(14, 'spades'),  // pair of aces
            new Card(6, 'clubs'), new Card(10, 'diamonds'),  // dealer 16
            new Card(13, 'hearts'),  // hand 0: A+K = 21
            new Card(9, 'clubs')     // hand 1: A+9 = 20
        ]);
        for (let i = 0; i < 5; i++) game.dealNextCard();

        game.split('player1');
        game.gameOver = true;

        expect(game.hasNaturalBlackjack('player1')).toBe(false);
        expect(game.getHandResult('player1', 0)).toBe('win'); // not 'blackjack'
        // 100 per hand, both beat the dealer's 16: even money on each.
        expect(game.getWinnings('player1')).toBe(200);
    });

    test('an unsplit A+10 is still a natural', () => {
        const game = stackedGame([
            new Card(14, 'hearts'), new Card(13, 'spades'),
            new Card(6, 'clubs'), new Card(10, 'diamonds')
        ]);
        for (let i = 0; i < 5; i++) game.dealNextCard();
        game.gameOver = true;

        expect(game.hasNaturalBlackjack('player1')).toBe(true);
        expect(game.getHandResult('player1', 0)).toBe('blackjack');
        expect(game.getWinnings('player1')).toBe(150); // 3:2
    });
});

describe('action guards', () => {
    test('stand reports whether it did anything', () => {
        const game = stackedGame([
            new Card(10, 'hearts'), new Card(9, 'spades'),
            new Card(10, 'clubs'), new Card(8, 'diamonds')
        ]);
        for (let i = 0; i < 5; i++) game.dealNextCard();

        expect(game.stand('player1')).toBe(true);
        // A repeat click on a hand that is already done must be a no-op.
        expect(game.stand('player1')).toBe(false);
        expect(game.stand('nobody')).toBe(false);
    });

    test('double is rejected on a hand of more than two cards', () => {
        const game = stackedGame([
            new Card(5, 'hearts'), new Card(4, 'spades'),
            new Card(10, 'clubs'), new Card(8, 'diamonds'),
            new Card(3, 'hearts')
        ]);
        for (let i = 0; i < 5; i++) game.dealNextCard();

        game.hit('player1');
        expect(game.double('player1')).toBe(false);
    });

    test('dealNextCard cannot run past the final phase', () => {
        const game = stackedGame([
            new Card(10, 'hearts'), new Card(9, 'spades'),
            new Card(10, 'clubs'), new Card(8, 'diamonds')
        ]);
        for (let i = 0; i < 10; i++) game.dealNextCard();

        expect(game.dealingPhase).toBe(5);
        expect(game.players.get('player1').hands[0].cards).toHaveLength(2);
        expect(game.dealer.cards).toHaveLength(1);
    });
});

describe('naturals resolve on the deal', () => {
    test('a player dealt a natural is stood without taking a turn', () => {
        const game = stackedGame([
            new Card(14, 'hearts'), new Card(13, 'spades'),  // player A+K = natural
            new Card(6, 'clubs'), new Card(9, 'diamonds')    // dealer 15, no blackjack
        ]);
        for (let i = 0; i < 5; i++) game.dealNextCard();

        const player = game.players.get('player1');
        expect(game.naturalsStood).toBe(true);
        expect(player.stood).toBe(true);
        expect(game.getCurrentHand('player1')).toBeNull();
        // The dealer takes over immediately.
        expect(game.dealer.isDrawing).toBe(true);
        expect(game.gameOver).toBe(false);
    });

    test('the dealer only shows its hole card against a lone natural', () => {
        const game = stackedGame([
            new Card(14, 'hearts'), new Card(13, 'spades'),
            new Card(6, 'clubs'), new Card(5, 'diamonds')    // dealer 11: would normally draw
        ]);
        for (let i = 0; i < 5; i++) game.dealNextCard();

        expect(game.shouldDealerContinue()).toBe(false);
        expect(game.hasHiddenDealerCard()).toBe(false);
        expect(game.dealer.cards).toHaveLength(2); // no card drawn to 11
        expect(game.gameOver).toBe(true);
        expect(game.getHandResult('player1', 0)).toBe('blackjack');
        expect(game.getWinnings('player1')).toBe(150);
    });

    test('a dealer blackjack takes priority over the player natural', () => {
        const game = stackedGame([
            new Card(14, 'hearts'), new Card(13, 'spades'),  // player natural
            new Card(14, 'clubs'), new Card(12, 'diamonds')  // dealer natural
        ]);
        for (let i = 0; i < 5; i++) game.dealNextCard();

        expect(game.gameOver).toBe(true);
        expect(game.naturalsStood).toBe(false); // the peek ended it first
        expect(game.getHandResult('player1', 0)).toBe('push');
        expect(game.getWinnings('player1')).toBe(0);
    });

    test('an ordinary hand still gets its turn', () => {
        const game = stackedGame([
            new Card(10, 'hearts'), new Card(9, 'spades'),   // 19, not a natural
            new Card(6, 'clubs'), new Card(9, 'diamonds')
        ]);
        for (let i = 0; i < 5; i++) game.dealNextCard();

        expect(game.naturalsStood).toBe(false);
        expect(game.players.get('player1').stood).toBe(false);
        expect(game.dealer.isDrawing).toBeFalsy();
        expect(game.hit('player1')).toBe(true);
    });

    test('at a table, only the natural is stood and play passes to the others', () => {
        const game = new BlackjackGame('ch', 'player1', 100, true);
        game.addPlayer('player2', 100);
        const sequence = [
            new Card(14, 'hearts'), new Card(7, 'clubs'),    // first card each
            new Card(13, 'spades'), new Card(9, 'diamonds'), // second: p1 = A+K, p2 = 16
            new Card(6, 'hearts'), new Card(9, 'spades')     // dealer 15
        ];
        let i = 0;
        jest.spyOn(game.deck, 'drawCard').mockImplementation(
            () => sequence[i++] ?? new Card(2, 'hearts')
        );
        for (let p = 0; p < 5; p++) game.dealNextCard();

        expect(game.players.get('player1').stood).toBe(true);  // natural
        expect(game.players.get('player2').stood).toBe(false); // still to play
        // The turn must sit on the player who can still act.
        expect(Array.from(game.players.keys())[game.currentPlayerIndex]).toBe('player2');
        expect(game.dealer.isDrawing).toBeFalsy();
    });

    test('the dealer still plays out for a live hand alongside a natural', () => {
        const game = new BlackjackGame('ch', 'player1', 100, true);
        game.addPlayer('player2', 100);
        const sequence = [
            new Card(14, 'hearts'), new Card(7, 'clubs'),
            new Card(13, 'spades'), new Card(9, 'diamonds'), // p1 natural, p2 = 16
            new Card(6, 'hearts'), new Card(5, 'spades'),    // dealer 11
            new Card(4, 'clubs')                             // dealer draws to 15...
        ];
        let i = 0;
        jest.spyOn(game.deck, 'drawCard').mockImplementation(
            () => sequence[i++] ?? new Card(2, 'hearts')
        );
        for (let p = 0; p < 5; p++) game.dealNextCard();

        game.stand('player2');
        // player2's 16 can still be beaten, so the dealer has a decision.
        expect(game.needsDealerHand()).toBe(true);
        expect(game.shouldDealerContinue()).toBe(true);
    });

    test('the dealer does not draw once every live hand is a natural or bust', () => {
        const game = new BlackjackGame('ch', 'player1', 100, true);
        game.addPlayer('player2', 100);
        const sequence = [
            new Card(14, 'hearts'), new Card(10, 'clubs'),
            new Card(13, 'spades'), new Card(9, 'diamonds'), // p1 natural, p2 = 19
            new Card(6, 'hearts'), new Card(5, 'spades'),    // dealer 11
            new Card(10, 'clubs')                            // p2's bust card
        ];
        let i = 0;
        jest.spyOn(game.deck, 'drawCard').mockImplementation(
            () => sequence[i++] ?? new Card(2, 'hearts')
        );
        for (let p = 0; p < 5; p++) game.dealNextCard();

        game.hit('player2'); // 19 + 10 = 29, bust
        expect(game.needsDealerHand()).toBe(false);
        expect(game.shouldDealerContinue()).toBe(false);
        expect(game.dealer.cards).toHaveLength(2); // hole card shown, nothing drawn
        expect(game.gameOver).toBe(true);
    });

    test('a split hand of 21 does not stand itself', () => {
        const game = stackedGame([
            new Card(14, 'hearts'), new Card(14, 'spades'),  // pair of aces
            new Card(6, 'clubs'), new Card(9, 'diamonds'),
            new Card(13, 'hearts'),  // hand 0: A+K = 21, but split
            new Card(5, 'clubs')     // hand 1: A+5
        ]);
        for (let i = 0; i < 5; i++) game.dealNextCard();
        game.split('player1');

        const player = game.players.get('player1');
        expect(player.stood).toBe(false);
        expect(player.currentHandIndex).toBe(0);
        expect(game.needsDealerHand()).toBe(true);
    });
});
