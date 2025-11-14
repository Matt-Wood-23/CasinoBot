/**
 * Shared card game utility functions
 * Provides common card-related helpers used across multiple games
 */

/**
 * Checks if a hand is a natural blackjack (Ace + 10-value card with exactly 2 cards)
 * @param {Object|Array} hand - The hand to check (can be hand object with cards array or direct array)
 * @returns {boolean} True if the hand is a natural blackjack
 */
function isNaturalBlackjack(hand) {
    // Handle both hand object with cards array and direct array
    const cards = hand?.cards || hand;

    if (!cards || cards.length !== 2) return false;

    const score = cards.reduce((sum, card) => {
        if (!card) return sum;
        return sum + card.getBlackjackValue();
    }, 0);

    if (score !== 21) return false;

    // Check for Ace and 10-value card
    const hasAce = cards.some(card => card && card.value === 14);
    const hasTen = cards.some(card => card && card.getBlackjackValue() === 10);

    return hasAce && hasTen;
}

/**
 * Calculates the best possible value for a blackjack hand
 * Handles Ace valuation (1 or 11) automatically
 * @param {Array} cards - Array of card objects
 * @returns {number} Best hand value
 */
function calculateBlackjackValue(cards) {
    if (!cards || cards.length === 0) return 0;

    let value = 0;
    let aces = 0;

    for (const card of cards) {
        if (!card) continue;

        const cardValue = card.getBlackjackValue();
        value += cardValue;

        if (card.value === 14) { // Ace
            aces++;
        }
    }

    // Optimize ace values (start with 11, reduce to 1 if needed)
    while (value > 21 && aces > 0) {
        value -= 10; // Convert an ace from 11 to 1
        aces--;
    }

    return value;
}

/**
 * Checks if a blackjack hand is bust (over 21)
 * @param {Array} cards - Array of card objects
 * @returns {boolean} True if hand is bust
 */
function isBust(cards) {
    return calculateBlackjackValue(cards) > 21;
}

/**
 * Formats a card for display
 * @param {Object} card - Card object with suit and value
 * @returns {string} Formatted card string (e.g., "A♠", "10♥")
 */
function formatCard(card) {
    if (!card) return '??';

    const suitSymbols = {
        'hearts': '♥️',
        'diamonds': '♦️',
        'clubs': '♣️',
        'spades': '♠️'
    };

    const valueNames = {
        11: 'J',
        12: 'Q',
        13: 'K',
        14: 'A'
    };

    const valueName = valueNames[card.value] || card.value.toString();
    const suitSymbol = suitSymbols[card.suit] || card.suit;

    return `${valueName}${suitSymbol}`;
}

/**
 * Formats an array of cards for display
 * @param {Array} cards - Array of card objects
 * @param {boolean} hideFirst - If true, first card is hidden (for dealer)
 * @returns {string} Formatted card string
 */
function formatCards(cards, hideFirst = false) {
    if (!cards || cards.length === 0) return 'No cards';

    return cards.map((card, index) => {
        if (hideFirst && index === 0) return '🂠'; // Card back
        return formatCard(card);
    }).join(' ');
}

/**
 * Gets the name of a poker hand ranking
 * @param {number} rank - Poker hand rank (0-9)
 * @returns {string} Hand name
 */
function getPokerHandName(rank) {
    const handNames = {
        0: 'High Card',
        1: 'Pair',
        2: 'Two Pair',
        3: 'Three of a Kind',
        4: 'Straight',
        5: 'Flush',
        6: 'Full House',
        7: 'Four of a Kind',
        8: 'Straight Flush',
        9: 'Royal Flush'
    };

    return handNames[rank] || 'Unknown Hand';
}

module.exports = {
    isNaturalBlackjack,
    calculateBlackjackValue,
    isBust,
    formatCard,
    formatCards,
    getPokerHandName
};
