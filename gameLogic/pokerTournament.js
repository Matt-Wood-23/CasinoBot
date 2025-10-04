const Deck = require('./deck');

class PokerTournament {
    constructor(channelId, buyIn = 100, maxPlayers = 8) {
        this.channelId = channelId;
        this.buyIn = buyIn;
        this.maxPlayers = maxPlayers;
        this.players = new Map(); // userId -> { chips, cards, bet, folded, allIn, eliminated }
        this.prizePool = 0;
        this.tournamentStarted = false;
        this.tournamentComplete = false;
        this.currentRound = 0; // 0 = lobby, 1+ = active rounds
        this.activePlayers = []; // Array of userIds still in current hand
        this.currentPlayerIndex = 0;
        this.pot = 0;
        this.currentBet = 0;
        this.deck = null;
        this.communityCards = [];
        this.phase = 'lobby'; // lobby, preflop, flop, turn, river, showdown, complete
        this.smallBlind = 10;
        this.bigBlind = 20;
        this.dealerButtonIndex = 0;
        this.roundsPlayed = 0;
        this.winners = []; // Array of { userId, place, prize }
        this.handHistory = [];
    }

    // Join tournament
    addPlayer(userId) {
        if (this.tournamentStarted) {
            return { success: false, message: 'Tournament already started!' };
        }
        if (this.players.has(userId)) {
            return { success: false, message: 'You are already registered!' };
        }
        if (this.players.size >= this.maxPlayers) {
            return { success: false, message: 'Tournament is full!' };
        }

        const startingChips = 1000; // Everyone starts with 1000 chips
        this.players.set(userId, {
            chips: startingChips,
            cards: [],
            bet: 0,
            folded: false,
            allIn: false,
            eliminated: false,
            hasActed: false
        });

        this.prizePool += this.buyIn;

        return { success: true };
    }

    // Remove player before tournament starts
    removePlayer(userId) {
        if (this.tournamentStarted) {
            return { success: false, message: 'Cannot leave after tournament has started!' };
        }
        if (!this.players.has(userId)) {
            return { success: false, message: 'You are not registered!' };
        }

        this.players.delete(userId);
        this.prizePool -= this.buyIn;

        return { success: true };
    }

    // Start tournament
    startTournament() {
        if (this.players.size < 2) {
            return { success: false, message: 'Need at least 2 players to start!' };
        }
        if (this.tournamentStarted) {
            return { success: false, message: 'Tournament already started!' };
        }

        this.tournamentStarted = true;
        this.activePlayers = Array.from(this.players.keys());
        this.phase = 'preflop';

        // Start first hand
        this.startNewHand();

        return { success: true };
    }

    // Start a new hand
    startNewHand() {
        this.deck = new Deck();
        this.communityCards = [];
        this.pot = 0;
        this.currentBet = 0;
        this.phase = 'preflop';
        this.roundsPlayed++;

        // Reset player states for new hand
        for (const [userId, player] of this.players) {
            if (!player.eliminated) {
                player.cards = [];
                player.bet = 0;
                player.folded = false;
                player.allIn = false;
                player.hasActed = false;
            }
        }

        // Get active players
        this.activePlayers = Array.from(this.players.keys()).filter(
            userId => !this.players.get(userId).eliminated
        );

        if (this.activePlayers.length === 1) {
            // Tournament over - only one player left
            this.endTournament();
            return;
        }

        // Increase blinds every 5 rounds
        if (this.roundsPlayed % 5 === 0 && this.roundsPlayed > 0) {
            this.smallBlind = Math.floor(this.smallBlind * 1.5);
            this.bigBlind = Math.floor(this.bigBlind * 1.5);
        }

        // Move dealer button
        this.dealerButtonIndex = (this.dealerButtonIndex + 1) % this.activePlayers.length;

        // Post blinds
        this.postBlinds();

        // Deal cards
        this.dealCards();

        // Set current player (after big blind)
        this.currentPlayerIndex = (this.dealerButtonIndex + 3) % this.activePlayers.length;
    }

