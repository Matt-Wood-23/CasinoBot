const Deck = require('./deck');
const { randomUUID } = require('crypto');
const { isNaturalBlackjack } = require('../utils/cardHelpers');

class BlackjackGame {
    constructor(channelId, creatorId, bet, isMultiPlayer, isDuel = false) {

        // Ensure bet is a valid number
        const validBet = (typeof bet === 'number' && !isNaN(bet) && bet > 0) ? Math.floor(bet) : 0;

        this.channelId = channelId;
        this.players = new Map([[creatorId, {
            bet: validBet,
            hands: [{ cards: [], bet: validBet }],
            stood: false,
            currentHandIndex: 0,
            hasSplit: false
        }]]);
        this.dealer = { cards: [], stood: false };
        this.deck = new Deck();
        this.dealingPhase = 0;
        this.currentPlayerIndex = 0;
        this.gameOver = false;
        this.isMultiPlayer = isMultiPlayer;
        this.isDuel = isDuel;
        this.interactionId = null;
        // The message this game is drawn on. Button handling resolves games by
        // user or channel, but renders target whichever message was clicked, so
        // without this the two can drift apart and one hand gets painted onto
        // another hand's message.
        this.messageId = null;
        this.interactionStartTime = Date.now();
        this.bettingPhase = false;
        this.readyPlayers = new Map();
        this.dealerHoleCard = null;
        this.isDealing = false; // Flag to prevent concurrent dealing
        this.isDealerAnimating = false; // Flag to prevent concurrent dealer animations
        this.settled = false; // True once payouts have been applied, so they only run once
        this.naturalsStood = false; // True once the deal stood a player on a natural
        this.gameId = randomUUID(); // Unique game ID
    }

    // Multi-player methods
    addPlayer(playerId, bet) {
        if (!this.isMultiPlayer || this.dealingPhase > 0 || this.bettingPhase) return false;

        // Ensure bet is a valid number
        const validBet = (typeof bet === 'number' && !isNaN(bet) && bet > 0) ? Math.floor(bet) : 0;

        this.players.set(playerId, {
            bet: validBet,
            hands: [{ cards: [], bet: validBet }],
            stood: false,
            currentHandIndex: 0,
            hasSplit: false
        });
        return true;
    }

    startBettingPhase() {
        this.bettingPhase = true;
        this.readyPlayers.clear();
        this.gameOver = true; // Prevent actions during betting
    }

    confirmBet(playerId, bet) {
        if (!this.players.has(playerId)) return false;
        this.readyPlayers.set(playerId, bet);
        return true;
    }

    allPlayersReady() {
        return this.players.size > 0 && this.readyPlayers.size === this.players.size;
    }

    removePlayer(playerId) {
        if (this.players.has(playerId)) {
            this.players.delete(playerId);
            this.readyPlayers.delete(playerId);
            return true;
        }
        return false;
    }

    // Card dealing
    dealNextCard() {
        // Phase 5 is the last one. Guard here so a caller that over-runs the
        // loop cannot push dealingPhase past the value the UI checks against.
        if (this.dealingPhase >= 5) return;

        this.dealingPhase++;

        if (this.dealingPhase === 1 || this.dealingPhase === 2) {
            // Deal cards to all players
            for (const player of this.players.values()) {
                player.hands[0].cards.push(this.deck.drawCard());
            }
            // Duel games have no dealer — skip dealer phases entirely
            if (this.isDuel && this.dealingPhase === 2) {
                this.dealingPhase = 5;
            }
        } else if (!this.isDuel) {
            if (this.dealingPhase === 3) {
                // Deal dealer up card
                this.dealer.cards.push(this.deck.drawCard());
            } else if (this.dealingPhase === 4) {
                // Deal dealer hole card
                this.dealerHoleCard = this.deck.drawCard();
            } else if (this.dealingPhase === 5) {
                // The dealer peeks. A dealer blackjack ends the hand outright;
                // otherwise every player already holding a natural is done.
                if (this.hasDealerBlackjack()) {
                    this.dealer.cards.push(this.dealerHoleCard);
                    this.dealerHoleCard = null;
                    this.gameOver = true;
                } else {
                    this.standNaturals();
                }
            }
        }
    }

    // Game logic
    hasBlackjack(cards) {
        return cards.length === 2 && this.calculateScore(cards) === 21;
    }

    hasDealerBlackjack() {
        return this.hasBlackjack([...this.dealer.cards, this.dealerHoleCard].filter(card => card !== null));
    }

