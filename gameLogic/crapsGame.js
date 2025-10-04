class CrapsGame {
    constructor(userId, passLineBet = 0, dontPassBet = 0, fieldBet = 0, comeBet = 0) {
        this.userId = userId;
        this.passLineBet = passLineBet;
        this.dontPassBet = dontPassBet;
        this.fieldBet = fieldBet;
        this.comeBet = comeBet;

        this.point = null; // The point number (4, 5, 6, 8, 9, 10)
        this.gamePhase = 'come_out'; // 'come_out' or 'point'
        this.dice = [0, 0];
        this.rollHistory = [];
        this.totalWinnings = 0;
        this.results = [];
        this.gameComplete = false;
    }

    rollDice() {
        this.dice[0] = Math.floor(Math.random() * 6) + 1;
        this.dice[1] = Math.floor(Math.random() * 6) + 1;
        const total = this.dice[0] + this.dice[1];

        this.rollHistory.push({
            dice: [...this.dice],
            total: total,
            phase: this.gamePhase,
            point: this.point
        });

        return total;
    }

    getDiceTotal() {
        return this.dice[0] + this.dice[1];
    }

    play() {
        const roll = this.rollDice();
        this.results = [];
        let phaseWinnings = 0;

        if (this.gamePhase === 'come_out') {
            // Come-out roll
            if (roll === 7 || roll === 11) {
                // Natural - Pass Line wins, Don't Pass loses
                if (this.passLineBet > 0) {
                    this.results.push({
                        bet: 'Pass Line',
                        result: 'WIN',
                        amount: this.passLineBet,
                        payout: this.passLineBet * 2 // 1:1 + original bet
                    });
                    phaseWinnings += this.passLineBet * 2;
                }
                if (this.dontPassBet > 0) {
                    this.results.push({
                        bet: "Don't Pass",
                        result: 'LOSE',
                        amount: this.dontPassBet,
                        payout: 0
                    });
                }
                this.gameComplete = true;
            } else if (roll === 2 || roll === 3 || roll === 12) {
                // Craps - Pass Line loses, Don't Pass wins (except 12 is push)
                if (this.passLineBet > 0) {
                    this.results.push({
                        bet: 'Pass Line',
                        result: 'LOSE',
                        amount: this.passLineBet,
                        payout: 0
                    });
                }
                if (this.dontPassBet > 0) {
                    if (roll === 12) {
                        this.results.push({
                            bet: "Don't Pass",
                            result: 'PUSH (12)',
                            amount: this.dontPassBet,
                            payout: this.dontPassBet // Return bet
                        });
                        phaseWinnings += this.dontPassBet;
                    } else {
                        this.results.push({
                            bet: "Don't Pass",
                            result: 'WIN',
                            amount: this.dontPassBet,
                            payout: this.dontPassBet * 2 // 1:1 + original bet
                        });
                        phaseWinnings += this.dontPassBet * 2;
                    }
                }
                this.gameComplete = true;
            } else {
                // Point established (4, 5, 6, 8, 9, 10)
                this.point = roll;
                this.gamePhase = 'point';
                this.results.push({
                    bet: 'Point',
                    result: `ESTABLISHED: ${this.point}`,
                    amount: 0,
                    payout: 0
                });
            }
        } else {
            // Point phase
            if (roll === this.point) {
                // Point made - Pass Line wins, Don't Pass loses
                if (this.passLineBet > 0) {
                    this.results.push({
                        bet: 'Pass Line',
                        result: 'WIN (Point Made)',
                        amount: this.passLineBet,
                        payout: this.passLineBet * 2 // 1:1 + original bet
                    });
                    phaseWinnings += this.passLineBet * 2;
                }
                if (this.dontPassBet > 0) {
                    this.results.push({
                        bet: "Don't Pass",
                        result: 'LOSE (Point Made)',
                        amount: this.dontPassBet,
                        payout: 0
                    });
                }
                this.gameComplete = true;
            } else if (roll === 7) {
                // Seven out - Pass Line loses, Don't Pass wins
                if (this.passLineBet > 0) {
                    this.results.push({
                        bet: 'Pass Line',
                        result: 'LOSE (Seven Out)',
                        amount: this.passLineBet,
                        payout: 0
                    });
                }
                if (this.dontPassBet > 0) {
                    this.results.push({
                        bet: "Don't Pass",
                        result: 'WIN (Seven Out)',
                        amount: this.dontPassBet,
                        payout: this.dontPassBet * 2 // 1:1 + original bet
                    });
                    phaseWinnings += this.dontPassBet * 2;
                }
                this.gameComplete = true;
            } else {
                // Keep rolling
                this.results.push({
                    bet: 'Roll',
                    result: `Rolled ${roll}, point is ${this.point}`,
                    amount: 0,
                    payout: 0
                });
            }
        }

        // Field bet (one-roll bet)
        if (this.fieldBet > 0) {
            if ([3, 4, 9, 10, 11].includes(roll)) {
                // Field wins 1:1
                this.results.push({
                    bet: 'Field',
                    result: 'WIN',
                    amount: this.fieldBet,
                    payout: this.fieldBet * 2 // 1:1 + original bet
                });
                phaseWinnings += this.fieldBet * 2;
            } else if (roll === 2) {
                // Field wins 2:1
                this.results.push({
                    bet: 'Field',
                    result: 'WIN (2:1)',
                    amount: this.fieldBet,
                    payout: this.fieldBet * 3 // 2:1 + original bet
                });
                phaseWinnings += this.fieldBet * 3;
            } else if (roll === 12) {
                // Field wins 3:1
                this.results.push({
                    bet: 'Field',
                    result: 'WIN (3:1)',
                    amount: this.fieldBet,
                    payout: this.fieldBet * 4 // 3:1 + original bet
                });
                phaseWinnings += this.fieldBet * 4;
            } else {
                // Field loses (5, 6, 7, 8)
                this.results.push({
                    bet: 'Field',
                    result: 'LOSE',
                    amount: this.fieldBet,
                    payout: 0
                });
            }
        }

        this.totalWinnings = phaseWinnings;
    }

    getTotalBet() {
        return this.passLineBet + this.dontPassBet + this.fieldBet + this.comeBet;
    }

    canRollAgain() {
        return !this.gameComplete && this.gamePhase === 'point';
    }

    getResultSummary() {
        let summary = '';
        for (const result of this.results) {
            if (result.result.includes('ESTABLISHED')) {
                summary += `🎲 ${result.result}\n`;
            } else {
                summary += `${result.bet}: ${result.result}\n`;
            }
        }
        return summary.trim();
    }

    static getDiceEmoji(value) {
        const diceEmojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
        return diceEmojis[value - 1] || '?';
    }

    getDiceDisplay() {
        return `${CrapsGame.getDiceEmoji(this.dice[0])} ${CrapsGame.getDiceEmoji(this.dice[1])}`;
    }

    static getPayoutTable() {
        return {
            'Pass Line': '1:1 (Come-out 7/11 wins, 2/3/12 loses. Point phase: make point wins, 7 loses)',
            "Don't Pass": '1:1 (Come-out 2/3 wins, 7/11 loses, 12 pushes. Point phase: 7 wins, point loses)',
            'Field': '1:1 on 3,4,9,10,11 | 2:1 on 2 | 3:1 on 12 (One roll bet)',
            'Come': '1:1 (Like Pass Line but made after point established)',
            'Odds': 'True odds with no house edge (2:1 on 4/10, 3:2 on 5/9, 6:5 on 6/8)'
        };
    }
}

module.exports = CrapsGame;