    // Post small and big blinds
    postBlinds() {
        if (this.activePlayers.length < 2) return;

        const smallBlindIndex = (this.dealerButtonIndex + 1) % this.activePlayers.length;
        const bigBlindIndex = (this.dealerButtonIndex + 2) % this.activePlayers.length;

        const smallBlindPlayer = this.players.get(this.activePlayers[smallBlindIndex]);
        const bigBlindPlayer = this.players.get(this.activePlayers[bigBlindIndex]);

        // Small blind
        const sbAmount = Math.min(this.smallBlind, smallBlindPlayer.chips);
        smallBlindPlayer.chips -= sbAmount;
        smallBlindPlayer.bet = sbAmount;
        this.pot += sbAmount;
        if (smallBlindPlayer.chips === 0) smallBlindPlayer.allIn = true;

        // Big blind
        const bbAmount = Math.min(this.bigBlind, bigBlindPlayer.chips);
        bigBlindPlayer.chips -= bbAmount;
        bigBlindPlayer.bet = bbAmount;
        this.pot += bbAmount;
        this.currentBet = bbAmount;
        if (bigBlindPlayer.chips === 0) bigBlindPlayer.allIn = true;
    }

    // Deal cards to players
    dealCards() {
        for (const userId of this.activePlayers) {
            const player = this.players.get(userId);
            if (!player.eliminated) {
                player.cards = [this.deck.draw(), this.deck.draw()];
            }
        }
    }

    // Get current player
    getCurrentPlayer() {
        return this.activePlayers[this.currentPlayerIndex];
    }

    // Player actions
    fold(userId) {
        const player = this.players.get(userId);
        if (!player || player.folded || player.eliminated) return false;

        player.folded = true;
        player.hasActed = true;

        this.advanceToNextPlayer();
        return true;
    }

    call(userId) {
        const player = this.players.get(userId);
        if (!player || player.folded || player.eliminated) return false;

        const callAmount = this.currentBet - player.bet;
        const actualAmount = Math.min(callAmount, player.chips);

        player.chips -= actualAmount;
        player.bet += actualAmount;
        this.pot += actualAmount;
        player.hasActed = true;

        if (player.chips === 0) player.allIn = true;

        this.advanceToNextPlayer();
        return true;
    }

    raise(userId, amount) {
        const player = this.players.get(userId);
        if (!player || player.folded || player.eliminated) return false;

        const totalBet = this.currentBet + amount;
        const raiseAmount = totalBet - player.bet;
        const actualAmount = Math.min(raiseAmount, player.chips);

        player.chips -= actualAmount;
        player.bet += actualAmount;
        this.pot += actualAmount;
        this.currentBet = player.bet;
        player.hasActed = true;

        if (player.chips === 0) player.allIn = true;

        // Reset hasActed for other players
        for (const [uid, p] of this.players) {
            if (uid !== userId && !p.folded && !p.allIn && !p.eliminated) {
                p.hasActed = false;
            }
        }

        this.advanceToNextPlayer();
        return true;
    }

    check(userId) {
        const player = this.players.get(userId);
        if (!player || player.folded || player.eliminated) return false;
        if (player.bet < this.currentBet) return false; // Can't check, must call or fold

        player.hasActed = true;
        this.advanceToNextPlayer();
        return true;
    }

    // Advance to next player or next phase
    advanceToNextPlayer() {
        // Check if betting round is complete
        if (this.isBettingRoundComplete()) {
            this.advancePhase();
            return;
        }

        // Move to next active player
        let tries = 0;
        do {
            this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.activePlayers.length;
            tries++;
        } while (
            tries < this.activePlayers.length &&
            (this.players.get(this.activePlayers[this.currentPlayerIndex]).folded ||
             this.players.get(this.activePlayers[this.currentPlayerIndex]).allIn ||
             this.players.get(this.activePlayers[this.currentPlayerIndex]).eliminated)
        );
    }

