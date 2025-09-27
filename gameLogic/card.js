class Card {
    constructor(value, suit) {
        this.value = value;
        this.suit = suit;
    }

    getName() {
        const suits = { 
            'hearts': '♥️', 
            'diamonds': '♦️', 
            'clubs': '♣️', 
            'spades': '♠️' 
        };
        const names = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
        const displayValue = names[this.value] || this.value.toString();
        return `${displayValue}${suits[this.suit]}`;
    }

    getBlackjackValue() {
        if (this.value >= 11 && this.value <= 13) return 10;
        if (this.value === 14) return 11; // Ace
        return this.value;
    }

    // For 3 Card Poker - Ace is high (14) for straights, low (1) for wheel
    getPokerValue() {
        return this.value;
    }
}

module.exports = Card;