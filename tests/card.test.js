/**
 * Tests for gameLogic/card.js
 *
 * New Jest concepts here:
 *   beforeEach() - runs before every test in the describe block, used to
 *                  create fresh objects so tests don't share state
 */

const Card = require('../gameLogic/card');

describe('Card', () => {
    describe('getBlackjackValue', () => {
        test('number cards (2-10) return face value', () => {
            expect(new Card(2, 'hearts').getBlackjackValue()).toBe(2);
            expect(new Card(10, 'spades').getBlackjackValue()).toBe(10);
        });

        test('Jack (11), Queen (12), King (13) all return 10', () => {
            expect(new Card(11, 'hearts').getBlackjackValue()).toBe(10);
            expect(new Card(12, 'hearts').getBlackjackValue()).toBe(10);
            expect(new Card(13, 'hearts').getBlackjackValue()).toBe(10);
        });

        test('Ace (14) returns 11', () => {
            expect(new Card(14, 'hearts').getBlackjackValue()).toBe(11);
        });
    });

    describe('getName', () => {
        test('returns correct display for face cards', () => {
            expect(new Card(11, 'hearts').getName()).toBe('J♥️');
            expect(new Card(12, 'diamonds').getName()).toBe('Q♦️');
            expect(new Card(13, 'clubs').getName()).toBe('K♣️');
            expect(new Card(14, 'spades').getName()).toBe('A♠️');
        });

        test('returns number for number cards', () => {
            expect(new Card(7, 'hearts').getName()).toBe('7♥️');
        });
    });
});
