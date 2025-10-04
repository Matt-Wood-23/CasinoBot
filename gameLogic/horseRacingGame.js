class HorseRacingGame {
    constructor(userId, bet, horseNumber) {
        this.userId = userId;
        this.bet = bet;
        this.betOnHorse = horseNumber; // 1-6
        this.winnings = 0;
        this.gameComplete = false;

        // Define horses with names, emojis, and odds
        this.horses = [
            { number: 1, name: 'Lightning Bolt', emoji: '🏇', odds: 3, color: '🔴' },
            { number: 2, name: 'Thunder Strike', emoji: '🐎', odds: 4, color: '🔵' },
            { number: 3, name: 'Midnight Runner', emoji: '🏇', odds: 5, color: '⚫' },
            { number: 4, name: 'Golden Flash', emoji: '🐎', odds: 6, color: '🟡' },
            { number: 5, name: 'Storm Chaser', emoji: '🏇', odds: 8, color: '🟢' },
            { number: 6, name: 'Wild Wind', emoji: '🐎', odds: 10, color: '🟣' }
        ];

        this.racePositions = []; // Track positions during race
        this.winner = null;
        this.finalPositions = [];
    }

    // Simulate the race
    race() {
        const RACE_LENGTH = 10;
        let positions = this.horses.map(h => ({
            ...h,
            position: 0,
            speed: this.calculateSpeed(h.odds)
        }));

        // Simulate race steps
        for (let step = 0; step < RACE_LENGTH; step++) {
            for (let horse of positions) {
                if (horse.position < RACE_LENGTH) {
                    // Move horse forward based on weighted random
                    const move = this.getMovement(horse.speed);
                    horse.position = Math.min(horse.position + move, RACE_LENGTH);
                }
            }

            // Store snapshot of positions
            this.racePositions.push([...positions]);
        }

        // Determine final positions
        this.finalPositions = positions.sort((a, b) => {
            if (b.position !== a.position) {
                return b.position - a.position;
            }
            // Tiebreaker - higher odds win ties
            return a.odds - b.odds;
        });

        this.winner = this.finalPositions[0];

        // Calculate winnings
        if (this.winner.number === this.betOnHorse) {
            this.winnings = this.bet * (this.winner.odds + 1); // odds:1 payout + original bet
        } else {
            this.winnings = 0;
        }

        this.gameComplete = true;
    }

    // Calculate base speed from odds (lower odds = faster)
    calculateSpeed(odds) {
        return 1 / odds; // Higher speed for lower odds
    }

    // Get movement for this step (weighted random)
    getMovement(speed) {
        const random = Math.random();
        const boosted = random * (1 + speed);

        if (boosted > 0.8) return 2;
        if (boosted > 0.4) return 1;
        return 0;
    }

    getHorseByNumber(number) {
        return this.horses.find(h => h.number === number);
    }

    getWinningHorse() {
        return this.winner;
    }

    getBetHorse() {
        return this.getHorseByNumber(this.betOnHorse);
    }

    // Get race visualization for a specific step
    getRaceFrame(step) {
        if (step >= this.racePositions.length) {
            step = this.racePositions.length - 1;
        }

        const positions = this.racePositions[step];
        const TRACK_LENGTH = 15;

        let frame = '```\n🏁 HORSE RACE 🏁\n\n';

        for (let horse of positions) {
            const trackPos = Math.floor((horse.position / 10) * TRACK_LENGTH);
            let track = '';

            for (let i = 0; i < TRACK_LENGTH; i++) {
                if (i === trackPos) {
                    track += horse.emoji;
                } else if (i === TRACK_LENGTH - 1) {
                    track += '🏁';
                } else {
                    track += '─';
                }
            }

            frame += `${horse.color} ${horse.number}. ${track}\n`;
        }

        frame += '```';
        return frame;
    }

    // Get final results display
    getFinalResults() {
        let results = '**🏆 FINAL RESULTS 🏆**\n\n';

        for (let i = 0; i < this.finalPositions.length; i++) {
            const horse = this.finalPositions[i];
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            const star = horse.number === this.betOnHorse ? '⭐' : '';
            results += `${medal} ${horse.color} **${horse.name}** (${horse.odds}:1) ${star}\n`;
        }

        return results;
    }

    getProfit() {
        return this.winnings - this.bet;
    }
}

module.exports = HorseRacingGame;
