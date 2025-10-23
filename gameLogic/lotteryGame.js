class LotteryGame {
    constructor(rolloverAmount = 0) {
        this.tickets = []; // Array of { userId, numbers: [1,2,3,4,5], ticketId }
        this.ticketPrice = 100;
        this.drawTime = null;
        this.winningNumbers = null;
        this.winners = [];
        this.prizePool = rolloverAmount; // Start with rollover from previous lottery
        this.rolloverAmount = rolloverAmount; // Track the initial rollover
        this.gameComplete = false;
        this.drawScheduled = false;
    }

    // Buy a ticket with chosen numbers (1-50, pick 5)
    buyTicket(userId, numbers) {
        // Validate numbers
        if (numbers.length !== 5) {
            return { success: false, reason: 'Must pick exactly 5 numbers' };
        }

        const uniqueNumbers = [...new Set(numbers)];
        if (uniqueNumbers.length !== 5) {
            return { success: false, reason: 'Numbers must be unique' };
        }

        for (const num of numbers) {
            if (num < 1 || num > 50) {
                return { success: false, reason: 'Numbers must be between 1 and 50' };
            }
        }

        // Sort numbers for consistency
        const sortedNumbers = numbers.sort((a, b) => a - b);

        // Create ticket
        const ticketId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.tickets.push({
            userId,
            numbers: sortedNumbers,
            ticketId
        });

        this.prizePool += this.ticketPrice;

        return { success: true, ticketId, numbers: sortedNumbers };
    }

    // Draw winning numbers
    draw() {
        const numbers = [];
        while (numbers.length < 5) {
            const num = Math.floor(Math.random() * 50) + 1;
            if (!numbers.includes(num)) {
                numbers.push(num);
            }
        }

        this.winningNumbers = numbers.sort((a, b) => a - b);
        this.calculateWinners();
        this.gameComplete = true;

        return this.winningNumbers;
    }

    // Calculate winners and prize distribution
    calculateWinners() {
        const winnersByMatches = {
            5: [], // Match 5 - Jackpot (60% of pool)
            4: [], // Match 4 - Big prize (25% of pool)
            3: []  // Match 3 - Small prize (15% of pool)
        };

        for (const ticket of this.tickets) {
            const matches = this.countMatches(ticket.numbers, this.winningNumbers);

            if (matches >= 3) {
                winnersByMatches[matches].push(ticket);
            }
        }

        this.winners = [];
        let totalDistributed = 0;

        // Distribute jackpot (60%)
        if (winnersByMatches[5].length > 0) {
            const jackpot = Math.floor(this.prizePool * 0.6);
            const prizePerWinner = Math.floor(jackpot / winnersByMatches[5].length);
            for (const ticket of winnersByMatches[5]) {
                this.winners.push({
                    ...ticket,
                    matches: 5,
                    prize: prizePerWinner
                });
                totalDistributed += prizePerWinner;
            }
        }

        // Distribute big prize (25%)
        if (winnersByMatches[4].length > 0) {
            const bigPrize = Math.floor(this.prizePool * 0.25);
            const prizePerWinner = Math.floor(bigPrize / winnersByMatches[4].length);
            for (const ticket of winnersByMatches[4]) {
                this.winners.push({
                    ...ticket,
                    matches: 4,
                    prize: prizePerWinner
                });
                totalDistributed += prizePerWinner;
            }
        }

        // Distribute small prize (15%)
        if (winnersByMatches[3].length > 0) {
            const smallPrize = Math.floor(this.prizePool * 0.15);
            const prizePerWinner = Math.floor(smallPrize / winnersByMatches[3].length);
            for (const ticket of winnersByMatches[3]) {
                this.winners.push({
                    ...ticket,
                    matches: 3,
                    prize: prizePerWinner
                });
                totalDistributed += prizePerWinner;
            }
        }

        // Calculate rollover amount (undistributed pool)
        this.rolloverForNextGame = this.prizePool - totalDistributed;
    }

    countMatches(ticketNumbers, winningNumbers) {
        let matches = 0;
        for (const num of ticketNumbers) {
            if (winningNumbers.includes(num)) {
                matches++;
            }
        }
        return matches;
    }

    getTotalTickets() {
        return this.tickets.length;
    }

    getUserTickets(userId) {
        return this.tickets.filter(t => t.userId === userId);
    }

    getWinnersForUser(userId) {
        return this.winners.filter(w => w.userId === userId);
    }

    getTotalPrizeForUser(userId) {
        return this.getWinnersForUser(userId).reduce((sum, w) => sum + w.prize, 0);
    }

    getEstimatedJackpot() {
        return Math.floor(this.prizePool * 0.6);
    }
}

module.exports = LotteryGame;
