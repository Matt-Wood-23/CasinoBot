class RouletteGame {
    constructor(userId, bets = {}) {
        this.userId = userId;
        this.bets = bets; // { type: amount } - e.g., { "red": 50, "0": 10 }
        this.winningNumber = null;
        this.winningColor = null;
        this.results = [];
        this.totalWinnings = 0;
        this.gameComplete = false;
        
        // Roulette wheel numbers and colors (American roulette with 0 and 00)
        this.redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
        this.blackNumbers = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];
        this.greenNumbers = [0, '00']; // 0 and 00 are green
        
        this.spin();
    }
    
    spin() {
        // Generate random number (0-37, where 37 represents 00)
        const randomIndex = Math.floor(Math.random() * 38);
        
        if (randomIndex === 37) {
            this.winningNumber = '00';
            this.winningColor = 'green';
        } else {
            this.winningNumber = randomIndex;
            if (randomIndex === 0) {
                this.winningColor = 'green';
            } else if (this.redNumbers.includes(randomIndex)) {
                this.winningColor = 'red';
            } else {
                this.winningColor = 'black';
            }
        }
        
        this.calculateWinnings();
        this.gameComplete = true;
    }
    
    calculateWinnings() {
        this.results = [];
        this.totalWinnings = 0;
        
        for (const [betType, betAmount] of Object.entries(this.bets)) {
            const result = this.checkBetWin(betType, betAmount);
            this.results.push(result);
            this.totalWinnings += result.winnings;
        }
    }
    
    checkBetWin(betType, betAmount) {
        const result = {
            betType: betType,
            betAmount: betAmount,
            winnings: 0,
            won: false,
            payout: 0
        };
        
        // Straight up bet (single number) - 35:1 payout + original bet = 36x total
        if (betType === this.winningNumber.toString()) {
            result.won = true;
            result.payout = 35;
            result.winnings = betAmount * 36; // 35:1 profit + original bet
        }
        // Color bets - 1:1 payout + original bet = 2x total
        else if (betType === 'red' && this.winningColor === 'red') {
            result.won = true;
            result.payout = 1;
            result.winnings = betAmount * 2; // 1:1 profit + original bet
        }
        else if (betType === 'black' && this.winningColor === 'black') {
            result.won = true;
            result.payout = 1;
            result.winnings = betAmount * 2; // 1:1 profit + original bet
        }
        else if (betType === 'green' && this.winningColor === 'green') {
            result.won = true;
            result.payout = 17;
            result.winnings = betAmount * 18; // 17:1 profit + original bet
        }
        // Odd/Even bets (0 and 00 lose) - 1:1 payout + original bet = 2x total
        else if (betType === 'odd' && typeof this.winningNumber === 'number' && this.winningNumber > 0 && this.winningNumber % 2 === 1) {
            result.won = true;
            result.payout = 1;
            result.winnings = betAmount * 2; // 1:1 profit + original bet
        }
        else if (betType === 'even' && typeof this.winningNumber === 'number' && this.winningNumber > 0 && this.winningNumber % 2 === 0) {
            result.won = true;
            result.payout = 1;
            result.winnings = betAmount * 2; // 1:1 profit + original bet
        }
        // High/Low bets - 1:1 payout + original bet = 2x total
        else if (betType === 'low' && typeof this.winningNumber === 'number' && this.winningNumber >= 1 && this.winningNumber <= 18) {
            result.won = true;
            result.payout = 1;
            result.winnings = betAmount * 2; // 1:1 profit + original bet
        }
        else if (betType === 'high' && typeof this.winningNumber === 'number' && this.winningNumber >= 19 && this.winningNumber <= 36) {
            result.won = true;
            result.payout = 1;
            result.winnings = betAmount * 2; // 1:1 profit + original bet
        }
        // Dozen bets - 2:1 payout + original bet = 3x total
        else if (betType === '1st12' && typeof this.winningNumber === 'number' && this.winningNumber >= 1 && this.winningNumber <= 12) {
            result.won = true;
            result.payout = 2;
            result.winnings = betAmount * 3; // 2:1 profit + original bet
        }
        else if (betType === '2nd12' && typeof this.winningNumber === 'number' && this.winningNumber >= 13 && this.winningNumber <= 24) {
            result.won = true;
            result.payout = 2;
            result.winnings = betAmount * 3; // 2:1 profit + original bet
        }
        else if (betType === '3rd12' && typeof this.winningNumber === 'number' && this.winningNumber >= 25 && this.winningNumber <= 36) {
            result.won = true;
            result.payout = 2;
            result.winnings = betAmount * 3; // 2:1 profit + original bet
        }
        // Column bets - 2:1 payout + original bet = 3x total
        else if (betType === 'col1' && typeof this.winningNumber === 'number' && this.winningNumber > 0 && (this.winningNumber - 1) % 3 === 0) {
            result.won = true;
            result.payout = 2;
            result.winnings = betAmount * 3; // 2:1 profit + original bet
        }
        else if (betType === 'col2' && typeof this.winningNumber === 'number' && this.winningNumber > 0 && (this.winningNumber - 2) % 3 === 0) {
            result.won = true;
            result.payout = 2;
            result.winnings = betAmount * 3; // 2:1 profit + original bet
        }
        else if (betType === 'col3' && typeof this.winningNumber === 'number' && this.winningNumber > 0 && this.winningNumber % 3 === 0) {
            result.won = true;
            result.payout = 2;
            result.winnings = betAmount * 3; // 2:1 profit + original bet
        }
        
        return result;
    }
    
    getTotalBet() {
        return Object.values(this.bets).reduce((sum, bet) => sum + bet, 0);
    }
    
    getWinningNumberDisplay() {
        let display = this.winningNumber.toString();
        let colorEmoji = '';
        
        if (this.winningColor === 'red') {
            colorEmoji = '🔴';
        } else if (this.winningColor === 'black') {
            colorEmoji = '⚫';
        } else if (this.winningColor === 'green') {
            colorEmoji = '🟢';
        }
        
        return `${colorEmoji} ${display}`;
    }
    
    getBetTypeDisplayName(betType) {
        const displayNames = {
            'red': '🔴 Red Numbers',
            'black': '⚫ Black Numbers', 
            'green': '🟢 Green (0/00)',
            'odd': '🔢 Odd Numbers',
            'even': '🔢 Even Numbers',
            'low': '📉 Low (1-18)',
            'high': '📈 High (19-36)',
            '1st12': '1️⃣ First Dozen (1-12)',
            '2nd12': '2️⃣ Second Dozen (13-24)',
            '3rd12': '3️⃣ Third Dozen (25-36)',
            'col1': '🔢 Column 1 (1,4,7...)',
            'col2': '🔢 Column 2 (2,5,8...)',
            'col3': '🔢 Column 3 (3,6,9...)'
        };
        
        // Check if it's a straight number bet
        const num = parseInt(betType);
        if (!isNaN(num) || betType === '00') {
            if (betType === '0') return '🟢 Straight 0';
            if (betType === '00') return '🟢 Straight 00';
            if (this.redNumbers.includes(num)) return `🔴 Straight ${betType}`;
            if (this.blackNumbers.includes(num)) return `⚫ Straight ${betType}`;
        }
        
        return displayNames[betType] || `🎯 ${betType}`;
    }
    
    getRouletteWheel() {
        // Create a visual representation of the roulette wheel area around the winning number
        const numbers = [
            '0', '00', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12',
            '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24',
            '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', '36'
        ];
        
        let wheel = '```\n';
        wheel += '  🎰 ROULETTE WHEEL 🎰\n';
        wheel += '┌─────────────────────┐\n';
        
        // Show a few numbers around the winning number for effect
        const winIndex = numbers.indexOf(this.winningNumber.toString());
        const start = Math.max(0, winIndex - 2);
        const end = Math.min(numbers.length, winIndex + 3);
        
        for (let i = start; i < end; i++) {
            const num = numbers[i];
            const isWinning = num === this.winningNumber.toString();
            const prefix = isWinning ? '→ ' : '  ';
            const suffix = isWinning ? ' ←' : '  ';
            
            wheel += `│${prefix}${num.padStart(2)}${suffix.padEnd(13)}│\n`;
        }
        
        wheel += '└─────────────────────┘\n';
        wheel += '```';
        
        return wheel;
    }
    
    // Static method to get available bet types
    static getBetTypes() {
        return {
            colors: ['red', 'black', 'green'],
            evenMoney: ['odd', 'even', 'low', 'high'],
            dozens: ['1st12', '2nd12', '3rd12'],
            columns: ['col1', 'col2', 'col3'],
            straight: Array.from({length: 37}, (_, i) => i.toString()).concat(['00']) // 0-36 + 00
        };
    }
    
    // Static method to validate bet type
    static isValidBetType(betType) {
        const types = this.getBetTypes();
        return types.colors.includes(betType) ||
               types.evenMoney.includes(betType) ||
               types.dozens.includes(betType) ||
               types.columns.includes(betType) ||
               types.straight.includes(betType);
    }
    
    // Static method to get payout for bet type
    static getBetPayout(betType) {
        const payouts = {
            // Straight up (single number)
            straight: 35,
            // Even money bets
            red: 1, black: 1, odd: 1, even: 1, low: 1, high: 1,
            // Dozens and columns
            '1st12': 2, '2nd12': 2, '3rd12': 2,
            col1: 2, col2: 2, col3: 2,
            // Special
            green: 17
        };
        
        // Check if it's a number bet
        const num = parseInt(betType);
        if (!isNaN(num) || betType === '00') {
            return 35; // Straight up bet
        }
        
        return payouts[betType] || 0;
    }
}

module.exports = RouletteGame;