    calculateScore(cards, useAces = true) {
        let score = 0;
        let aces = 0;
        
        for (let card of cards) {
            if (!card) continue;
            let value = card.getBlackjackValue();
            if (value === 11) aces++;
            score += value;
        }
        
        while (useAces && score > 21 && aces > 0) {
            score -= 10;
            aces--;
        }
        
        return score;
    }

    getHandScore(userId, handIndex) {
        const player = this.players.get(userId);
        return this.calculateScore(player.hands[handIndex].cards);
    }

    getDealerScore(showHole = false) {
        const cards = showHole ? 
            [...this.dealer.cards, this.dealerHoleCard].filter(card => card !== null) : 
            this.dealer.cards;
        return this.calculateScore(cards);
    }

    getDealerCards(showHole = false) {
        return showHole ? 
            [...this.dealer.cards, this.dealerHoleCard].filter(card => card !== null) : 
            this.dealer.cards;
    }

    // True while the dealer is still holding a face-down card. Display code must
    // key off this rather than dealingPhase: once dealerPlay() reveals the hole
    // card it moves into dealer.cards, and a phase-based check keeps drawing a
    // card back that is no longer there.
    hasHiddenDealerCard() {
        return this.dealerHoleCard !== null && this.dealerHoleCard !== undefined;
    }

    // A natural is the original two-card 21 only. Hands created by splitting
    // pay even money, so they must not be treated as naturals for the 3:2
    // payout or the progressive jackpot.
    isNaturalHand(userId, handIndex) {
        const player = this.players.get(userId);
        if (!player || player.hasSplit) return false;
        return isNaturalBlackjack(player.hands[handIndex]);
    }

    hasNaturalBlackjack(userId) {
        const player = this.players.get(userId);
        if (!player || player.hasSplit) return false;
        return player.hands.some(hand => isNaturalBlackjack(hand));
    }

    // Player actions
    canSplit(userId) {
        const player = this.players.get(userId);
        if (!player || player.hasSplit || !player.hands || 
            player.hands.length === 0 || player.hands[0].cards.length !== 2) return false;
            
        const card1 = player.hands[0].cards[0];
        const card2 = player.hands[0].cards[1];
        return card1.getBlackjackValue() === card2.getBlackjackValue();
    }

    split(userId) {
        const player = this.players.get(userId);
        if (!this.canSplit(userId)) return false;

        const originalHand = player.hands[0];
        const splitCard = originalHand.cards.pop();

        // Ensure bet is valid
        const baseBet = (typeof player.bet === 'number' && !isNaN(player.bet)) ? player.bet : 0;
        const handBet = (typeof originalHand.bet === 'number' && !isNaN(originalHand.bet)) ? originalHand.bet : baseBet;

        player.hands.push({
            cards: [splitCard],
            bet: handBet,
            stood: false,
            doubled: false
        });

        player.hands[0].cards.push(this.deck.drawCard());
        player.hands[1].cards.push(this.deck.drawCard());
        player.hasSplit = true;
        player.bet = baseBet * 2;

        return true;
    }

    hit(userId) {
        if (this.gameOver) return false;
        const player = this.players.get(userId);
        if (!player || player.stood) return false;
        
        const currentHand = player.hands[player.currentHandIndex];
        if (!currentHand || currentHand.stood) return false;
        
        currentHand.cards.push(this.deck.drawCard());
        
        if (this.getHandScore(userId, player.currentHandIndex) > 21) {
            this.moveToNextHand(userId);
        }
        
        return true;
    }

    stand(userId) {
        if (this.gameOver) return false;

        const player = this.players.get(userId);
        if (!player || player.stood) return false;

        const currentHand = player.hands[player.currentHandIndex];
        if (!currentHand || currentHand.stood) return false;

        currentHand.stood = true;
        this.moveToNextHand(userId);
        return true;
    }

    double(userId) {
        if (this.gameOver) return false;

        const player = this.players.get(userId);
        if (!player || player.stood) return false;

        const doubledHandIndex = player.currentHandIndex;
        const currentHand = player.hands[doubledHandIndex];
        if (!currentHand || currentHand.stood ||
            currentHand.cards.length !== 2 || currentHand.doubled) return false;

        // Ensure bet is valid before doubling
        if (typeof currentHand.bet !== 'number' || isNaN(currentHand.bet)) {
            currentHand.bet = (typeof player.bet === 'number' && !isNaN(player.bet)) ? player.bet : 0;
        }

        currentHand.bet = Math.floor(currentHand.bet * 2);
        currentHand.doubled = true;

        this.hit(userId);

        // A busting hit already advanced past this hand. Standing again here
        // would stand the NEXT split hand before its owner ever played it.
        if (!this.gameOver && player.currentHandIndex === doubledHandIndex) {
            this.stand(userId);
        }

        return true;
    }

