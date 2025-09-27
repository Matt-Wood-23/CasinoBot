// Slots symbols and payouts
const SLOTS_SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '🔔', '⭐', '7️⃣'];
const SLOTS_PAYOUTS = {
    '🍒🍒🍒': 2,
    '🍋🍋🍋': 3,
    '🍊🍊🍊': 4,
    '🍇🍇🍇': 5,
    '🔔🔔🔔': 10,
    '⭐⭐⭐': 20,
    '7️⃣7️⃣7️⃣': 50
};

class SlotsGame {
    constructor(userId, bet) {
        this.userId = userId;
        this.bet = bet;
        this.reels = [];
        this.lines = 3; // Multi-line: 3 paylines
        this.symbolsPerReel = 3; // 3 rows
        this.winnings = 0;
        this.winningLines = [];
        this.spin();
    }

    spin() {
        this.reels = [];
        
        // Generate 3 reels with 3 symbols each
        for (let i = 0; i < 3; i++) { 
            const reel = [];
            for (let j = 0; j < this.symbolsPerReel; j++) {
                reel.push(SLOTS_SYMBOLS[Math.floor(Math.random() * SLOTS_SYMBOLS.length)]);
            }
            this.reels.push(reel);
        }
        
        this.calculateWinnings();
    }

    calculateWinnings() {
        let totalWin = 0;
        this.winningLines = [];
        
        // Check each payline (horizontal lines: top, middle, bottom)
        for (let line = 0; line < this.lines; line++) {
            const combo = `${this.reels[0][line]}${this.reels[1][line]}${this.reels[2][line]}`;
            
            if (SLOTS_PAYOUTS[combo]) {
                const lineWin = this.bet * SLOTS_PAYOUTS[combo];
                totalWin += lineWin;
                this.winningLines.push({
                    line: line,
                    combo: combo,
                    payout: SLOTS_PAYOUTS[combo],
                    winAmount: lineWin
                });
            }
        }
        
        this.winnings = totalWin;
    }

    getGrid() {
        let grid = '';
        for (let row = 0; row < this.symbolsPerReel; row++) {
            grid += '| ';
            for (let col = 0; col < 3; col++) {
                grid += this.reels[col][row] + ' | ';
            }
            grid += '\n';
        }
        return grid;
    }

    getWinningLinesDescription() {
        if (this.winningLines.length === 0) return null;
        
        let description = 'Winning Lines:\n';
        for (const winLine of this.winningLines) {
            const lineNames = ['Top', 'Middle', 'Bottom'];
            description += `${lineNames[winLine.line]}: ${winLine.combo} (${winLine.payout}x = ${winLine.winAmount})\n`;
        }
        
        return description.trim();
    }

    // Get symbols for a specific payline
    getPaylineSymbols(lineIndex) {
        if (lineIndex < 0 || lineIndex >= this.lines) return [];
        return [
            this.reels[0][lineIndex],
            this.reels[1][lineIndex],
            this.reels[2][lineIndex]
        ];
    }

    // Check if player won
    hasWon() {
        return this.winnings > 0;
    }

    // Get net profit (winnings - bet)
    getNetProfit() {
        return this.winnings - this.bet;
    }

    // Static method to get payout table
    static getPayoutTable() {
        return SLOTS_PAYOUTS;
    }

    // Static method to get all symbols
    static getSymbols() {
        return SLOTS_SYMBOLS;
    }
}

module.exports = SlotsGame;