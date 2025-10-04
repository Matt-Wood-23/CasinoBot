class BingoGame {
    constructor(channelId, entryFee = 50) {
        this.channelId = channelId;
        this.entryFee = entryFee;
        this.players = new Map(); // userId -> { card, markedNumbers, hasBingo }
        this.calledNumbers = [];
        this.gameStarted = false;
        this.gameComplete = false;
        this.winners = []; // Array of { userId, type, prize }
        this.prizePool = 0;
        this.currentNumber = null;
        this.maxPlayers = 10;
        this.winTypes = {
            firstBingo: null,
            secondBingo: null,
            thirdBingo: null
        };
    }

    // Join the bingo hall
    addPlayer(userId) {
        if (this.gameStarted) {
            return { success: false, message: 'Game already started!' };
        }
        if (this.players.has(userId)) {
            return { success: false, message: 'You are already in the game!' };
        }
        if (this.players.size >= this.maxPlayers) {
            return { success: false, message: 'Bingo hall is full!' };
        }

        const card = this.generateBingoCard();
        this.players.set(userId, {
            card: card,
            markedNumbers: new Set(),
            hasBingo: false,
            bingoType: null
        });

        this.prizePool += this.entryFee;

        return { success: true, card: card };
    }

    // Remove player before game starts
    removePlayer(userId) {
        if (this.gameStarted) {
            return { success: false, message: 'Cannot leave after game has started!' };
        }
        if (!this.players.has(userId)) {
            return { success: false, message: 'You are not in this game!' };
        }

        this.players.delete(userId);
        this.prizePool -= this.entryFee;

        return { success: true };
    }

    // Generate a traditional 5x5 bingo card
    // B: 1-15, I: 16-30, N: 31-45, G: 46-60, O: 61-75
    generateBingoCard() {
        const card = {
            B: this.getRandomNumbers(1, 15, 5),
            I: this.getRandomNumbers(16, 30, 5),
            N: this.getRandomNumbers(31, 45, 5),
            G: this.getRandomNumbers(46, 60, 5),
            O: this.getRandomNumbers(61, 75, 5)
        };

        // Center is free space
        card.N[2] = 'FREE';

        return card;
    }

    // Get random unique numbers in a range
    getRandomNumbers(min, max, count) {
        const numbers = [];
        const available = [];
        for (let i = min; i <= max; i++) {
            available.push(i);
        }

        for (let i = 0; i < count; i++) {
            const index = Math.floor(Math.random() * available.length);
            numbers.push(available[index]);
            available.splice(index, 1);
        }

        return numbers;
    }

    // Start the game
    startGame() {
        if (this.players.size < 2) {
            return { success: false, message: 'Need at least 2 players to start!' };
        }
        if (this.gameStarted) {
            return { success: false, message: 'Game already started!' };
        }

        this.gameStarted = true;
        return { success: true };
    }

    // Call a new number
    callNumber() {
        if (!this.gameStarted) {
            return { success: false, message: 'Game has not started!' };
        }
        if (this.gameComplete) {
            return { success: false, message: 'Game is already complete!' };
        }

        // Get available numbers
        const allNumbers = [];
        for (let i = 1; i <= 75; i++) {
            if (!this.calledNumbers.includes(i)) {
                allNumbers.push(i);
            }
        }

        if (allNumbers.length === 0) {
            this.gameComplete = true;
            return { success: false, message: 'All numbers have been called!' };
        }

        // Pick random number
        const randomIndex = Math.floor(Math.random() * allNumbers.length);
        this.currentNumber = allNumbers[randomIndex];
        this.calledNumbers.push(this.currentNumber);

        // Auto-mark for all players
        this.autoMarkNumber(this.currentNumber);

        // Check for bingos
        this.checkAllBingos();

        return { success: true, number: this.currentNumber };
    }

    // Automatically mark the number on all player cards
    autoMarkNumber(number) {
        for (const [userId, playerData] of this.players) {
            const card = playerData.card;

            // Check each column
            for (const column of Object.values(card)) {
                if (column.includes(number)) {
                    playerData.markedNumbers.add(number);
                }
            }

            // Free space is always marked
            playerData.markedNumbers.add('FREE');
        }
    }

    // Check all players for bingo
    checkAllBingos() {
        for (const [userId, playerData] of this.players) {
            if (!playerData.hasBingo) {
                const bingoResult = this.checkBingo(userId);
                if (bingoResult.hasBingo) {
                    playerData.hasBingo = true;
                    playerData.bingoType = bingoResult.type;

                    // Assign winner type (1st, 2nd, 3rd)
                    if (!this.winTypes.firstBingo) {
                        this.winTypes.firstBingo = userId;
                    } else if (!this.winTypes.secondBingo) {
                        this.winTypes.secondBingo = userId;
                    } else if (!this.winTypes.thirdBingo) {
                        this.winTypes.thirdBingo = userId;
                        this.gameComplete = true; // End after 3 winners
                    }
                }
            }
        }
    }

    // Check if a player has bingo
    checkBingo(userId) {
        const playerData = this.players.get(userId);
        if (!playerData) return { hasBingo: false };

        const card = playerData.card;
        const marked = playerData.markedNumbers;

        // Check horizontal lines
        const columns = ['B', 'I', 'N', 'G', 'O'];
        for (let row = 0; row < 5; row++) {
            let complete = true;
            for (const col of columns) {
                const value = card[col][row];
                if (value !== 'FREE' && !marked.has(value)) {
                    complete = false;
                    break;
                }
            }
            if (complete) {
                return { hasBingo: true, type: `Row ${row + 1}` };
            }
        }

        // Check vertical lines
        for (const col of columns) {
            let complete = true;
            for (let row = 0; row < 5; row++) {
                const value = card[col][row];
                if (value !== 'FREE' && !marked.has(value)) {
                    complete = false;
                    break;
                }
            }
            if (complete) {
                return { hasBingo: true, type: `Column ${col}` };
            }
        }

        // Check diagonal (top-left to bottom-right)
        let diag1 = true;
        for (let i = 0; i < 5; i++) {
            const value = card[columns[i]][i];
            if (value !== 'FREE' && !marked.has(value)) {
                diag1 = false;
                break;
            }
        }
        if (diag1) {
            return { hasBingo: true, type: 'Diagonal ↘' };
        }

        // Check diagonal (top-right to bottom-left)
        let diag2 = true;
        for (let i = 0; i < 5; i++) {
            const value = card[columns[4 - i]][i];
            if (value !== 'FREE' && !marked.has(value)) {
                diag2 = false;
                break;
            }
        }
        if (diag2) {
            return { hasBingo: true, type: 'Diagonal ↙' };
        }

        return { hasBingo: false };
    }

    // Calculate prizes
    calculatePrizes() {
        const prizes = [];

        if (this.winTypes.firstBingo) {
            const firstPrize = Math.floor(this.prizePool * 0.50);
            prizes.push({ userId: this.winTypes.firstBingo, place: '1st', prize: firstPrize });
        }

        if (this.winTypes.secondBingo) {
            const secondPrize = Math.floor(this.prizePool * 0.30);
            prizes.push({ userId: this.winTypes.secondBingo, place: '2nd', prize: secondPrize });
        }

        if (this.winTypes.thirdBingo) {
            const thirdPrize = Math.floor(this.prizePool * 0.20);
            prizes.push({ userId: this.winTypes.thirdBingo, place: '3rd', prize: thirdPrize });
        }

        return prizes;
    }

    // Get bingo letter for a number
    static getLetterForNumber(number) {
        if (number >= 1 && number <= 15) return 'B';
        if (number >= 16 && number <= 30) return 'I';
        if (number >= 31 && number <= 45) return 'N';
        if (number >= 46 && number <= 60) return 'G';
        if (number >= 61 && number <= 75) return 'O';
        return '?';
    }

    // Get card display for a player
    getCardDisplay(userId) {
        const playerData = this.players.get(userId);
        if (!playerData) return 'No card found';

        const card = playerData.card;
        const marked = playerData.markedNumbers;

        let display = '```\n';
        display += ' B   I   N   G   O \n';
        display += '───────────────────\n';

        for (let row = 0; row < 5; row++) {
            const cols = ['B', 'I', 'N', 'G', 'O'];
            const rowValues = cols.map(col => {
                const value = card[col][row];
                const isMarked = value === 'FREE' || marked.has(value);
                const displayValue = value === 'FREE' ? 'XX' : value.toString().padStart(2, ' ');
                return isMarked ? `[${displayValue}]` : ` ${displayValue} `;
            });
            display += rowValues.join('') + '\n';
        }

        display += '```';
        return display;
    }

    // Get recently called numbers display
    getRecentCalls(count = 10) {
        const recent = this.calledNumbers.slice(-count).reverse();
        return recent.map(num => {
            const letter = BingoGame.getLetterForNumber(num);
            return `${letter}-${num}`;
        }).join(', ');
    }
}

module.exports = BingoGame;
