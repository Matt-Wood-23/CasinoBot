const Deck = require('./deck');

class HiLoGame {
    constructor(userId, initialBet) {
        this.userId = userId;
        this.initialBet = initialBet;
        this.deck = new Deck();
        this.currentCard = this.deck.draw();
        this.nextCard = null;
        this.streak = 0;
        this.multiplier = 1.0;
        this.currentWinnings = initialBet;
        this.gameComplete = false;
        this.result = null; // 'win', 'lose', 'tie'
        this.history = []; // Array of {card, guess, correct}
    }

    // Make a guess (higher or lower)
    guess(prediction) {
        if (this.gameComplete) {
            return { success: false, message: 'Game is already complete!' };
        }

        // Draw next card
        this.nextCard = this.deck.draw();

        const currentValue = this.getCardValue(this.currentCard);
        const nextValue = this.getCardValue(this.nextCard);

        let correct = false;
        let result = '';

        if (nextValue > currentValue && prediction === 'higher') {
            correct = true;
            result = 'correct';
        } else if (nextValue < currentValue && prediction === 'lower') {
            correct = true;
            result = 'correct';
        } else if (nextValue === currentValue) {
            result = 'tie';
            // Tie = streak continues but no multiplier increase
        } else {
            result = 'wrong';
            this.gameComplete = true;
            this.result = 'lose';
            this.currentWinnings = 0;
        }

        // Record history
        this.history.push({
            card: this.currentCard.getName(),
            nextCard: this.nextCard.getName(),
            guess: prediction,
            correct: correct,
            result: result
        });

        if (correct) {
            this.streak++;
            this.multiplier = this.calculateMultiplier();
            this.currentWinnings = Math.floor(this.initialBet * this.multiplier);
        }

        // Move to next card
        this.currentCard = this.nextCard;
        this.nextCard = null;

        return {
            success: true,
            result: result,
            correct: correct,
            streak: this.streak,
            multiplier: this.multiplier,
            winnings: this.currentWinnings
        };
    }

    // Cash out current winnings
    cashOut() {
        if (this.gameComplete) {
            return { success: false, message: 'Game is already complete!' };
        }

        this.gameComplete = true;
        this.result = 'win';

        return {
            success: true,
            winnings: this.currentWinnings
        };
    }

    // Calculate multiplier based on streak
    calculateMultiplier() {
        // Progressive multiplier: 1.5x per correct guess
        // Streak 1: 1.5x, 2: 2.25x, 3: 3.375x, 4: 5.06x, etc.
        return parseFloat((Math.pow(1.5, this.streak)).toFixed(2));
    }

    // Get card value for comparison (A=1, 2-10=face, J=11, Q=12, K=13)
    getCardValue(card) {
        const rank = card.rank;
        if (rank === 'A') return 1;
        if (rank === 'J') return 11;
        if (rank === 'Q') return 12;
        if (rank === 'K') return 13;
        return parseInt(rank);
    }

    // Get card value display
    getCardValueDisplay(card) {
        const value = this.getCardValue(card);
        if (value === 1) return 'Ace (1)';
        if (value === 11) return 'Jack (11)';
        if (value === 12) return 'Queen (12)';
        if (value === 13) return 'King (13)';
        return value.toString();
    }

    // Check if cards remaining
    canContinue() {
        return this.deck.cards.length > 0 && !this.gameComplete;
    }

    // Get result message
    getResultMessage() {
        if (!this.gameComplete) {
            return `Streak: ${this.streak} | Multiplier: ${this.multiplier.toFixed(2)}x`;
        }

        if (this.result === 'win') {
            return `💰 Cashed out! ${this.streak} correct guesses!`;
        } else {
            return `❌ Wrong guess! Lost everything after ${this.streak} correct guesses.`;
        }
    }

    // Get progress/streak display
    getStreakDisplay() {
        const streakEmojis = {
            0: '⭐',
            1: '⭐',
            2: '⭐⭐',
            3: '⭐⭐⭐',
            4: '🌟🌟🌟',
            5: '🌟🌟🌟🌟',
        };

        if (this.streak >= 6) {
            return '🔥'.repeat(this.streak - 5) + '🌟🌟🌟🌟';
        }

        return streakEmojis[this.streak] || '⭐';
    }

    // Get last result display
    getLastResultDisplay() {
        if (this.history.length === 0) return '';

        const last = this.history[this.history.length - 1];
        if (last.result === 'correct') {
            return `✅ ${last.card} → ${last.nextCard} (${last.guess})`;
        } else if (last.result === 'tie') {
            return `🟰 ${last.card} → ${last.nextCard} (TIE)`;
        } else {
            return `❌ ${last.card} → ${last.nextCard} (${last.guess})`;
        }
    }
}

module.exports = HiLoGame;
