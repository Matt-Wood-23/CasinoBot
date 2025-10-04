class CoinFlipGame {
    constructor(userId, bet, choice) {
        this.userId = userId;
        this.bet = bet;
        this.choice = choice.toLowerCase(); // 'heads' or 'tails'
        this.result = null;
        this.winnings = 0;
        this.won = false;
        this.gameComplete = false;

        this.flip();
    }

    flip() {
        // 50/50 random flip
        this.result = Math.random() < 0.5 ? 'heads' : 'tails';

        // Check if player won
        if (this.result === this.choice) {
            this.won = true;
            this.winnings = this.bet * 2; // 1:1 payout + original bet
        } else {
            this.won = false;
            this.winnings = 0;
        }

        this.gameComplete = true;
    }

    getResultEmoji() {
        return this.result === 'heads' ? '👑' : '🦅';
    }

    getChoiceEmoji() {
        return this.choice === 'heads' ? '👑' : '🦅';
    }

    getResultDisplay() {
        return this.result.charAt(0).toUpperCase() + this.result.slice(1);
    }

    getChoiceDisplay() {
        return this.choice.charAt(0).toUpperCase() + this.choice.slice(1);
    }
}

module.exports = CoinFlipGame;