    // Check if betting round is complete
    isBettingRoundComplete() {
        const activePlayers = this.activePlayers.filter(userId => {
            const p = this.players.get(userId);
            return !p.folded && !p.eliminated;
        });

        if (activePlayers.length === 1) return true; // Only one player left

        // Check if all players have acted and matched the current bet
        for (const userId of activePlayers) {
            const player = this.players.get(userId);
            if (!player.allIn && (!player.hasActed || player.bet < this.currentBet)) {
                return false;
            }
        }

        return true;
    }

    // Advance to next phase
    advancePhase() {
        // Reset bets for next round
        for (const player of this.players.values()) {
            player.bet = 0;
            player.hasActed = false;
        }
        this.currentBet = 0;

        if (this.phase === 'preflop') {
            this.phase = 'flop';
            this.communityCards.push(this.deck.draw(), this.deck.draw(), this.deck.draw());
            this.currentPlayerIndex = (this.dealerButtonIndex + 1) % this.activePlayers.length;
        } else if (this.phase === 'flop') {
            this.phase = 'turn';
            this.communityCards.push(this.deck.draw());
            this.currentPlayerIndex = (this.dealerButtonIndex + 1) % this.activePlayers.length;
        } else if (this.phase === 'turn') {
            this.phase = 'river';
            this.communityCards.push(this.deck.draw());
            this.currentPlayerIndex = (this.dealerButtonIndex + 1) % this.activePlayers.length;
        } else if (this.phase === 'river') {
            this.phase = 'showdown';
            this.showdown();
        }
    }

    // Showdown - determine winner
    showdown() {
        const activePlayers = this.activePlayers.filter(userId => {
            const p = this.players.get(userId);
            return !p.folded && !p.eliminated;
        });

        if (activePlayers.length === 1) {
            // Only one player left, they win
            const winner = activePlayers[0];
            this.players.get(winner).chips += this.pot;
            this.handHistory.push({ winner, pot: this.pot });
        } else {
            // Evaluate hands and determine winner
            const winner = this.evaluateWinner(activePlayers);
            this.players.get(winner).chips += this.pot;
            this.handHistory.push({ winner, pot: this.pot });
        }

        // Eliminate players with 0 chips
        for (const [userId, player] of this.players) {
            if (player.chips <= 0) {
                player.eliminated = true;
                this.recordElimination(userId);
            }
        }

        // Check if tournament should continue
        const remainingPlayers = Array.from(this.players.values()).filter(p => !p.eliminated);

        if (remainingPlayers.length === 1) {
            this.endTournament();
        } else {
            this.phase = 'handComplete';
        }
    }

    // Simple hand evaluation (placeholder - would need full poker hand ranking)
    evaluateWinner(playerIds) {
        // For now, random winner - you'd implement full hand ranking here
        return playerIds[Math.floor(Math.random() * playerIds.length)];
    }

    // Record player elimination
    recordElimination(userId) {
        const remainingPlayers = Array.from(this.players.values()).filter(p => !p.eliminated).length;
        const place = remainingPlayers + 1;

        // Award prizes based on placement
        let prize = 0;
        if (place === 1) prize = Math.floor(this.prizePool * 0.50);
        else if (place === 2) prize = Math.floor(this.prizePool * 0.30);
        else if (place === 3) prize = Math.floor(this.prizePool * 0.20);

        if (prize > 0) {
            this.winners.push({ userId, place, prize });
        }
    }

    // End tournament
    endTournament() {
        this.tournamentComplete = true;
        this.phase = 'complete';

        // Award first place
        const winner = Array.from(this.players.entries()).find(([_, p]) => !p.eliminated);
        if (winner) {
            const [userId] = winner;
            const firstPrize = Math.floor(this.prizePool * 0.50);
            this.winners.unshift({ userId, place: 1, prize: firstPrize });
        }
    }

    // Get player count
    getPlayerCount() {
        return this.players.size;
    }

    // Get active player count
    getActivePlayerCount() {
        return Array.from(this.players.values()).filter(p => !p.eliminated).length;
    }
}

module.exports = PokerTournament;