    getCurrentHand(userId) {
        const player = this.players.get(userId);
        if (!player.hands || player.hands.length === 0) return null;
        if (player.currentHandIndex >= player.hands.length) return null;
        return player.hands[player.currentHandIndex];
    }

    moveToNextHand(userId) {
        const player = this.players.get(userId);
        player.currentHandIndex++;

        if (player.currentHandIndex >= player.hands.length) {
            player.stood = true;
            this.checkAllPlayersDone();
        } else {
            while (player.currentHandIndex < player.hands.length) {
                const currentHand = player.hands[player.currentHandIndex];
                if (this.getHandScore(userId, player.currentHandIndex) > 21) {
                    player.currentHandIndex++;
                } else {
                    break;
                }
            }

            if (player.currentHandIndex >= player.hands.length) {
                player.stood = true;
                this.checkAllPlayersDone();
            }
        }
    }

    checkAllPlayersDone() {
        if (this.players.size === 0) {
            this.gameOver = true;
            return;
        }
        
        if (Array.from(this.players.values()).every(player => player.stood)) {
            if (this.isDuel) {
                this.gameOver = true;
            } else {
                this.dealerPlay();
            }
        } else {
            let nextIndex = (this.currentPlayerIndex + 1) % this.players.size;
            let checkedPlayers = 0;
            
            while (checkedPlayers < this.players.size) {
                const nextPlayerId = Array.from(this.players.keys())[nextIndex];
                const nextPlayer = this.players.get(nextPlayerId);
                
                if (!nextPlayer.stood) {
                    this.currentPlayerIndex = nextIndex;
                    return;
                }
                
                nextIndex = (nextIndex + 1) % this.players.size;
                checkedPlayers++;
            }
            
            this.dealerPlay();
        }
    }

    /**
     * Stand every player dealt a two-card 21.
     *
     * A natural is already decided the moment the dealer's peek comes back
     * empty: it cannot be improved and it cannot be beaten. Making the player
     * click Stand on it only slowed the hand down — and with Hit disabled at
     * 21, Stand was the single legal move anyway.
     *
     * Called after the peek, so it never runs when the dealer has blackjack.
     */
    standNaturals() {
        for (const [playerId, player] of this.players) {
            if (player.stood || !this.isNaturalHand(playerId, 0)) continue;

            player.hands[0].stood = true;
            player.currentHandIndex = player.hands.length;
            player.stood = true;
            this.naturalsStood = true;
        }

        if (!this.naturalsStood) return;

        // Hand the table to whoever still has a decision, or to the dealer.
        const playerIds = Array.from(this.players.keys());
        const nextLive = playerIds.findIndex(id => !this.players.get(id).stood);

        if (nextLive === -1) {
            this.dealerPlay();
        } else {
            this.currentPlayerIndex = nextLive;
        }
    }

    /**
     * Does the dealer still have a decision to make?
     *
     * Only a live hand that could still be beaten needs one. Busted hands have
     * already lost and naturals have already won, so a table made up only of
     * those is settled and the dealer just shows its hole card.
     */
    needsDealerHand() {
        for (const [playerId, player] of this.players) {
            for (let i = 0; i < player.hands.length; i++) {
                if (this.calculateScore(player.hands[i].cards) > 21) continue;
                if (this.isNaturalHand(playerId, i)) continue;
                return true;
            }
        }
        return false;
    }

    // Move the hole card face up. Returns true only on the flip itself so the
    // caller can render that single frame on its own.
    revealDealerHoleCard() {
        if (!this.hasHiddenDealerCard()) return false;
        this.dealer.cards.push(this.dealerHoleCard);
        this.dealerHoleCard = null;
        return true;
    }

    // The dealer's turn is split into discrete steps so the UI can pace it:
    //   dealerPlay()           -> the dealer's turn has begun
    //   revealDealerHoleCard() -> flip the down card
    //   shouldDealerContinue() -> does the dealer need another card?
    //   drawDealerCard()       -> take exactly one card
    // Nothing here reveals or draws implicitly, so a caller that renders
    // between steps shows the table in the same order a real dealer plays it.
    dealerPlay() {
        if (this.gameOver) return;
        this.dealer.isDrawing = true;
    }

