const Deck = require('./deck');

// 3 Card Poker payouts
const THREE_CARD_POKER_PAYOUTS = {
    // Ante bonus payouts (automatic)
    'straight_flush': 5,
    'three_of_a_kind': 4,
    'straight': 1,

    // Pair Plus payouts
    'pair_plus_straight_flush': 40,
    'pair_plus_three_of_a_kind': 30,
    'pair_plus_straight': 6,
    'pair_plus_flush': 3,
    'pair_plus_pair': 1
};

class ThreeCardPokerGame {
    constructor(userId, anteBet, pairPlusBet = 0) {
        this.userId = userId;
        this.anteBet = anteBet;
        this.pairPlusBet = pairPlusBet;
        this.playBet = 0; // Set when player plays
        this.playerCards = [];
        this.dealerCards = [];
        this.deck = new Deck();
        this.gamePhase = 'dealing'; // 'dealing', 'decision', 'showdown', 'complete'
        this.playerDecision = null; // 'play' or 'fold'
        this.dealCards();
    }

    dealCards() {
        // Deal 3 cards to player and dealer
        for (let i = 0; i < 3; i++) {
            this.playerCards.push(this.deck.drawCard());
            this.dealerCards.push(this.deck.drawCard());
        }
        this.gamePhase = 'decision';
    }

    makeDecision(decision) {
        if (this.gamePhase !== 'decision') return false;

        this.playerDecision = decision;
        if (decision === 'play') {
            this.playBet = this.anteBet; // Play bet equals ante bet
        }
        this.gamePhase = 'showdown';
        return true;
    }

    getPlayerHandRank() {
        return this.evaluateHand(this.playerCards);
    }

    getDealerHandRank() {
        return this.evaluateHand(this.dealerCards);
    }

    evaluateHand(cards) {
        if (cards.length !== 3) return { rank: 'high_card', value: 0 };

        // Sort cards by value for easier evaluation
        const sortedCards = [...cards].sort((a, b) => a.value - b.value);
        const values = sortedCards.map(card => card.value);
        const suits = sortedCards.map(card => card.suit);

        // Check for flush
        const isFlush = suits.every(suit => suit === suits[0]);

        // Check for straight
        const isStraight = this.isStraight(values);

        // Check for pairs/three of a kind
        const valueCounts = {};
        values.forEach(value => {
            valueCounts[value] = (valueCounts[value] || 0) + 1;
        });

        const counts = Object.values(valueCounts).sort((a, b) => b - a);

        // Determine hand rank
        if (isFlush && isStraight) {
            return { rank: 'straight_flush', value: Math.max(...values) };
        } else if (counts[0] === 3) {
            return { rank: 'three_of_a_kind', value: values[1] }; // Middle card in sorted array
        } else if (isStraight) {
            return { rank: 'straight', value: Math.max(...values) };
        } else if (isFlush) {
            return { rank: 'flush', value: Math.max(...values) };
        } else if (counts[0] === 2) {
            const pairValue = Object.keys(valueCounts).find(key => valueCounts[key] === 2);
            return { rank: 'pair', value: parseInt(pairValue) };
        } else {
            return { rank: 'high_card', value: Math.max(...values) };
        }
    }

    isStraight(values) {
        // Handle A-2-3 straight (wheel)
        if (values[0] === 2 && values[1] === 3 && values[2] === 14) {
            return true;
        }
        // Regular straight check
        return values[1] === values[0] + 1 && values[2] === values[1] + 1;
    }

    dealerQualifies() {
        const dealerHand = this.getDealerHandRank();
        // Dealer qualifies with Queen high or better
        return dealerHand.rank !== 'high_card' || dealerHand.value >= 12;
    }

    compareHands() {
        const playerHand = this.getPlayerHandRank();
        const dealerHand = this.getDealerHandRank();

        // First compare rank hierarchy
        const rankOrder = {
            'high_card': 1,
            'pair': 2,
            'flush': 3,
            'straight': 4,
            'three_of_a_kind': 5,
            'straight_flush': 6
        };

        const playerRankValue = rankOrder[playerHand.rank];
        const dealerRankValue = rankOrder[dealerHand.rank];

        if (playerRankValue > dealerRankValue) return 'player';
        if (playerRankValue < dealerRankValue) return 'dealer';

        // Same rank, compare values
        if (playerHand.value > dealerHand.value) return 'player';
        if (playerHand.value < dealerHand.value) return 'dealer';

        return 'tie';
    }

