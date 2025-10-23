class CrashGame {
    constructor(userId, betAmount) {
        this.userId = userId;
        this.betAmount = betAmount;

        this.crashMultiplier = this.generateCrashPoint();
        this.currentMultiplier = 1.00;
        this.stepSize = 0.25; // Increment by 0.10x each step
        this.gameComplete = false;
        this.totalWinnings = 0;
        this.result = null;
    }

    generateCrashPoint() {
        // Generate crash point using house edge (3%)
        // Uses inverse exponential distribution for fairness
        const houseEdge = 0.03;
        const random = Math.random();
        const crashPoint = Math.max(1.00, (1 - houseEdge) / random);

        // Cap at 100x for sanity
        return Math.min(parseFloat(crashPoint.toFixed(2)), 100.00);
    }

    step() {
        if (this.gameComplete) {
            return false;
        }

        // Increment multiplier
        this.currentMultiplier = parseFloat((this.currentMultiplier + this.stepSize).toFixed(2));

        // Check if we've reached or passed the crash point
        if (this.currentMultiplier >= this.crashMultiplier) {
            this.crash();
            return false;
        }

        return true; // Can continue stepping
    }

    crash() {
        this.gameComplete = true;
        this.currentMultiplier = this.crashMultiplier;
        this.totalWinnings = 0;
        this.result = 'crash';
    }

    cashOut() {
        this.gameComplete = true;
        this.totalWinnings = Math.floor(this.betAmount * this.currentMultiplier);
        this.result = 'win';
    }

    getProgressBar() {
        const barLength = 20;
        const progress = Math.min(this.currentMultiplier / this.crashMultiplier, 1);
        const filledLength = Math.floor(progress * barLength);
        const emptyLength = barLength - filledLength;

        const bar = '🟩'.repeat(filledLength) + '⬜'.repeat(emptyLength);
        return bar;
    }

    getStatusEmoji() {
        if (!this.gameComplete) {
            return '🚀';
        }
        return this.result === 'win' ? '✅' : '💥';
    }

    getResultMessage() {
        if (!this.gameComplete) {
            return `Climbing... ${this.currentMultiplier.toFixed(2)}x`;
        }

        if (this.result === 'win') {
            return `✅ Cashed out at ${this.currentMultiplier.toFixed(2)}x! (Crashed at ${this.crashMultiplier.toFixed(2)}x)`;
        } else {
            return `💥 CRASHED at ${this.crashMultiplier.toFixed(2)}x!`;
        }
    }

    canContinue() {
        return !this.gameComplete;
    }

    // Get multiplier display with rocket trail effect
    getMultiplierDisplay() {
        const stages = [
            { max: 1.50, emoji: '🚀' },
            { max: 2.00, emoji: '🚀💨' },
            { max: 3.00, emoji: '🚀💨💨' },
            { max: 5.00, emoji: '🚀💨💨💨' },
            { max: Infinity, emoji: '🚀💨💨💨🔥' }
        ];

        const stage = stages.find(s => this.currentMultiplier <= s.max);
        return `${stage.emoji} ${this.currentMultiplier.toFixed(2)}x`;
    }
}

module.exports = CrashGame;
