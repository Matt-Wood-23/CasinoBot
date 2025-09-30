const Deck = require('./deck');
const { liam } = require('../config'); // liam user ID for rigging features

class BlackjackGame {
    constructor(channelId, creatorId, bet, isMultiPlayer) {
        this.channelId = channelId;
        this.players = new Map([[creatorId, {
            bet,
            hands: [{ cards: [], bet }],
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
        this.interactionId = null;
        this.interactionStartTime = Date.now();
        this.bettingPhase = false;
        this.readyPlayers = new Map();
        this.dealerHoleCard = null;
    }

    // Multi-player methods
    addPlayer(playerId, bet) {
        if (!this.isMultiPlayer || this.dealingPhase > 0 || this.bettingPhase) return false;
        this.players.set(playerId, { 
            bet, 
            hands: [{ cards: [], bet }], 
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
        this.dealingPhase++;
        
        if (this.dealingPhase === 1 || this.dealingPhase === 2) {
            // Deal cards to all players
            for (const player of this.players.values()) {
                player.hands[0].cards.push(this.deck.drawCard());
            }
        } else if (this.dealingPhase === 3) {
            // Deal dealer up card (with admin debug feature)
            if (this.players.has(liam)) {
                this.dealer.cards.push(this.deck.drawSpecificCard(14, 'spades'));
            } else {
                this.dealer.cards.push(this.deck.drawCard());
            }
        } else if (this.dealingPhase === 4) {
            // Deal dealer hole card (with admin debug feature)
            if (this.players.has(liam)) {
                this.dealerHoleCard = this.deck.drawSpecificCard(13, 'spades');
            } else {
                this.dealerHoleCard = this.deck.drawCard();
            }
        } else if (this.dealingPhase === 5) {
            // Check for dealer blackjack
            if (this.hasDealerBlackjack()) {
                this.dealer.cards.push(this.dealerHoleCard);
                this.dealerHoleCard = null;
                this.gameOver = true;
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
        
        player.hands.push({
            cards: [splitCard],
            bet: player.bet,
            stood: false,
            doubled: false
        });
        
        player.hands[0].cards.push(this.deck.drawCard());
        player.hands[1].cards.push(this.deck.drawCard());
        player.hasSplit = true;
        player.bet *= 2;
        
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
        const player = this.players.get(userId);
        if (!player) return;
        
        const currentHand = player.hands[player.currentHandIndex];
        if (!currentHand) return;
        
        currentHand.stood = true;
        this.moveToNextHand(userId);
    }

    double(userId) {
        const player = this.players.get(userId);
        if (!player || player.hands[player.currentHandIndex].cards.length !== 2 || 
            player.hands[player.currentHandIndex].doubled) return false;
            
        const currentHand = player.hands[player.currentHandIndex];
        currentHand.bet *= 2;
        currentHand.doubled = true;
        
        this.hit(userId);
        if (!this.gameOver) {
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
            this.dealerPlay();
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

    dealerPlay() {
        if (this.dealerHoleCard) {
            this.dealer.cards.push(this.dealerHoleCard);
            this.dealerHoleCard = null;
        }

        // Admin debug: don't draw cards for admin
        if (this.players.has(liam)) {
            this.gameOver = true;
            return;
        }

        const allHandsBusted = Array.from(this.players.values()).every(player =>
            player.hands.every(hand => this.calculateScore(hand.cards) > 21));

        // Mark that dealer is now playing but game is not over yet
        this.dealer.isDrawing = true;

        if (!allHandsBusted) {
            // Only draw one card at a time - the caller will handle the animation
            if (this.calculateScore(this.dealer.cards) < 17) {
                this.dealer.cards.push(this.deck.drawCard());
                return; // Exit after drawing one card
            }
        }

        // If we reach here, dealer is done drawing
        this.dealer.isDrawing = false;
        this.gameOver = true;
    }

    shouldDealerContinue() {
        if (!this.dealer.isDrawing) return false;

        const allHandsBusted = Array.from(this.players.values()).every(player =>
            player.hands.every(hand => this.calculateScore(hand.cards) > 21));

        if (allHandsBusted) {
            this.dealer.isDrawing = false;
            this.gameOver = true;
            return false;
        }

        const shouldContinue = this.calculateScore(this.dealer.cards) < 17;
        if (!shouldContinue) {
            this.dealer.isDrawing = false;
            this.gameOver = true;
        }
        return shouldContinue;
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
        if (dealerScore > 21) return 'win';
        
        if (playerScore === 21 && hand.cards.length === 2) {
            const hasAce = hand.cards.some(card => card.value === 14);
            const hasTen = hand.cards.some(card => card.getBlackjackValue() === 10);
            
            if (hasAce && hasTen) {
                if (dealerScore === 21 && this.getDealerCards(true).length === 2) return 'push';
                return 'blackjack';
            }
        }
        
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
            const handBet = player.hands[i].bet;

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

    getTotalBet(userId) {
        const player = this.players.get(userId);
        return player.hands.reduce((total, hand) => total + hand.bet, 0);
    }
}

module.exports = BlackjackGame;