    calculateWinnings() {
        console.log('calculateWinnings called, gamePhase:', this.gamePhase);
        if (this.cachedWinnings) {
            return this.cachedWinnings;
        }
        if (this.gamePhase !== 'showdown') return { total: 0, breakdown: {} };

        let totalWinnings = 0;
        const breakdown = {};

        // Handle fold
        if (this.playerDecision === 'fold') {
            // Lose ante bet
            breakdown.ante = -this.anteBet;
            totalWinnings += breakdown.ante;

            // Pair Plus still pays if won
            breakdown.pairPlus = this.calculatePairPlusWinnings();
            totalWinnings += breakdown.pairPlus;

            this.gamePhase = 'complete';
            return { total: totalWinnings, breakdown };
        }

        // Player played - calculate all payouts
        const playerHand = this.getPlayerHandRank();
        const dealerQualifies = this.dealerQualifies();
        const handComparison = this.compareHands();

        // Ante bonus (automatic for qualifying hands, regardless of dealer)
        if (['straight_flush', 'three_of_a_kind', 'straight'].includes(playerHand.rank)) {
            breakdown.anteBonus = this.anteBet * THREE_CARD_POKER_PAYOUTS[playerHand.rank];
            totalWinnings += breakdown.anteBonus;
        } else {
            breakdown.anteBonus = 0;
        }

        // Ante and Play bets
        if (!dealerQualifies) {
            // Dealer doesn't qualify - ante pays 1:1, play pushes (returns bet)
            breakdown.ante = this.anteBet;
            breakdown.play = 0; // Push - no win/loss
            totalWinnings += breakdown.ante;
        } else {
            // Dealer qualifies - compare hands
            if (handComparison === 'player') {
                // Player wins - both ante and play pay 1:1
                breakdown.ante = this.anteBet;
                breakdown.play = this.playBet;
                totalWinnings += breakdown.ante + breakdown.play;
            } else if (handComparison === 'dealer') {
                // Player loses - lose both ante and play bets
                breakdown.ante = -this.anteBet;
                breakdown.play = -this.playBet;
                totalWinnings += breakdown.ante + breakdown.play;
            } else {
                // Tie - both ante and play push
                breakdown.ante = 0;
                breakdown.play = 0;
            }
        }

        // Pair Plus bet (completely independent)
        breakdown.pairPlus = this.calculatePairPlusWinnings();
        totalWinnings += breakdown.pairPlus;

        this.cachedWinnings = { total: totalWinnings, breakdown };
        this.gamePhase = 'complete';
        return this.cachedWinnings;
    }

    calculatePairPlusWinnings() {
        if (this.pairPlusBet === 0) return 0;

        const playerHand = this.getPlayerHandRank();
        const payouts = {
            'straight_flush': 40,
            'three_of_a_kind': 30,
            'straight': 6,
            'flush': 3,
            'pair': 1
        };

        if (payouts[playerHand.rank]) {
            return this.pairPlusBet * payouts[playerHand.rank];
        }

        return -this.pairPlusBet; // Lost pair plus bet
    }

    getHandDescription(cards) {
        const hand = this.evaluateHand(cards);
        const handNames = {
            'straight_flush': 'Straight Flush',
            'three_of_a_kind': 'Three of a Kind',
            'straight': 'Straight',
            'flush': 'Flush',
            'pair': 'Pair',
            'high_card': 'High Card'
        };
        return handNames[hand.rank] || 'Unknown Hand';
    }

    // Get total amount bet by player
    getTotalBet() {
        return this.anteBet + this.pairPlusBet + this.playBet;
    }

    // Check if game is complete
    isComplete() {
        return this.gamePhase === 'complete';
    }

    // Get game phase for UI
    getGamePhase() {
        return this.gamePhase;
    }

    // Static method to get payout table
    static getPayoutTable() {
        return THREE_CARD_POKER_PAYOUTS;
    }
}

module.exports = ThreeCardPokerGame;