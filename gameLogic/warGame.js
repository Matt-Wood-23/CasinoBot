const Deck = require('./deck');

class WarGame {
    constructor(userId, bet) {
        this.userId = userId;
        this.bet = bet;
        this.deck = new Deck();

        this.playerCard = null;
        this.dealerCard = null;
        this.playerWarCard = null;
        this.dealerWarCard = null;

        this.gamePhase = 'initial'; // 'initial', 'tied', 'war', 'complete'
        this.result = null; // 'win', 'lose', 'tied', 'war_win', 'war_lose', 'surrender'
        this.winnings = 0;
        this.warBet = 0; // Additional bet when going to war

        // Deal initial cards
        this.dealInitialCards();
    }

    dealInitialCards() {
        this.playerCard = this.deck.drawCard();
        this.dealerCard = this.deck.drawCard();

        const playerValue = this.getCardValue(this.playerCard);
        const dealerValue = this.getCardValue(this.dealerCard);

        if (playerValue > dealerValue) {
            this.result = 'win';
            this.winnings = this.bet * 2; // 1:1 + original bet
            this.gamePhase = 'complete';
        } else if (playerValue < dealerValue) {
            this.result = 'lose';
            this.winnings = 0;
            this.gamePhase = 'complete';
        } else {
            // Tie - player can choose to surrender or go to war
            this.result = 'tied';
            this.gamePhase = 'tied';
        }
    }

    getCardValue(card) {
        // Ace is high (14), face cards use their value
        if (card.value === 1) return 14; // Ace
        return card.value;
    }

    surrender() {
        if (this.gamePhase !== 'tied') return false;

        this.result = 'surrender';
        this.winnings = Math.floor(this.bet / 2); // Get half bet back
        this.gamePhase = 'complete';
        return true;
    }

    goToWar() {
        if (this.gamePhase !== 'tied') return false;

        this.warBet = this.bet; // War requires matching the original bet
        this.gamePhase = 'war';

        // Burn 3 cards for each side (total 6 cards)
        for (let i = 0; i < 6; i++) {
            this.deck.drawCard();
        }

        // Deal war cards
        this.playerWarCard = this.deck.drawCard();
        this.dealerWarCard = this.deck.drawCard();

        const playerValue = this.getCardValue(this.playerWarCard);
        const dealerValue = this.getCardValue(this.dealerWarCard);

        if (playerValue > dealerValue) {
            this.result = 'war_win';
            // Win both bets back plus 1:1 on original bet
            this.winnings = (this.bet * 2) + (this.warBet * 2); // Return both bets + winnings
            this.gamePhase = 'complete';
        } else if (playerValue < dealerValue) {
            this.result = 'war_lose';
            this.winnings = 0; // Lose both bets
            this.gamePhase = 'complete';
        } else {
            // Tie again - player wins automatically
            this.result = 'war_tie_win';
            this.winnings = (this.bet * 2) + (this.warBet * 2); // Return both bets + winnings
            this.gamePhase = 'complete';
        }

        return true;
    }

    getTotalBet() {
        return this.bet + this.warBet;
    }

    getProfit() {
        return this.winnings - this.getTotalBet();
    }

    getResultMessage() {
        switch (this.result) {
            case 'win':
                return '🎉 You win!';
            case 'lose':
                return '❌ Dealer wins!';
            case 'tied':
                return '🤝 It\'s a tie! Choose to Surrender or Go to War';
            case 'surrender':
                return '🏳️ You surrendered and got half your bet back';
            case 'war_win':
                return '⚔️ You won the war!';
            case 'war_lose':
                return '⚔️ You lost the war!';
            case 'war_tie_win':
                return '⚔️🎉 War tied - You win!';
            default:
                return '';
        }
    }

    isComplete() {
        return this.gamePhase === 'complete';
    }

    canPlayAgain() {
        return this.gamePhase === 'complete';
    }
}

module.exports = WarGame;
