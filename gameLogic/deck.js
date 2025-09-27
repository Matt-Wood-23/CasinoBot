const Card = require('./card');

class Deck {
    constructor() {
        this.reset();
    }

    reset() {
        this.cards = [];
        const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
        for (let suit of suits) {
            for (let value = 2; value <= 14; value++) {
                this.cards.push(new Card(value, suit));
            }
        }
        this.shuffle();
    }

    shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    drawCard() {
        if (this.cards.length === 0) this.reset();
        return this.cards.pop();
    }

    // For debugging/admin purposes - draws a specific card if available
    drawSpecificCard(value, suit) {
        const index = this.cards.findIndex(card => card.value === value && card.suit === suit);
        if (index !== -1) {
            return this.cards.splice(index, 1)[0];
        }
        return new Card(value, suit); // Fallback if card not found
    }

    getRemainingCards() {
        return this.cards.length;
    }
}

module.exports = Deck;