    // Draw exactly one card, if the dealer is entitled to one.
    drawDealerCard() {
        if (!this.shouldDealerContinue()) return false;
        this.dealer.cards.push(this.deck.drawCard());
        // Re-evaluate straight away so a caller rendering right after this sees
        // a hand already marked finished, rather than one still labelled as
        // drawing for a card that is never coming.
        this.shouldDealerContinue();
        return true;
    }

    shouldDealerContinue() {
        if (!this.dealer.isDrawing) return false;

        // Safety net for callers that do not animate: the dealer must never
        // act on a hand it has not turned face up.
        this.revealDealerHoleCard();

        if (!this.needsDealerHand() || this.calculateScore(this.dealer.cards) >= 17) {
            this.finishDealerTurn();
            return false;
        }

        return true;
    }

    finishDealerTurn() {
        this.dealer.isDrawing = false;
        this.gameOver = true;
    }

    // Results calculation
    getResult(userId, handIndex = null) {
        if (!this.gameOver) return null;
        const player = this.players.get(userId);
        
        if (handIndex === null) {
            return player.hands.map((_, index) => this.getHandResult(userId, index));
        }
        
        return this.getHandResult(userId, handIndex);
    }

    getHandResult(userId, handIndex) {
        const player = this.players.get(userId);
        const hand = player.hands[handIndex];
        const playerScore = this.calculateScore(hand.cards);
        const dealerScore = this.getDealerScore(true);

        if (playerScore > 21) return 'lose';

        // Check blackjack before dealer bust so natural BJ always pays 3:2.
        // isNaturalHand() excludes split hands, which pay even money.
        if (this.isNaturalHand(userId, handIndex)) {
            if (dealerScore === 21 && this.getDealerCards(true).length === 2) return 'push';
            return 'blackjack';
        }

        if (dealerScore > 21) return 'win';

        if (playerScore > dealerScore) return 'win';
        if (playerScore < dealerScore) return 'lose';
        return 'push';
    }

    getWinnings(userId) {
        if (!this.gameOver) return 0;
        const player = this.players.get(userId);
        let totalWinnings = 0;

        // Calculate main blackjack winnings
        for (let i = 0; i < player.hands.length; i++) {
            const result = this.getHandResult(userId, i);
            let handBet = player.hands[i].bet;

            // Ensure bet is valid
            if (typeof handBet !== 'number' || isNaN(handBet)) {
                console.error(`Invalid bet for hand ${i} of player ${userId}: ${handBet}, using player.bet as fallback`);
                handBet = (typeof player.bet === 'number' && !isNaN(player.bet)) ? player.bet : 0;
            }

            switch (result) {
                case 'blackjack':
                    totalWinnings += Math.floor(handBet * 1.5);
                    break;
                case 'win':
                    totalWinnings += handBet;
                    break;
                case 'push':
                    totalWinnings += 0;
                    break;
                case 'lose':
                    totalWinnings -= handBet;
                    break;
            }
        }

        return totalWinnings;
    }

    calculatePvPWinner(playerAId, playerBId) {
        const playerA = this.players.get(playerAId);
        const playerB = this.players.get(playerBId);

        if (!playerA || !playerB) return { isPush: true };

        const scoreA = this.calculateScore(playerA.hands[0].cards);
        const scoreB = this.calculateScore(playerB.hands[0].cards);
        const bustA = scoreA > 21;
        const bustB = scoreB > 21;
        const totalPot = this.getTotalBet(playerAId) + this.getTotalBet(playerBId);

        // Both bust = push
        if (bustA && bustB) return { isPush: true };

        let winnerId = null;

        if (bustA) {
            winnerId = playerBId;
        } else if (bustB) {
            winnerId = playerAId;
        } else if (scoreA > scoreB) {
            winnerId = playerAId;
        } else if (scoreB > scoreA) {
            winnerId = playerBId;
        } else {
            return { isPush: true };
        }

        return {
            winnerId,
            amount: totalPot,
            isPush: false
        };
    }

    getTotalBet(userId) {
        const player = this.players.get(userId);
        return player.hands.reduce((total, hand) => {
            const bet = (typeof hand.bet === 'number' && !isNaN(hand.bet)) ? hand.bet : 0;
            return total + bet;
        }, 0);
    }
}

module.exports = BlackjackGame;