class PlinkoGame {
    constructor(userId, betAmount, riskLevel = 'medium') {
        this.userId = userId;
        this.betAmount = betAmount;
        this.riskLevel = riskLevel; // low, medium, high

        // Board configuration
        this.rows = 8;
        this.path = [];
        this.currentRow = 0;
        this.finalSlot = null;
        this.multiplier = 0;
        this.winnings = 0;

        // Generate the complete path before animation starts
        this.generatePath();
        this.calculateResult();
    }

    generatePath() {
        // Start at center (position 0)
        let position = 0;
        this.path = [{ row: 0, position: 0 }];

        // Generate random bounces for each row
        for (let row = 1; row <= this.rows; row++) {
            // Randomly go left (-1) or right (+1)
            const direction = Math.random() < 0.5 ? -1 : 1;
            position += direction;

            this.path.push({ row, position });
        }

        // Calculate which slot the ball landed in (0 = center)
        this.finalSlot = position;
    }

    calculateResult() {
        // Different multiplier distributions based on risk level
        const multipliers = {
            low: {
                slots: [-4, -3, -2, -1, 0, 1, 2, 3, 4],
                values: [1.5, 1.2, 1.1, 1.0, 0.5, 1.0, 1.1, 1.2, 1.5]
            },
            medium: {
                slots: [-4, -3, -2, -1, 0, 1, 2, 3, 4],
                values: [3.0, 1.5, 1.0, 0.5, 0.3, 0.5, 1.0, 1.5, 3.0]
            },
            high: {
                slots: [-4, -3, -2, -1, 0, 1, 2, 3, 4],
                values: [10.0, 3.0, 1.0, 0.3, 0.0, 0.3, 1.0, 3.0, 10.0]
            }
        };

        const config = multipliers[this.riskLevel];

        // Clamp final slot to valid range
        const clampedSlot = Math.max(-4, Math.min(4, this.finalSlot));
        const slotIndex = config.slots.indexOf(clampedSlot);

        this.multiplier = config.values[slotIndex];
        this.winnings = Math.floor(this.betAmount * this.multiplier);
    }

    // Get the current state of the board for display
    getBoardState(currentStep) {
        if (currentStep >= this.path.length) {
            currentStep = this.path.length - 1;
        }

        const ballPos = this.path[currentStep];
        const lines = [];

        // Title
        lines.push('```');
        lines.push('                     💰 PLINKO 💰');
        lines.push('');

        // Draw board with pegs and ball
        for (let row = 0; row <= this.rows; row++) {
            // Add spacing to center - each multiplier is ~5 chars wide
            let line = ' '.repeat((this.rows - row) * 2 + 2);

            // Determine number of pegs in this row
            const pegsInRow = row + 1;

            for (let peg = 0; peg < pegsInRow; peg++) {
                // Calculate peg position relative to center
                const pegPosition = peg - Math.floor(pegsInRow / 2);

                // Check if ball is at this position
                if (row === ballPos.row && pegPosition === ballPos.position) {
                    line += '🔴  ';
                } else if (row < ballPos.row) {
                    // Show path history
                    const pastPosition = this.path[row];
                    if (pastPosition && pastPosition.position === pegPosition) {
                        line += '🟠  ';
                    } else {
                        line += '⚪  ';
                    }
                } else {
                    line += '⚪  ';
                }
            }

            lines.push(line.trimEnd());
        }

        lines.push('');

        // Show multiplier slots at bottom
        const multiplierLine = this.getMultiplierLine();
        lines.push(multiplierLine);

        lines.push('```');

        return lines.join('\n');
    }

    getMultiplierLine() {
        const multipliers = {
            low: ['1.5x', '1.2x', '1.1x', '1.0x', '0.5x', '1.0x', '1.1x', '1.2x', '1.5x'],
            medium: [' 3x', '1.5x', ' 1x', '0.5x', '0.3x', '0.5x', ' 1x', '1.5x', ' 3x'],
            high: ['10x', ' 3x', ' 1x', '0.3x', ' 0x', '0.3x', ' 1x', ' 3x', '10x']
        };

        const mults = multipliers[this.riskLevel];

        // Each emoji + space = 3 characters, so we need to match that spacing
        let line = '';
        for (let i = -4; i <= 4; i++) {
            const slotIndex = i + 4;
            let multText = mults[slotIndex];

            // Highlight the winning slot if ball has landed
            if (this.finalSlot === i && this.currentRow >= this.rows) {
                line += `[${multText}]`;
            } else {
                line += ` ${multText}`;
            }

            // Add spacing between slots
            if (i < 4) {
                line += ' ';
            }
        }

        return line;
    }

    // Get step count for animation
    getTotalSteps() {
        return this.path.length;
    }

    // Get result message
    getResultMessage() {
        const profit = this.winnings - this.betAmount;

        if (profit > 0) {
            return `🎉 **Winner!** Ball landed in ${this.multiplier}x slot!\n💰 Won **${this.winnings.toLocaleString()}** coins (profit: +${profit.toLocaleString()})`;
        } else if (profit === 0) {
            return `😐 **Break Even!** Ball landed in ${this.multiplier}x slot.\n💰 Won **${this.winnings.toLocaleString()}** coins`;
        } else {
            return `😢 **Lost!** Ball landed in ${this.multiplier}x slot.\n💸 Won **${this.winnings.toLocaleString()}** coins (loss: ${profit.toLocaleString()})`;
        }
    }

    // Get color for embed based on result
    getResultColor() {
        const profit = this.winnings - this.betAmount;

        if (profit > 0) return '#00FF00'; // Green
        if (profit === 0) return '#FFFF00'; // Yellow
        return '#FF0000'; // Red
    }

    // Get risk level emoji
    getRiskEmoji() {
        const emojis = {
            low: '🟢',
            medium: '🟡',
            high: '🔴'
        };
        return emojis[this.riskLevel];
    }
}

module.exports = PlinkoGame;
