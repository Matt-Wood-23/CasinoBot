const { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, GatewayIntentBits, ButtonStyle } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');
const { token, ALLOWED_CHANNEL_IDS, ADMIN_USER_ID, liam } = require('./config');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Game data storage
const DATA_FILE = path.join(__dirname, 'blackjack_data.json');
let userData = {};
let activeGames = new Map();

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

// 3 Card Poker payouts
const THREE_CARD_POKER_PAYOUTS = {
    // Ante bonus payouts (automatic)
    'straight_flush': 5,
    'three_of_a_kind': 4,
    'straight': 1,

    // Play bet payouts (1:1 for qualifying dealer hands)
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

        this.gamePhase = 'complete';
        return { total: totalWinnings, breakdown };
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
}

class SlotsGame {
    constructor(userId, bet) {
        this.userId = userId;
        this.bet = bet;
        this.reels = [];
        this.lines = 3; // Multi-line: 3 paylines
        this.symbolsPerReel = 3; // 3 rows
        this.spin();
    }

    spin() {
        this.reels = [];
        for (let i = 0; i < 3; i++) { // 3 reels
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
        // Check each payline (horizontal lines: top, middle, bottom)
        for (let line = 0; line < this.lines; line++) {
            const combo = `${this.reels[0][line]}${this.reels[1][line]}${this.reels[2][line]}`;
            if (SLOTS_PAYOUTS[combo]) {
                totalWin += this.bet * SLOTS_PAYOUTS[combo];
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
}

class Card {
    constructor(value, suit) {
        this.value = value;
        this.suit = suit;
    }

    getName() {
        const suits = { 'hearts': '♥️', 'diamonds': '♦️', 'clubs': '♣️', 'spades': '♠️' };
        const names = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
        const displayValue = names[this.value] || this.value.toString();
        return `${displayValue}${suits[this.suit]}`;
    }

    getBlackjackValue() {
        if (this.value >= 11 && this.value <= 13) return 10;
        if (this.value === 14) return 11;
        return this.value;
    }
}

class Deck {
    constructor() {
        this.reset();
    }

    reset() {
        this.cards = [];
        const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
        for (let suit of suits) {
            for (let value = 2; value <= 14; value++) {
                this.cards.push(new Card(value, suit));
            }
        }
        this.shuffle();
    }

    shuffle() {
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    drawCard() {
        if (this.cards.length === 0) this.reset();
        return this.cards.pop();
    }

    drawSpecificCard(value, suit) {
        const index = this.cards.findIndex(card => card.value === value && card.suit === suit);
        if (index !== -1) {
            return this.cards.splice(index, 1)[0];
        }
        return new Card(value, suit);
    }
}

class BlackjackGame {
    constructor(channelId, creatorId, bet, isMultiPlayer) {
        this.channelId = channelId;
        this.players = new Map([[creatorId, { bet, hands: [{ cards: [], bet }], stood: false, currentHandIndex: 0, hasSplit: false }]]);
        this.dealer = { cards: [], stood: false };
        this.deck = new Deck();
        this.dealingPhase = 0;
        this.currentPlayerIndex = 0;
        this.gameOver = false;
        this.isMultiPlayer = isMultiPlayer;
        this.interactionId = null;
        this.interactionStartTime = Date.now();
        this.bettingPhase = false;
        this.sideBetPhase = false; // Add this line after this.bettingPhase = false;
        this.sideBetTimer = null;
        this.readyPlayers = new Map();
        this.sideBets = new Map(); // playerId -> {insurance: amount, perfectPairs: amount}
        this.insuranceOffered = false;
        this.perfectPairsResults = new Map(); // playerId -> {result: string, payout: number}
    }

    startSideBetPhase() {
        this.sideBetPhase = true;
        this.sideBetTimer = setTimeout(() => {
            this.sideBetPhase = false;
            this.startDealing();
        }, 15000); // 15 seconds to place side bets
    }

    startDealing() {
        // This will trigger the card dealing process
        this.sideBetPhase = false;
        if (this.sideBetTimer) {
            clearTimeout(this.sideBetTimer);
            this.sideBetTimer = null;
        }
    }

    addSideBet(playerId, betType, amount) {
        if (!this.players.has(playerId)) return false;

        if (!this.sideBets.has(playerId)) {
            this.sideBets.set(playerId, { insurance: 0, perfectPairs: 0 });
        }

        const playerSideBets = this.sideBets.get(playerId);
        if (betType === 'insurance' && this.dealingPhase >= 3 && !this.gameOver) {
            playerSideBets.insurance = amount;
        } else if (betType === 'perfectPairs' && (this.sideBetPhase || this.dealingPhase < 3)) {
            playerSideBets.perfectPairs = amount;
        } else {
            return false;
        }

        return true;
    }

    checkInsuranceEligible() {
        if (this.dealingPhase < 3 || this.insuranceOffered) return false;
        if (this.dealer.cards.length === 0) return false;

        const dealerUpCard = this.dealer.cards[0];
        return dealerUpCard.value === 14; // Ace
    }

    // Add this method to BlackjackGame class:
    evaluatePerfectPairs(playerId) {
        const player = this.players.get(playerId);
        if (!player || player.hands[0].cards.length < 2) return { result: 'lose', payout: 0 };

        const card1 = player.hands[0].cards[0];
        const card2 = player.hands[0].cards[1];

        if (card1.value === card2.value) {
            if (card1.suit === card2.suit) {
                return { result: 'perfect_pair', payout: 25 }; // Perfect Pair (same rank, same suit)
            } else if ((card1.suit === 'hearts' || card1.suit === 'diamonds') ===
                (card2.suit === 'hearts' || card2.suit === 'diamonds')) {
                return { result: 'colored_pair', payout: 12 }; // Colored Pair (same rank, same color)
            } else {
                return { result: 'red_black_pair', payout: 6 }; // Red/Black Pair (same rank, different colors)
            }
        }

        return { result: 'lose', payout: 0 };
    }

    // Add this method to BlackjackGame class:
    calculateSideBetWinnings(playerId) {
        let totalWinnings = 0;
        const sideBets = this.sideBets.get(playerId);
        if (!sideBets) return 0;

        // Insurance
        if (sideBets.insurance > 0) {
            if (this.hasDealerBlackjack()) {
                totalWinnings += sideBets.insurance * 2; // Insurance pays 2:1
            } else {
                totalWinnings -= sideBets.insurance; // Lost insurance bet
            }
        }

        // Perfect Pairs
        if (sideBets.perfectPairs > 0) {
            const perfectPairsResult = this.evaluatePerfectPairs(playerId);
            this.perfectPairsResults.set(playerId, perfectPairsResult);

            if (perfectPairsResult.result !== 'lose') {
                totalWinnings += sideBets.perfectPairs * perfectPairsResult.payout;
            } else {
                totalWinnings -= sideBets.perfectPairs;
            }
        }

        return totalWinnings;
    }

    addPlayer(playerId, bet) {
        if (!this.isMultiPlayer || this.dealingPhase > 0 || this.bettingPhase) return false;
        this.players.set(playerId, { bet, hands: [{ cards: [], bet }], stood: false, currentHandIndex: 0, hasSplit: false });
        return true;
    }

    startBettingPhase() {
        this.bettingPhase = true;
        this.readyPlayers.clear();
        this.gameOver = true;
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

    dealNextCard() {
        this.dealingPhase++;
        if (this.dealingPhase === 1 || this.dealingPhase === 2) {
            for (const player of this.players.values()) {
                player.hands[0].cards.push(this.deck.drawCard());
            }
        } else if (this.dealingPhase === 3) {
            if (this.players.has(liam)) {
                this.dealer.cards.push(this.deck.drawSpecificCard(14, 'spades'));
            } else {
                this.dealer.cards.push(this.deck.drawCard());
            }

            // Check for insurance eligibility
            if (this.checkInsuranceEligible()) {
                this.insuranceOffered = true;
            }
        } else if (this.dealingPhase === 4) {
            if (this.players.has(liam)) {
                this.dealerHoleCard = this.deck.drawSpecificCard(13, 'spades');
            } else {
                this.dealerHoleCard = this.deck.drawCard();
            }
        } else if (this.dealingPhase === 5) {
            if (this.hasDealerBlackjack()) {
                this.dealer.cards.push(this.dealerHoleCard);
                this.dealerHoleCard = null;
                this.gameOver = true;
            }
        }
    }

    hasBlackjack(cards) {
        return cards.length === 2 && this.calculateScore(cards) === 21;
    }

    hasDealerBlackjack() {
        return this.hasBlackjack([...this.dealer.cards, this.dealerHoleCard].filter(card => card !== null));
    }

    canSplit(userId) {
        const player = this.players.get(userId);
        if (!player || player.hasSplit || !player.hands || player.hands.length === 0 || player.hands[0].cards.length !== 2) return false;
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
        const cards = showHole ? [...this.dealer.cards, this.dealerHoleCard].filter(card => card !== null) : this.dealer.cards;
        return this.calculateScore(cards);
    }

    getDealerCards(showHole = false) {
        return showHole ? [...this.dealer.cards, this.dealerHoleCard].filter(card => card !== null) : this.dealer.cards;
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
        if (!player || player.hands[player.currentHandIndex].cards.length !== 2 || player.hands[player.currentHandIndex].doubled) return false;
        const currentHand = player.hands[player.currentHandIndex];
        currentHand.bet *= 2;
        currentHand.doubled = true;
        this.hit(userId);
        if (!this.gameOver) {
            this.stand(userId);
        }
        return true;
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
        if (this.players.has(liam)) {
            return;
        }
        const allHandsBusted = Array.from(this.players.values()).every(player =>
            player.hands.every(hand => this.calculateScore(hand.cards) > 21));
        if (!allHandsBusted) {
            while (this.calculateScore(this.dealer.cards) < 17) {
                this.dealer.cards.push(this.deck.drawCard());
            }
        }
        this.gameOver = true;
    }

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

        // Add side bet winnings
        totalWinnings += this.calculateSideBetWinnings(userId);

        return totalWinnings;
    }

    getTotalBet(userId) {
        const player = this.players.get(userId);
        return player.hands.reduce((total, hand) => total + hand.bet, 0);
    }

    getCurrentHand(userId) {
        const player = this.players.get(userId);
        if (!player.hands || player.hands.length === 0) return null;
        if (player.currentHandIndex >= player.hands.length) return null;
        return player.hands[player.currentHandIndex];
    }
}

async function loadUserData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        userData = JSON.parse(data);
    } catch (error) {
        userData = {};
        await saveUserData();
    }
}

async function saveUserData() {
    try {
        await fs.writeFile(DATA_FILE, JSON.stringify(userData, null, 2));
        console.log('User data saved successfully');
    } catch (error) {
        console.error('Error saving user data:', error);
    }
}

async function getUserMoney(userId) {
    if (!userData[userId]) {
        userData[userId] = {
            money: 500,
            lastDaily: 0,
            statistics: {
                gamesPlayed: 0,
                gamesWon: 0,
                totalWagered: 0,
                totalWinnings: 0,
                biggestWin: 0,
                biggestLoss: 0,
                blackjacks: 0,
                handsPlayed: 0,
                slotsSpins: 0,
                slotsWins: 0,
                threeCardPokerGames: 0,
                threeCardPokerWins: 0
            },
            gameHistory: [],
            giftsReceived: 0,
            giftsSent: 0
        };
    } else {
        userData[userId].money = userData[userId].money ?? 500;
        userData[userId].lastDaily = userData[userId].lastDaily ?? 0;
        userData[userId].statistics = userData[userId].statistics ?? {
            gamesPlayed: 0,
            gamesWon: 0,
            totalWagered: 0,
            totalWinnings: 0,
            biggestWin: 0,
            biggestLoss: 0,
            blackjacks: 0,
            handsPlayed: 0,
            slotsSpins: 0,
            slotsWins: 0,
            threeCardPokerGames: 0,
            threeCardPokerWins: 0
        };
        // Explicitly set null/undefined fields to 0 to prevent toString() errors
        const stats = userData[userId].statistics;
        stats.gamesPlayed = stats.gamesPlayed ?? 0;
        stats.gamesWon = stats.gamesWon ?? 0;
        stats.totalWagered = stats.totalWagered ?? 0;
        stats.totalWinnings = stats.totalWinnings ?? 0;
        stats.biggestWin = stats.biggestWin ?? 0;
        stats.biggestLoss = stats.biggestLoss ?? 0;
        stats.blackjacks = stats.blackjacks ?? 0;
        stats.handsPlayed = stats.handsPlayed ?? 0;
        stats.slotsSpins = stats.slotsSpins ?? 0;
        stats.slotsWins = stats.slotsWins ?? 0;
        stats.threeCardPokerGames = stats.threeCardPokerGames ?? 0;
        stats.threeCardPokerWins = stats.threeCardPokerWins ?? 0;
        userData[userId].gameHistory = userData[userId].gameHistory ?? [];
        userData[userId].giftsReceived = userData[userId].giftsReceived ?? 0;
        userData[userId].giftsSent = userData[userId].giftsSent ?? 0;
    }
    await saveUserData();
    console.log(`User data ensured for ${userId}`);
    return userData[userId].money;
}

async function setUserMoney(userId, amount) {
    await getUserMoney(userId);
    userData[userId].money = amount;
    await saveUserData();
}

async function recordGameResult(userId, gameType, bet, winnings, result, details = {}) {
    if (!userData[userId]) await getUserMoney(userId);

    const gameRecord = {
        timestamp: Date.now(),
        gameType,
        bet,
        winnings,
        result,
        details,
        id: Date.now() + Math.random()
    };

    userData[userId].gameHistory.unshift(gameRecord);
    if (userData[userId].gameHistory.length > 50) {
        userData[userId].gameHistory = userData[userId].gameHistory.slice(0, 50);
    }

    const stats = userData[userId].statistics;
    stats.gamesPlayed++;
    stats.totalWagered += bet;
    stats.totalWinnings += winnings + bet;

    if (result === 'win' || result === 'blackjack') {
        stats.gamesWon++;
        if (winnings > stats.biggestWin) stats.biggestWin = winnings;
    }

    if (winnings < 0 && Math.abs(winnings) > stats.biggestLoss) {
        stats.biggestLoss = Math.abs(winnings);
    }

    if (result === 'blackjack') stats.blackjacks++;
    if (details.handsPlayed) stats.handsPlayed += details.handsPlayed;
    if (gameType === 'slots') {
        stats.slotsSpins++;
        if (winnings > 0) stats.slotsWins++;
    }
    if (gameType === 'three_card_poker') {
        stats.threeCardPokerGames++;
        if (winnings > 0) stats.threeCardPokerWins++;
    }

    await saveUserData();
}

async function canClaimDaily(userId) {
    await getUserMoney(userId);
    const now = Date.now();
    const lastDaily = userData[userId].lastDaily || 0;
    const timeSinceLastDaily = now - lastDaily;
    const oneDayInMs = 24 * 60 * 60 * 1000;
    return timeSinceLastDaily >= oneDayInMs;
}

async function setLastDaily(userId) {
    if (!userData[userId]) userData[userId] = { money: 500, lastDaily: 0 };
    userData[userId].lastDaily = Date.now();
    await saveUserData();
}

function getTimeUntilNextDaily(userId) {
    if (!userData[userId]) return 0;
    const now = Date.now();
    const lastDaily = userData[userId].lastDaily || 0;
    const oneDayInMs = 24 * 60 * 60 * 1000;
    const timeUntilNext = oneDayInMs - (now - lastDaily);
    return Math.max(0, timeUntilNext);
}

// Utility function to fix corrupted userData
function fixUserData() {
    for (const userId in userData) {
        if (userData[userId].slotsStats) {
            userData[userId].slotsStats.totalWagered = Number(userData[userId].slotsStats.totalWagered) || 0;
            userData[userId].slotsStats.totalWinnings = Number(userData[userId].slotsStats.totalWinnings) || 0;
        }
    }
    saveUserData();
}

// Updated initializeUserData function
function initializeUserData(userId) {
    if (!userData[userId]) {
        userData[userId] = {
            money: 500,
            blackjackStats: { gamesPlayed: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0 },
            slotsStats: { spins: 0, wins: 0, losses: 0, totalWagered: 0, totalWinnings: 0 }
        };
        saveUserData();
    }
    // Ensure slotsStats fields are numbers
    userData[userId].slotsStats.totalWagered = Number(userData[userId].slotsStats.totalWagered) || 0;
    userData[userId].slotsStats.totalWinnings = Number(userData[userId].slotsStats.totalWinnings) || 0;
    return userData[userId];
}

async function createGameEmbed(game, userId) {
    let embed;
    if (game.constructor.name === 'ThreeCardPokerGame') {
        // Three Card Poker embed
        const userMoney = userData[userId] ? userData[userId].money : 500;
        embed = new EmbedBuilder()
            .setTitle('🃏 3 Card Poker')
            .setColor(game.gamePhase === 'complete' ? (game.calculateWinnings().total >= 0 ? '#00FF00' : '#FF0000') : '#0099FF');

        // Player cards (always visible)
        const playerCardsText = game.playerCards.map(card => card.getName()).join(' ');
        const playerHandDesc = game.getHandDescription(game.playerCards);
        embed.addFields({
            name: '🎰 Your Cards',
            value: `${playerCardsText}\n**${playerHandDesc}**`,
            inline: false
        });

        // Dealer cards (show based on game phase)
        if (game.gamePhase === 'decision') {
            embed.addFields({
                name: '🏠 Dealer Cards',
                value: '🂠 🂠 🂠 (Hidden)',
                inline: false
            });
        } else {
            const dealerCardsText = game.dealerCards.map(card => card.getName()).join(' ');
            const dealerHandDesc = game.getHandDescription(game.dealerCards);
            const qualifiesText = game.dealerQualifies() ? '✅ Qualifies' : '❌ Does Not Qualify';
            embed.addFields({
                name: '🏠 Dealer Cards',
                value: `${dealerCardsText}\n**${dealerHandDesc}** (${qualifiesText})`,
                inline: false
            });
        }

        // Betting information
        let bettingInfo = `💰 Ante: ${game.anteBet}`;
        if (game.pairPlusBet > 0) {
            bettingInfo += `\n🎯 Pair Plus: ${game.pairPlusBet}`;
        }
        if (game.playBet > 0) {
            bettingInfo += `\n🎲 Play: ${game.playBet}`;
        }
        embed.addFields({
            name: '💰 Bets',
            value: bettingInfo,
            inline: true
        });

        embed.addFields({
            name: '💵 Your Money',
            value: `${userMoney}`,
            inline: true
        });

        // Game status/results
        if (game.gamePhase === 'decision') {
            embed.setDescription('**Your Turn!** Choose to Play (bet equals ante) or Fold.');
        } else if (game.gamePhase === 'showdown') {
            embed.setDescription('**Showdown!** Cards revealed, calculating results...');
        } else if (game.gamePhase === 'complete') {
            const winnings = game.calculateWinnings();
            let resultText = '';

            if (game.playerDecision === 'fold') {
                resultText = `💸 **You folded!**\n`;
            } else {
                const comparison = game.compareHands();
                if (comparison === 'player') {
                    resultText = `🎉 **You won!**\n`;
                } else if (comparison === 'dealer') {
                    resultText = `💸 **Dealer won!**\n`;
                } else {
                    resultText = `🤝 **Tie!**\n`;
                }
            }

            // Breakdown
            if (winnings.breakdown.anteBonus) {
                resultText += `🌟 Ante Bonus: +${winnings.breakdown.anteBonus}\n`;
            }
            if (winnings.breakdown.ante !== undefined) {
                resultText += `💰 Ante: ${winnings.breakdown.ante >= 0 ? '+' : ''}${winnings.breakdown.ante}\n`;
            }
            if (winnings.breakdown.play !== undefined) {
                resultText += `🎲 Play: ${winnings.breakdown.play >= 0 ? '+' : ''}${winnings.breakdown.play}\n`;
            }
            if (winnings.breakdown.pairPlus !== undefined && winnings.breakdown.pairPlus !== 0) {
                resultText += `🎯 Pair Plus: ${winnings.breakdown.pairPlus >= 0 ? '+' : ''}${winnings.breakdown.pairPlus}\n`;
            }

            resultText += `\n**Total: ${winnings.total >= 0 ? '+' : ''}${winnings.total}**`;

            embed.addFields({
                name: '📊 Result',
                value: resultText,
                inline: false
            });
        }

        return embed;
    } else if (game.constructor.name === 'SlotsGame') {
        // Slots embed
        const userMoney = userData[userId] ? userData[userId].money : 500;
        embed = new EmbedBuilder()
            .setTitle('🎰 Slot Machine')
            .setColor(game.winnings > 0 ? '#00FF00' : '#FF0000')
            .setDescription(`**Bet: ${game.bet}**\n${game.getGrid()}\n**Winnings: ${game.winnings > 0 ? '+' : ''}${game.winnings}**`)
            .addFields(
                {
                    name: '💵 Your Money',
                    value: `${userMoney}`,
                    inline: true
                }
            );
        if (game.winnings > 0) {
            embed.addFields({
                name: '🎉 Win!',
                value: `You won on ${game.lines} lines!`,
                inline: false
            });
        } else {
            embed.addFields({
                name: '😔 No Win',
                value: 'Better luck next time!',
                inline: false
            });
        }
        return embed;
    } else if (game.isMultiPlayer) {
        embed = new EmbedBuilder()
            .setTitle('🃏 Blackjack Table')
            .setColor(game.gameOver ? '#FFD700' : '#0099FF');
        if (game.bettingPhase) {
            let bettingText = `Waiting for players to ready up...\n\n**Your Bet: ${game.players.get(userId)?.bet || 'Not in game'}**\n\n`;
            for (const [playerId, player] of game.players) {
                let username = 'Unknown User';
                try {
                    const user = client.users.cache.get(playerId) || await client.users.fetch(playerId);
                    username = user.username;
                } catch (error) {
                    console.error(`Error fetching user ${playerId}:`, error);
                }
                const ready = game.readyPlayers.has(playerId);
                bettingText += `${username}: ${ready ? `✅ Ready (${game.readyPlayers.get(playerId)})` : `⏳ Not Ready (${player.bet})`}\n`;
            }
            embed.setDescription(bettingText);
            embed.addFields({
                name: '📊 Status',
                value: 'Waiting for all players to confirm bets...',
                inline: false
            });
        } else {
            let dealerText = 'Waiting for cards...';
            if (game.dealingPhase >= 3) {
                dealerText = (game.dealer.cards && Array.isArray(game.dealer.cards))
                    ? game.dealer.cards.map(card => card.getName()).join(' ')
                    : 'No dealer cards yet';
                if (game.dealingPhase >= 4 && !game.gameOver) {
                    dealerText += ' 🂠 (??)';
                } else if (game.gameOver) {
                    dealerText = game.getDealerCards(true).map(card => card.getName()).join(' ');
                }
            }
            embed.addFields({
                name: '🏠 Dealer Cards',
                value: dealerText + (game.gameOver ? ` (${game.getDealerScore(true)})` : game.dealingPhase >= 3 ? ` (${game.getDealerScore(false)})` : ''),
                inline: false
            });
            let currentPlayerId = Array.from(game.players.keys())[game.currentPlayerIndex];
            for (const [playerId, player] of game.players) {
                if (!player.hands || player.hands.length === 0) continue;
                let username = 'Unknown User';
                try {
                    const user = client.users.cache.get(playerId) || await client.users.fetch(playerId);
                    username = user.username;
                } catch (error) {
                    console.error(`Error fetching user ${playerId}:`, error);
                }
                for (let i = 0; i < player.hands.length; i++) {
                    const hand = player.hands[i];
                    const visibleCards = game.dealingPhase >= 2 ? hand.cards : (game.dealingPhase === 1 ? [hand.cards[0]] : []);
                    const handScore = game.dealingPhase >= 2 ? game.calculateScore(hand.cards) : (game.dealingPhase === 1 ? game.calculateScore([hand.cards[0]]) : 0);
                    const isCurrentHand = i === player.currentHandIndex && !game.gameOver && game.dealingPhase >= 5 && playerId === currentPlayerId && !player.stood;
                    const handName = player.hands.length > 1 ? `🎰 ${username} - Hand ${i + 1}${isCurrentHand ? ' (Current)' : ''}` : `🎰 ${username}`;
                    let handValue = visibleCards.length > 0 ? `${visibleCards.map(card => card.getName()).join(' ')} (${handScore})` : 'Waiting for cards...';
                    if (game.dealingPhase >= 2) {
                        if (handScore > 21) handValue += ' **BUST**';
                        if (handScore === 21 && hand.cards.length === 2) handValue += ' **BLACKJACK**';
                    }
                    embed.addFields({
                        name: handName,
                        value: `${handValue}\n💰 Bet: ${hand.bet}`,
                        inline: true
                    });
                }
            }
            if (game.gameOver) {
                embed.setDescription('Game over! Results displayed below.');
                let resultText = 'Results:\n';
                for (const [playerId, player] of game.players) {
                    let username = 'Unknown User';
                    try {
                        const user = client.users.cache.get(playerId) || await client.users.fetch(playerId);
                        username = user.username;
                    } catch (error) {
                        console.error(`Error fetching user ${playerId}:`, error);
                    }
                    const results = game.getResult(playerId);
                    const totalWinnings = game.getWinnings(playerId);
                    resultText += `${username}:\n`;
                    for (let i = 0; i < results.length; i++) {
                        const handBet = player.hands[i].bet;
                        const result = results[i];
                        let handResult = '';
                        switch (result) {
                            case 'blackjack':
                                handResult = `Won ${Math.floor(handBet * 1.5)}`;
                                break;
                            case 'win':
                                handResult = `Won ${handBet}`;
                                break;
                            case 'lose':
                                handResult = `Lost ${handBet}`;
                                break;
                            case 'push':
                                handResult = `Push`;
                                break;
                        }
                        resultText += `Hand ${i + 1}: ${handResult}\n`;
                    }
                    resultText += `**Total: ${totalWinnings >= 0 ? '+' : ''}${totalWinnings}**\n`;
                }
                embed.addFields({ name: '📊 Results', value: resultText, inline: false });
            } else if (game.dealingPhase < 5) {
                embed.setDescription('Waiting for players or dealing cards...');
                embed.addFields({
                    name: '📊 Status',
                    value: 'Dealing cards...',
                    inline: false
                });
            } else {
                const currentPlayerId = Array.from(game.players.keys())[game.currentPlayerIndex];
                let username = 'Unknown User';
                try {
                    const user = client.users.cache.get(currentPlayerId) || await client.users.fetch(currentPlayerId);
                    username = user.username;
                } catch (error) {
                    console.error(`Error fetching user ${currentPlayerId}:`, error);
                }
                embed.setDescription(`Waiting for ${username}'s action...`);
                embed.addFields({
                    name: '📊 Status',
                    value: `Waiting for ${username}'s action...`,
                    inline: false
                });
            }
        }
    } else {
        const player = game.players.get(userId);
        const userMoney = userData[userId] ? userData[userId].money : 500;
        embed = new EmbedBuilder()
            .setTitle('🃏 Blackjack Game')
            .setColor(game.gameOver ? (game.getWinnings(userId) >= 0 ? '#00FF00' : '#FF0000') : '#0099FF');
        if (!player.hands || player.hands.length === 0) {
            embed.setDescription('Game data corrupted. Please start a new game.');
            embed.addFields({ name: '❌ Error', value: 'Game data corrupted. Please start a new game.', inline: false });
            return embed;
        }
        for (let i = 0; i < player.hands.length; i++) {
            const hand = player.hands[i];
            const visibleCards = game.dealingPhase >= 2 ? hand.cards : (game.dealingPhase === 1 ? [hand.cards[0]] : []);
            const handScore = game.dealingPhase >= 2 ? game.calculateScore(hand.cards) : (game.dealingPhase === 1 ? game.calculateScore([hand.cards[0]]) : 0);
            const isCurrentHand = i === player.currentHandIndex && !game.gameOver && game.dealingPhase >= 5;
            const handName = player.hands.length > 1 ? `🎰 Hand ${i + 1}${isCurrentHand ? ' (Current)' : ''}` : '🎰 Your Cards';
            let handValue = visibleCards.length > 0 ? `${visibleCards.map(card => card.getName()).join(' ')} (${handScore})` : 'Waiting for cards...';
            if (game.dealingPhase >= 2) {
                if (handScore > 21) handValue += ' **BUST**';
                if (handScore === 21 && hand.cards.length === 2) handValue += ' **BLACKJACK**';
            }
            embed.addFields({
                name: handName,
                value: handValue,
                inline: true
            });
        }
        let dealerText = 'Waiting for cards...';
        if (game.dealingPhase >= 3) {
            dealerText = (game.dealer.cards && Array.isArray(game.dealer.cards))
                ? game.dealer.cards.map(card => card.getName()).join(' ')
                : 'No dealer cards yet';
            if (game.dealingPhase >= 4 && !game.gameOver) {
                dealerText += ' 🂠 (??)';
            } else if (game.gameOver) {
                dealerText = game.getDealerCards(true).map(card => card.getName()).join(' ');
            }
        }
        embed.addFields({
            name: '🏠 Dealer Cards',
            value: dealerText + (game.gameOver ? ` (${game.getDealerScore(true)})` : game.dealingPhase >= 3 ? ` (${game.getDealerScore(false)})` : ''),
            inline: true
        });
        embed.addFields(
            {
                name: '💰 Main Bet',
                value: `${game.getTotalBet(userId)}`,
                inline: true
            },
            {
                name: '💵 Your Money',
                value: `${userMoney}`,
                inline: true
            }
        );
        const sideBets = game.sideBets.get(userId);
        if (sideBets && (sideBets.insurance > 0 || sideBets.perfectPairs > 0)) {
            let sideBetText = '';
            if (sideBets.perfectPairs > 0) {
                sideBetText += `🎯 Perfect Pairs: ${sideBets.perfectPairs}`;
                if (game.perfectPairsResults.has(userId)) {
                    const result = game.perfectPairsResults.get(userId);
                    if (result.result !== 'lose') {
                        sideBetText += ` ✅ ${result.result.replace('_', ' ').toUpperCase()} (+${sideBets.perfectPairs * result.payout})`;
                    } else {
                        sideBetText += ` ❌ Lost`;
                    }
                }
            }
            if (sideBets.insurance > 0) {
                if (sideBetText) sideBetText += '\n';
                sideBetText += `🛡️ Insurance: ${sideBets.insurance}`;
                if (game.gameOver) {
                    if (game.hasDealerBlackjack()) {
                        sideBetText += ` ✅ (+${sideBets.insurance * 2})`;
                    } else {
                        sideBetText += ` ❌ Lost`;
                    }
                }
            }

            embed.addFields({
                name: '🎲 Side Bets',
                value: sideBetText,
                inline: true
            });
        }
        if (game.gameOver) {
            embed.setDescription('Game over! Results displayed below.');
            const totalWinnings = game.getWinnings(userId);
            let resultText = '';
            const results = game.getResult(userId);
            if (player.hands.length === 1) {
                const result = results[0];
                if (game.hasDealerBlackjack() && !game.hasBlackjack(player.hands[0].cards)) {
                    resultText = `💸 Dealer has BLACKJACK! You lost ${Math.abs(totalWinnings)}!`;
                } else {
                    switch (result) {
                        case 'blackjack':
                            resultText = `🎉 BLACKJACK! You won ${totalWinnings}!`;
                            break;
                        case 'win':
                            resultText = `🎉 You won ${totalWinnings}!`;
                            break;
                        case 'lose':
                            resultText = `💸 You lost ${Math.abs(totalWinnings)}!`;
                            break;
                        case 'push':
                            resultText = `🤝 Push! Bet returned.`;
                            break;
                    }
                }
            } else {
                resultText = 'Results:\n';
                for (let i = 0; i < results.length; i++) {
                    const handBet = player.hands[i].bet;
                    const result = results[i];
                    let handResult = '';
                    switch (result) {
                        case 'blackjack':
                            handResult = `Won ${Math.floor(handBet * 1.5)}`;
                            break;
                        case 'win':
                            handResult = `Won ${handBet}`;
                            break;
                        case 'lose':
                            handResult = `Lost ${handBet}`;
                            break;
                        case 'push':
                            handResult = `Push`;
                            break;
                    }
                    resultText += `Hand ${i + 1}: ${handResult}\n`;
                }
                resultText += `**Total: ${totalWinnings >= 0 ? '+' : ''}${totalWinnings}**`;
            }
            embed.addFields({ name: '📊 Result', value: resultText, inline: false });
        } else if (game.dealingPhase < 5) {
            embed.setDescription('Waiting for players or dealing cards...');
            embed.addFields({
                name: '📊 Status',
                value: 'Dealing cards...',
                inline: false
            });
        }
    }
    return embed;
}
function createSideBetButtons(game, userId) {
    const buttons = [];

    // During side bet phase, show both options
    if (game.sideBetPhase) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId('perfect_pairs_bet')
                .setLabel('Perfect Pairs')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🎯')
        );

        // Add a "Start Game" button to skip waiting
        buttons.push(
            new ButtonBuilder()
                .setCustomId('start_dealing')
                .setLabel('Start Dealing')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('▶️')
        );
    }

    // Insurance button (only when dealer shows Ace)
    if (game.checkInsuranceEligible() && !game.gameOver && !game.sideBetPhase) {
        const sideBets = game.sideBets.get(userId);
        const hasInsurance = sideBets && sideBets.insurance > 0;
        if (!hasInsurance) {
            buttons.push(
                new ButtonBuilder()
                    .setCustomId('insurance_bet')
                    .setLabel('Insurance')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🛡️')
            );
        }
    }

    return buttons.length > 0 ? new ActionRowBuilder().addComponents(buttons) : null;
}

function createButtons(game, userId) {
    if (game.constructor.name === 'ThreeCardPokerGame') {
        if (game.gamePhase === 'decision') {
            return new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('poker_play')
                        .setLabel(`Play (${game.anteBet})`)
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🎲'),
                    new ButtonBuilder()
                        .setCustomId('poker_fold')
                        .setLabel('Fold')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🚫')
                );
        } else if (game.gamePhase === 'complete') {
            return new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('poker_play_again')
                        .setLabel('Play Again')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🔄')
                );
        } else {
            return new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('poker_calculating')
                        .setLabel('Calculating...')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true)
                );
        }
    }

    if (game.constructor.name === 'SlotsGame') {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('spin_again')
                    .setLabel('Spin Again')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎰')
            );
    }

    if (game.bettingPhase) {
        if (!game.players.has(userId)) {
            return new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('not_in_game')
                        .setLabel('Not in Game')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true)
                );
        }
        const player = game.players.get(userId);
        const buttons = [
            new ButtonBuilder()
                .setCustomId('keep_bet')
                .setLabel(`Keep Bet (${player.bet})`)
                .setStyle(ButtonStyle.Primary)
                .setEmoji('✅'),
            new ButtonBuilder()
                .setCustomId('adjust_bet')
                .setLabel('Adjust Bet')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('✏️'),
            new ButtonBuilder()
                .setCustomId('leave_table')
                .setLabel('Leave Table')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🚪')
        ];
        if (game.readyPlayers.has(userId)) {
            buttons.forEach(button => button.setDisabled(true).setLabel(`Ready (${game.readyPlayers.get(userId)})`));
        }
        return new ActionRowBuilder().addComponents(buttons);
    }

    if (game.gameOver) {
        if (game.isMultiPlayer) {
            return new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('continue_playing')
                        .setLabel('Continue Playing')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🔄')
                );
        } else {
            if (userId !== Array.from(game.players.keys())[0]) {
                return new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('not_your_game')
                            .setLabel('Not Your Game')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true)
                    );
            }
            return new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('play_again_single')
                        .setLabel('Play Again')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🔄')
                );
        }
    }

    let targetPlayerId;
    if (game.isMultiPlayer) {
        targetPlayerId = Array.from(game.players.keys())[game.currentPlayerIndex];
    } else {
        targetPlayerId = Array.from(game.players.keys())[0];
        if (userId !== targetPlayerId) {
            return new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('not_your_game')
                        .setLabel('Not Your Game')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true)
                );
        }
    }

    const player = game.players.get(targetPlayerId);
    if (!player || player.stood || !player.hands[player.currentHandIndex]) {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('inactive')
                    .setLabel(game.isMultiPlayer ? `${client.users.cache.get(targetPlayerId)?.username || 'Player'}'s Turn` : 'No Active Hand')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
            );
    }

    let username = 'Player';
    try {
        const user = client.users.cache.get(targetPlayerId);
        username = user ? user.username : 'Player';
    } catch (error) {
        console.error(`Error fetching username for ${targetPlayerId}:`, error);
    }

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('hit')
                .setLabel(game.isMultiPlayer ? `Hit (${username})` : 'Hit')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🃏'),
            new ButtonBuilder()
                .setCustomId('stand')
                .setLabel(game.isMultiPlayer ? `Stand (${username})` : 'Stand')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('✋')
        );
    const currentHand = player.hands[player.currentHandIndex];
    const userMoney = userData[targetPlayerId] ? userData[targetPlayerId].money : 500;
    if (currentHand.cards.length === 2 && !currentHand.doubled && userMoney >= currentHand.bet) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('double')
                .setLabel(game.isMultiPlayer ? `Double (${username})` : 'Double')
                .setStyle(ButtonStyle.Success)
                .setEmoji('💰')
        );
    }
    if (game.canSplit(targetPlayerId) && userMoney >= player.bet) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('split')
                .setLabel(game.isMultiPlayer ? `Split (${username})` : 'Split')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('✂️')
        );
    }

    if (!game.gameOver && !game.bettingPhase && game.constructor.name === 'BlackjackGame') {
        const sideBetRow = createSideBetButtons(game, userId);
        if (sideBetRow) {
            return [row, sideBetRow]; // Return array of rows instead of single row
        }
    }
    return row;
}

function cleanupStaleGames() {
    const now = Date.now();
    const timeoutMs = 15 * 1000;
    for (const [key, game] of activeGames) {
        if (!game.isMultiPlayer && game.interactionStartTime && (now - game.interactionStartTime > timeoutMs)) {
            activeGames.delete(key);
            console.log(`Cleaned up stale single-player game for user ${key}`);
        }
    }
}

setInterval(cleanupStaleGames, 60 * 1000);

async function dealCardsWithDelay(interaction, message, game, userId, delay = 1000) {
    while (game.dealingPhase < 5 && !game.gameOver) {
        game.dealNextCard();
        const embed = await createGameEmbed(game, userId);
        const buttons = createButtons(game, userId);
        let components = [];
        if (buttons) {
            if (Array.isArray(buttons)) {
                components = buttons; // buttons is already an array of ActionRows
            } else {
                components = [buttons]; // buttons is a single ActionRow
            }
        }
        try {
            await message.edit({
                embeds: [embed],
                components: components
            });
        } catch (error) {
            console.error('Error updating game message during dealing:', error);
            return;
        }
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    if (game.dealingPhase === 5) {
        game.dealNextCard();

        if (game.gameOver) {
            if (game.isMultiPlayer) {
                for (const [playerId] of game.players) {
                    const winnings = game.getWinnings(playerId);
                    const currentMoney = await getUserMoney(playerId);
                    await setUserMoney(playerId, currentMoney + game.getTotalBet(playerId) + winnings);
                    const results = game.getResult(playerId);
                    const result = Array.isArray(results) ? (results.includes('blackjack') ? 'blackjack' : (results.includes('win') ? 'win' : (results.includes('lose') ? 'lose' : 'push'))) : results;
                    const bet = game.getTotalBet(playerId);
                    await recordGameResult(playerId, 'blackjack', bet, winnings, result, {
                        handsPlayed: game.players.get(playerId).hands.length
                    });
                }
            } else {
                const winnings = game.getWinnings(userId);
                const currentMoney = await getUserMoney(userId);
                await setUserMoney(userId, currentMoney + game.getTotalBet(userId) + winnings);
                const results = game.getResult(userId);
                const result = Array.isArray(results) ? (results.includes('blackjack') ? 'blackjack' : (results.includes('win') ? 'win' : (results.includes('lose') ? 'lose' : 'push'))) : results;
                const bet = game.getTotalBet(userId);
                await recordGameResult(userId, 'blackjack', bet, winnings, result, {
                    handsPlayed: game.players.get(userId).hands.length
                });
            }
        }

        const embed = await createGameEmbed(game, userId);
        const buttons = createButtons(game, userId);
        let components = [];
        if (buttons) {
            if (Array.isArray(buttons)) {
                components = buttons; // buttons is already an array of ActionRows
            } else {
                components = [buttons]; // buttons is a single ActionRow
            }
        }
        try {
            await message.edit({
                embeds: [embed],
                components: components
            });
        } catch (error) {
            console.error('Error updating game message:', error);
            return;
        }
    }
}

function startTurnTimer(game, interaction) {
    if (!game.isMultiPlayer || game.gameOver) return;
    const currentPlayerId = Array.from(game.players.keys())[game.currentPlayerIndex];
    setTimeout(async () => {
        if (!activeGames.get(interaction.channelId) || activeGames.get(interaction.channelId) !== game) return;
        const player = game.players.get(currentPlayerId);
        if (!player || player.stood) return;
        game.stand(currentPlayerId);
        if (game.gameOver) {
            for (const [playerId] of game.players) {
                const winnings = game.getWinnings(playerId);
                const currentMoney = await getUserMoney(playerId);
                await setUserMoney(playerId, currentMoney + game.getTotalBet(playerId) + winnings);
                const results = game.getResult(playerId);
                const result = Array.isArray(results) ? (results.includes('blackjack') ? 'blackjack' : (results.includes('win') ? 'win' : (results.includes('lose') ? 'lose' : 'push'))) : results;
                const bet = game.getTotalBet(playerId);
                await recordGameResult(playerId, 'blackjack', bet, winnings, result, {
                    handsPlayed: game.players.get(playerId).hands.length
                });
            }
        } else {
            game.checkAllPlayersDone();
        }
        try {
            const channel = await client.channels.fetch(interaction.channelId);
            const message = await channel.messages.fetch(interaction.message.id);
            const embed = await createGameEmbed(game, currentPlayerId);
            const buttons = createButtons(game, userId);
            let components = [];
            if (buttons) {
                if (Array.isArray(buttons)) {
                    components = buttons; // buttons is already an array of ActionRows
                } else {
                    components = [buttons]; // buttons is a single ActionRow
                }
            }
            try {
                await message.edit({
                    content: null,
                    embeds: [embed],
                    components: components
                });
            } catch (error) {
            }
            if (!game.gameOver) {
                startTurnTimer(game, interaction);
            }
        } catch (error) {
            console.error('Error updating game message after timeout:', error);
        }
    }, 30000);
}

client.once('clientReady', async () => {
    console.log('Blackjack Bot Online!');
    await loadUserData();
    client.user.setActivity("Blackjack, Poker & Slots 🎰", { type: "PLAYING" });

    const commands = [
        {
            name: 'blackjack',
            description: 'Start a single-player blackjack game',
            options: [
                {
                    name: 'bet',
                    description: 'Amount to bet (10-500,000)',
                    type: 4,
                    required: true,
                    min_value: 10,
                    max_value: 500000
                }
            ]
        },
        {
            name: 'poker',
            description: 'Play 3 Card Poker',
            options: [
                {
                    name: 'ante',
                    description: 'Ante bet amount (10-10,000)',
                    type: 4,
                    required: true,
                    min_value: 10,
                    max_value: 10000
                },
                {
                    name: 'pairplus',
                    description: 'Optional Pair Plus side bet (0-1,000)',
                    type: 4,
                    required: false,
                    min_value: 0,
                    max_value: 1000
                }
            ]
        },
        {
            name: 'slots',
            description: 'Play slots',
            options: [
                {
                    name: 'bet',
                    description: 'Amount to bet per spin (1-1000)',
                    type: 4,
                    required: true,
                    min_value: 1,
                    max_value: 1000
                }
            ]
        },
        {
            name: 'starttable',
            description: 'Start a multi-player blackjack table',
            options: [
                {
                    name: 'bet',
                    description: 'Your bet (10-500,000)',
                    type: 4,
                    required: true,
                    min_value: 10,
                    max_value: 500000
                }
            ]
        },
        {
            name: 'balance',
            description: 'Check your current balance'
        },
        {
            name: 'daily',
            description: 'Claim your daily bonus (if you have less than $50)'
        },
        {
            name: 'givemoney',
            description: '[ADMIN ONLY] Give money to a user',
            options: [
                {
                    name: 'user',
                    description: 'The user to give money to',
                    type: 6,
                    required: true
                },
                {
                    name: 'amount',
                    description: 'Amount of money to give',
                    type: 4,
                    required: true,
                    min_value: 1,
                    max_value: 10000
                }
            ]
        },
        {
            name: 'leaderboard',
            description: 'Show the blackjack money leaderboard'
        },
        {
            name: 'stats',
            description: 'View your gambling statistics',
            options: [
                {
                    name: 'user',
                    description: 'View another user\'s stats (optional)',
                    type: 6,
                    required: false
                }
            ]
        },
        {
            name: 'history',
            description: 'View your recent game history',
            options: [
                {
                    name: 'games',
                    description: 'Number of recent games to show (1-20)',
                    type: 4,
                    required: false,
                    min_value: 1,
                    max_value: 20
                }
            ]
        },
        {
            name: 'gift',
            description: 'Send money to another user',
            options: [
                {
                    name: 'user',
                    description: 'User to send money to',
                    type: 6,
                    required: true
                },
                {
                    name: 'amount',
                    description: 'Amount to send (10-1000)',
                    type: 4,
                    required: true,
                    min_value: 10,
                    max_value: 1000
                },
                {
                    name: 'message',
                    description: 'Optional message with the gift',
                    type: 3,
                    required: false
                }
            ]
        }
    ];

    try {
        await client.application.commands.set(commands);
        console.log('Slash commands registered!');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
});

client.on('interactionCreate', async interaction => {
    try {
        if (!ALLOWED_CHANNEL_IDS.includes(interaction.channelId)) {
            if (interaction.isCommand() || interaction.isButton() || interaction.isModalSubmit()) {
                return interaction.reply({
                    content: '❌ This bot can only be used in designated blackjack channels!',
                    flags: 64
                });
            }
            return;
        }

        if (interaction.isCommand()) {
            const { commandName, user } = interaction;

            if (commandName === 'poker') {
                const anteBet = interaction.options.getInteger('ante');
                const pairPlusBet = interaction.options.getInteger('pairplus') || 0;
                const totalBet = anteBet + pairPlusBet;
                const userMoney = await getUserMoney(user.id);

                // Clean up any existing poker game
                if (activeGames.has(`poker_${user.id}`)) {
                    activeGames.delete(`poker_${user.id}`);
                }

                if (userMoney < totalBet) {
                    return interaction.reply({
                        content: `❌ You don't have enough money! You have ${userMoney}, but need ${totalBet} (Ante: ${anteBet}${pairPlusBet > 0 ? `, Pair Plus: ${pairPlusBet}` : ''}).`,
                        flags: 64
                    });
                }

                await setUserMoney(user.id, userMoney - totalBet);
                const pokerGame = new ThreeCardPokerGame(user.id, anteBet, pairPlusBet);
                activeGames.set(`poker_${user.id}`, pokerGame);

                const embed = await createGameEmbed(pokerGame, user.id);
                const buttons = createButtons(pokerGame, user.id);
                await interaction.reply({
                    embeds: [embed],
                    components: buttons ? [buttons] : []
                });
            } else if (commandName === 'blackjack') {
                const bet = interaction.options.getInteger('bet');
                const userMoney = await getUserMoney(user.id);

                if (activeGames.has(user.id)) {
                    activeGames.delete(user.id);
                }

                if (userMoney < bet) {
                    return interaction.reply({ content: `❌ You don't have enough money! You have ${userMoney}.`, flags: 64 });
                }

                await setUserMoney(user.id, userMoney - bet);
                const game = new BlackjackGame(interaction.channelId, user.id, bet, false);
                activeGames.set(user.id, game);
                game.sideBetPhase = true;

                const embed = await createGameEmbed(game, user.id);
                const buttons = createButtons(game, user.id);
                let components = [];
                if (buttons) {
                    if (Array.isArray(buttons)) {
                        components = buttons;
                    } else {
                        components = [buttons];
                    }
                }

                const message = await interaction.reply({
                    embeds: [embed],
                    components: components,
                    fetchReply: true
                });

                // Start 15-second countdown for side bets
                let countdown = 15;
                const countdownInterval = setInterval(async () => {
                    countdown--;
                    if (countdown <= 0 || !game.sideBetPhase) {
                        clearInterval(countdownInterval);
                        game.sideBetPhase = false;
                        await dealCardsWithDelay(interaction, message, game, user.id, 1000);
                        return;
                    }

                    const embed = await createGameEmbed(game, user.id);
                    embed.setDescription(`⏰ Place your side bets! ${countdown} seconds remaining...`);
                    const buttons = createButtons(game, user.id);
                    let components = [];
                    if (buttons) {
                        if (Array.isArray(buttons)) {
                            components = buttons;
                        } else {
                            components = [buttons];
                        }
                    }

                    try {
                        await message.edit({
                            embeds: [embed],
                            components: components
                        });
                    } catch (error) {
                        console.error('Error updating countdown:', error);
                    }
                }, 1000);

                activeGames.set(user.id, game);
            } else if (commandName === 'slots') {
                const bet = interaction.options.getInteger('bet');
                const userMoney = await getUserMoney(user.id);

                if (userMoney < bet) {
                    return interaction.reply({ content: `❌ You don't have enough money! You have ${userMoney}.`, flags: 64 });
                }

                await setUserMoney(user.id, userMoney - bet);
                const slotsGame = new SlotsGame(user.id, bet);
                await setUserMoney(user.id, userMoney - bet + slotsGame.winnings);
                await recordGameResult(user.id, 'slots', bet, slotsGame.winnings, slotsGame.winnings > 0 ? 'win' : 'lose');

                const embed = await createGameEmbed(slotsGame, user.id);
                const buttons = createButtons(slotsGame, user.id);
                await interaction.reply({
                    embeds: [embed],
                    components: buttons ? [buttons] : []
                });
            } else if (commandName === 'starttable') {
                const bet = interaction.options.getInteger('bet');
                const userMoney = await getUserMoney(user.id);

                if (activeGames.has(interaction.channelId)) {
                    activeGames.delete(interaction.channelId);
                }

                if (userMoney < bet) {
                    return interaction.reply({ content: `❌ You don't have enough money! You have ${userMoney}.`, flags: 64 });
                }

                await setUserMoney(user.id, userMoney - bet);
                const game = new BlackjackGame(interaction.channelId, user.id, bet, true);
                activeGames.set(interaction.channelId, game);
                game.interactionId = interaction.id;
                game.interactionStartTime = Date.now();

                const joinButton = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('join_table')
                        .setLabel('Join Table')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('➕')
                );

                const initialEmbed = await createGameEmbed(game, user.id);
                initialEmbed.setDescription(`🃏 Blackjack table started! Click to join (30 seconds remaining).`);

                const message = await interaction.reply({
                    embeds: [initialEmbed],
                    components: [joinButton],
                    fetchReply: true
                });

                let countdown = 30;
                const countdownInterval = setInterval(async () => {
                    countdown--;
                    if (countdown <= 0) {
                        clearInterval(countdownInterval);
                        if (activeGames.get(interaction.channelId) === game && game.dealingPhase === 0) {
                            await dealCardsWithDelay(interaction, message, game, user.id, 1000);
                            const embed = await createGameEmbed(game, user.id);
                            const buttons = createButtons(game, user.id);
                            let components = [];
                            if (buttons) {
                                if (Array.isArray(buttons)) {
                                    components = buttons;
                                } else {
                                    components = [buttons];
                                }
                            }
                            try {
                                await message.edit({
                                    embeds: [embed],
                                    components: components
                                });
                                if (!game.gameOver && game.dealingPhase >= 5) {
                                    startTurnTimer(game, interaction);
                                }
                            } catch (error) {
                                console.error('Error updating game message after countdown:', error);
                            }
                        }
                        return;
                    }

                    const updatedEmbed = await createGameEmbed(game, user.id);
                    updatedEmbed.setDescription(`🃏 Blackjack table started! Click to join (${countdown} seconds remaining).`);
                    try {
                        await message.edit({
                            embeds: [updatedEmbed],
                            components: [joinButton]
                        });
                    } catch (error) {
                        console.error('Error updating countdown:', error);
                    }
                }, 1000);
            }

            else if (commandName === 'balance') {
                const userMoney = await getUserMoney(user.id);
                await interaction.reply(`💰 You have **${userMoney}**`);
            }

            else if (commandName === 'daily') {
                const userMoney = await getUserMoney(user.id);
                if (!(await canClaimDaily(user.id))) {
                    const timeUntilNext = getTimeUntilNextDaily(user.id);
                    const hours = Math.floor(timeUntilNext / (1000 * 60 * 60));
                    const minutes = Math.floor((timeUntilNext % (1000 * 60 * 60)) / (1000 * 60));
                    return interaction.reply({
                        content: `⏰ You can claim your daily bonus again in **${hours}h ${minutes}m**!`,
                        flags: 64
                    });
                }
                if (userMoney >= 50) {
                    return interaction.reply({
                        content: '❌ You can only claim daily bonus when you have less than $50!',
                        flags: 64
                    });
                }
                await setUserMoney(user.id, 500);
                await setLastDaily(user.id);
                await interaction.reply('🎁 Daily bonus claimed! You now have **$500**');
            }

            else if (commandName === 'givemoney') {
                if (user.id !== ADMIN_USER_ID) {
                    return interaction.reply({
                        content: '❌ You do not have permission to use this command!',
                        flags: 64
                    });
                }
                const targetUser = interaction.options.getUser('user');
                const amount = interaction.options.getInteger('amount');
                if (targetUser.bot) {
                    return interaction.reply({
                        content: '❌ Cannot give money to bots!',
                        flags: 64
                    });
                }
                const targetCurrentMoney = await getUserMoney(targetUser.id);
                await setUserMoney(targetUser.id, targetCurrentMoney + amount);
                await interaction.reply({
                    content: `💰 **Admin Action**: Gave ${amount} to ${targetUser.username}!\nNew balance: ${targetCurrentMoney + amount}`,
                    flags: 64
                });
                console.log(`Admin ${user.username} (${user.id}) gave ${amount} to ${targetUser.username} (${targetUser.id})`);
            }

            else if (commandName === 'leaderboard') {
                const sortedUsers = Object.entries(userData)
                    .map(([userId, data]) => ({ userId, money: data.money }))
                    .sort((a, b) => b.money - a.money);
                const embed = new EmbedBuilder()
                    .setTitle('🏆 Blackjack Leaderboard')
                    .setColor('#FFD700')
                    .setTimestamp();
                if (sortedUsers.length === 0) {
                    embed.setDescription('No players have registered yet!');
                    return interaction.reply({ embeds: [embed] });
                }
                let leaderboardText = '';
                for (let i = 0; i < Math.min(sortedUsers.length, 10); i++) {
                    const { userId, money } = sortedUsers[i];
                    let username = 'Unknown User';
                    try {
                        const user = await client.users.fetch(userId);
                        username = user.tag;
                    } catch (error) {
                        console.error(`Error fetching user ${userId}:`, error);
                    }
                    leaderboardText += `${i + 1}. **${username}**: ${money}\n`;
                }
                if (sortedUsers.length > 10) {
                    leaderboardText += `\n...and ${sortedUsers.length - 10} more players!`;
                }
                embed.setDescription(leaderboardText);
                await interaction.reply({ embeds: [embed] });
            }
            else if (commandName === 'stats') {
                const targetUser = interaction.options.getUser('user') || user;
                await getUserMoney(targetUser.id);

                const stats = userData[targetUser.id].statistics;
                const winRate = stats.gamesPlayed > 0 ? ((stats.gamesWon / stats.gamesPlayed) * 100).toFixed(1) : 0;
                const slotsWinRate = stats.slotsSpins > 0 ? ((stats.slotsWins / stats.slotsSpins) * 100).toFixed(1) : 0;
                const pokerWinRate = stats.threeCardPokerGames > 0 ? ((stats.threeCardPokerWins / stats.threeCardPokerGames) * 100).toFixed(1) : 0;
                const profitLoss = stats.totalWinnings - stats.totalWagered;

                const embed = new EmbedBuilder()
                    .setTitle(`📊 ${targetUser.username}'s Statistics`)
                    .setColor('#0099FF')
                    .setThumbnail(targetUser.displayAvatarURL())
                    .addFields(
                        { name: '🎮 Games Played', value: (stats.gamesPlayed || 0).toString(), inline: true },
                        { name: '🏆 Games Won', value: (stats.gamesWon || 0).toString(), inline: true },
                        { name: '📈 Win Rate', value: `${winRate}%`, inline: true },
                        { name: '💰 Total Wagered', value: `${(stats.totalWagered || 0).toLocaleString()}`, inline: true },
                        { name: '💵 Total Winnings', value: `${(stats.totalWinnings || 0).toLocaleString()}`, inline: true },
                        { name: '📊 Net Profit/Loss', value: `${profitLoss >= 0 ? '+' : ''}${(profitLoss || 0).toLocaleString()}`, inline: true },
                        { name: '🌟 Biggest Win', value: `${(stats.biggestWin || 0).toLocaleString()}`, inline: true },
                        { name: '💔 Biggest Loss', value: `${(stats.biggestLoss || 0).toLocaleString()}`, inline: true },
                        { name: '⚡ Blackjacks', value: (stats.blackjacks || 0).toString(), inline: true },
                        { name: '🎰 Slots Spins', value: (stats.slotsSpins || 0).toString(), inline: true },
                        { name: '🎰 Slots Wins', value: (stats.slotsWins || 0).toString(), inline: true },
                        { name: '📈 Slots Win Rate', value: `${slotsWinRate}%`, inline: true },
                        { name: '🃏 Poker Games', value: (stats.threeCardPokerGames || 0).toString(), inline: true },
                        { name: '🃏 Poker Wins', value: (stats.threeCardPokerWins || 0).toString(), inline: true },
                        { name: '📈 Poker Win Rate', value: `${pokerWinRate}%`, inline: true },
                        { name: '🎁 Gifts Sent', value: (userData[targetUser.id].giftsSent || 0).toString(), inline: true },
                        { name: '🎀 Gifts Received', value: (userData[targetUser.id].giftsReceived || 0).toString(), inline: true },
                        { name: '💳 Current Balance', value: `${(userData[targetUser.id].money || 0).toLocaleString()}`, inline: true }
                    )
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
            }

            else if (commandName === 'history') {
                const gamesToShow = interaction.options.getInteger('games') || 10;
                await getUserMoney(user.id);

                const history = userData[user.id].gameHistory.slice(0, gamesToShow);

                if (history.length === 0) {
                    return interaction.reply({ content: '📜 You have no game history yet! Play some games first.', flags: 64 });
                }

                const embed = new EmbedBuilder()
                    .setTitle(`📜 Your Recent Game History (Last ${history.length} games)`)
                    .setColor('#FFD700')
                    .setThumbnail(user.displayAvatarURL());

                let historyText = '';
                for (const game of history) {
                    const date = new Date(game.timestamp).toLocaleDateString();
                    const resultEmoji = game.result === 'win' || game.result === 'blackjack' ? '🟢' :
                        game.result === 'push' ? '🟡' : '🔴';
                    const resultText = game.result === 'blackjack' ? 'BLACKJACK!' : game.result.toUpperCase();

                    historyText += `${resultEmoji} **${resultText}** - ${game.gameType.toUpperCase()}: Bet ${game.bet}, `;
                    historyText += `${game.winnings >= 0 ? 'Won' : 'Lost'}: ${Math.abs(game.winnings)} `;
                    historyText += `(${date})\n`;
                }

                embed.setDescription(historyText);
                await interaction.reply({ embeds: [embed] });
            }

            else if (commandName === 'gift') {
                const targetUser = interaction.options.getUser('user');
                const amount = interaction.options.getInteger('amount');
                const message = interaction.options.getString('message') || '';

                if (targetUser.bot) {
                    return interaction.reply({ content: '❌ You cannot send gifts to bots!', flags: 64 });
                }

                if (targetUser.id === user.id) {
                    return interaction.reply({ content: '❌ You cannot send gifts to yourself!', flags: 64 });
                }

                const userMoney = await getUserMoney(user.id);
                if (userMoney < amount) {
                    return interaction.reply({
                        content: `❌ You don't have enough money! You have ${userMoney}.`,
                        flags: 64
                    });
                }

                await setUserMoney(user.id, userMoney - amount);
                const targetMoney = await getUserMoney(targetUser.id);
                await setUserMoney(targetUser.id, targetMoney + amount);

                userData[user.id].giftsSent++;
                userData[targetUser.id].giftsReceived++;
                await saveUserData();

                const embed = new EmbedBuilder()
                    .setTitle('🎁 Gift Sent!')
                    .setColor('#00FF00')
                    .setDescription(`${user.username} sent ${amount} to ${targetUser.username}`)
                    .addFields(
                        { name: '💰 Amount', value: `${amount}`, inline: true },
                        { name: '👤 Recipient', value: targetUser.username, inline: true },
                        { name: '💵 Your Balance', value: `${userMoney - amount}`, inline: true }
                    );

                if (message) {
                    embed.addFields({ name: '💬 Message', value: message, inline: false });
                }

                embed.setTimestamp();

                await interaction.reply({ embeds: [embed] });

                try {
                    const dmEmbed = new EmbedBuilder()
                        .setTitle('🎁 You received a gift!')
                        .setColor('#00FF00')
                        .setDescription(`${user.username} sent you ${amount}!`)
                        .addFields({ name: '💵 Your New Balance', value: `${targetMoney + amount}`, inline: true });

                    if (message) {
                        dmEmbed.addFields({ name: '💬 Message', value: message, inline: false });
                    }

                    await targetUser.send({ embeds: [dmEmbed] });
                } catch (error) {
                    // User has DMs disabled, that's okay
                }
            }
        }

        else if (interaction.isButton()) {
            const { customId, user } = interaction;
            let game;
            let isMultiPlayer = false;

            // Handle 3 Card Poker buttons
            if (customId.startsWith('poker_')) {
                game = activeGames.get(`poker_${user.id}`);
                if (!game) {
                    return interaction.reply({ content: '❌ No active poker game found!', flags: 64 });
                }

                if (customId === 'poker_play') {
                    if (game.gamePhase !== 'decision') {
                        return interaction.reply({ content: '❌ Not in decision phase!', flags: 64 });
                    }

                    const userMoney = await getUserMoney(user.id);
                    if (userMoney < game.anteBet) {
                        return interaction.reply({
                            content: `❌ You don't have enough money for the play bet! You have ${userMoney}, need ${game.anteBet}.`,
                            flags: 64
                        });
                    }

                    await setUserMoney(user.id, userMoney - game.anteBet);
                    game.makeDecision('play');

                    // Calculate winnings and update user money
                    const winnings = game.calculateWinnings();
                    const currentMoney = await getUserMoney(user.id);
                    await setUserMoney(user.id, currentMoney + game.anteBet + game.playBet + winnings.total);

                    // Record game result
                    const totalBet = game.anteBet + game.playBet + game.pairPlusBet;
                    await recordGameResult(user.id, 'three_card_poker', totalBet, winnings.total, winnings.total >= 0 ? 'win' : 'lose');

                    await interaction.deferUpdate();
                    const embed = await createGameEmbed(game, user.id);
                    const buttons = createButtons(game, user.id);
                    let components = [];
                    if (buttons) {
                        if (Array.isArray(buttons)) {
                            components = buttons; // buttons is already an array of ActionRows
                        } else {
                            components = [buttons]; // buttons is a single ActionRow
                        }
                    }
                    try {
                        await interaction.editReply({
                            embeds: [embed],
                            components: components
                        });
                    } catch (error) {
                    }
                } else if (customId === 'poker_fold') {
                    if (game.gamePhase !== 'decision') {
                        return interaction.reply({ content: '❌ Not in decision phase!', flags: 64 });
                    }

                    game.makeDecision('fold');

                    // Calculate winnings and update user money (will be negative for fold)
                    const winnings = game.calculateWinnings();
                    const currentMoney = await getUserMoney(user.id);
                    await setUserMoney(user.id, currentMoney + winnings.total);

                    // Record game result
                    const totalBet = game.anteBet + game.pairPlusBet;
                    await recordGameResult(user.id, 'three_card_poker', totalBet, winnings.total, 'lose');

                    await interaction.deferUpdate();
                    const embed = await createGameEmbed(game, user.id);
                    const buttons = createButtons(game, user.id);
                    let components = [];
                    if (buttons) {
                        if (Array.isArray(buttons)) {
                            components = buttons; // buttons is already an array of ActionRows
                        } else {
                            components = [buttons]; // buttons is a single ActionRow
                        }
                    }
                    try {
                        await interaction.editReply({
                            embeds: [embed],
                            components: components
                        });
                    } catch (error) {
                    }
                } else if (customId === 'poker_play_again') {
                    if (game.gamePhase !== 'complete') {
                        return interaction.reply({ content: '❌ Game not complete!', flags: 64 });
                    }

                    const anteBet = game.anteBet;
                    const pairPlusBet = game.pairPlusBet;
                    const totalBet = anteBet + pairPlusBet;
                    const userMoney = await getUserMoney(user.id);

                    if (userMoney < totalBet) {
                        return interaction.reply({
                            content: `❌ You don't have enough money for another game! You have ${userMoney}, need ${totalBet}.`,
                            flags: 64
                        });
                    }

                    await setUserMoney(user.id, userMoney - totalBet);
                    const newGame = new ThreeCardPokerGame(user.id, anteBet, pairPlusBet);
                    activeGames.delete(`poker_${user.id}`);
                    activeGames.set(`poker_${user.id}`, newGame);

                    await interaction.deferUpdate();
                    const embed = await createGameEmbed(newGame, user.id);
                    const buttons = createButtons(newGame, user.id);
                    await interaction.editReply({
                        embeds: [embed],
                        components: buttons ? [buttons] : []
                    });
                }
                return;
            }

            if (customId === 'join_table') {
                game = activeGames.get(interaction.channelId);
                if (!game || !game.isMultiPlayer) {
                    return interaction.reply({ content: '❌ No active table found!', flags: 64 });
                }
                if (game.dealingPhase > 0) {
                    return interaction.reply({ content: '❌ Game has already started!', flags: 64 });
                }
                if (game.players.has(user.id)) {
                    return interaction.reply({ content: '❌ You\'re already in the game!', flags: 64 });
                }
                if (activeGames.has(user.id)) {
                    activeGames.delete(user.id);
                }

                const modal = new ModalBuilder()
                    .setCustomId('submit_bet')
                    .setTitle('Join Blackjack Table')
                    .addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('bet_amount')
                                .setLabel('Enter your bet (10-500,000)')
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true)
                                .setPlaceholder('100')
                        )
                    );
                await interaction.showModal(modal);
                return;
            }

            if (customId === 'spin_again') {
                let bet = 10; // Default fallback bet

                try {
                    const description = interaction.message.embeds[0].description;
                    const betMatch = description.match(/Bet: \$(\d+)/);
                    if (betMatch && betMatch[1]) {
                        bet = Number(betMatch[1]);
                    } else {
                        console.error('Could not parse bet from embed description:', description);
                    }
                } catch (error) {
                    console.error('Error parsing slots bet:', error);
                }
                const userMoney = await getUserMoney(user.id);

                if (userMoney < bet) {
                    return interaction.reply({ content: `❌ You don't have enough money! You have ${userMoney}.`, flags: 64 });
                }

                await setUserMoney(user.id, userMoney - bet);
                const slotsGame = new SlotsGame(user.id, bet);
                await setUserMoney(user.id, userMoney - bet + slotsGame.winnings);
                await recordGameResult(user.id, 'slots', bet, slotsGame.winnings, slotsGame.winnings > 0 ? 'win' : 'lose');

                const embed = await createGameEmbed(slotsGame, user.id);
                const buttons = createButtons(slotsGame, user.id);
                await interaction.update({
                    embeds: [embed],
                    components: buttons ? [buttons] : []
                });
                return;
            }
            if (customId === 'perfect_pairs_bet') {
                const game = activeGames.get(user.id) || activeGames.get(interaction.channelId);
                if (!game) {
                    return interaction.reply({ content: '❌ No active game found!', flags: 64 });
                }

                const modal = new ModalBuilder()
                    .setCustomId('submit_perfect_pairs_bet')
                    .setTitle('Perfect Pairs Side Bet')
                    .addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('sidebet_amount')
                                .setLabel('Enter Perfect Pairs bet (1-100)')
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true)
                                .setPlaceholder('10')
                        )
                    );
                await interaction.showModal(modal);
                return;
            }

            if (customId === 'insurance_bet') {
                const game = activeGames.get(user.id) || activeGames.get(interaction.channelId);
                if (!game) {
                    return interaction.reply({ content: '❌ No active game found!', flags: 64 });
                }

                const modal = new ModalBuilder()
                    .setCustomId('submit_insurance_bet')
                    .setTitle('Insurance Side Bet')
                    .addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('sidebet_amount')
                                .setLabel('Enter insurance bet (1-50)')
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true)
                                .setPlaceholder('5')
                        )
                    );
                await interaction.showModal(modal);
                return;
            }

            if (activeGames.has(user.id)) {
                game = activeGames.get(user.id);
            } else if (activeGames.has(interaction.channelId)) {
                game = activeGames.get(interaction.channelId);
                isMultiPlayer = game.isMultiPlayer;
            } else {
                return interaction.reply({ content: '❌ No active game found!', flags: 64 });
            }
            if (customId === 'start_dealing') {
                const game = activeGames.get(user.id);
                if (!game || !game.sideBetPhase) {
                    return interaction.reply({ content: '❌ No active side bet phase!', flags: 64 });
                }

                game.startDealing();
                await interaction.deferUpdate();

                const channel = await client.channels.fetch(interaction.channelId);
                const message = await channel.messages.fetch(interaction.message.id);
                await dealCardsWithDelay(interaction, message, game, user.id, 1000);
                return;
            }

            if (customId === 'play_again_single') {
                game = activeGames.get(user.id);
                if (!game || game.isMultiPlayer) {
                    return interaction.reply({
                        content: '❌ No active single-player game found!',
                        flags: 64
                    });
                }
                if (user.id !== Array.from(game.players.keys())[0]) {
                    return interaction.reply({
                        content: '❌ This is not your game!',
                        flags: 64
                    });
                }
                const player = game.players.get(user.id);
                const lastBet = player.bet / (player.hasSplit ? 2 : 1);

                const userMoney = await getUserMoney(user.id);
                if (userMoney < lastBet) {
                    return interaction.reply({
                        content: `❌ You don't have enough money for another game with your previous bet of ${lastBet}! You have ${userMoney}.`,
                        flags: 64
                    });
                }

                await setUserMoney(user.id, userMoney - lastBet);
                const newGame = new BlackjackGame(interaction.channelId, user.id, lastBet, false);
                newGame.interactionStartTime = Date.now();
                newGame.sideBetPhase = true; // Add side bet phase
                activeGames.delete(user.id);
                activeGames.set(user.id, newGame);

                await interaction.deferUpdate();
                const channel = await client.channels.fetch(interaction.channelId);
                const message = await channel.messages.fetch(interaction.message.id);

                // Start side bet countdown instead of immediate dealing
                const embed = await createGameEmbed(newGame, user.id);
                embed.setDescription('⏰ Place your side bets! 15 seconds remaining...');
                const buttons = createButtons(newGame, user.id);
                let components = [];
                if (buttons) {
                    if (Array.isArray(buttons)) {
                        components = buttons;
                    } else {
                        components = [buttons];
                    }
                }

                await message.edit({
                    embeds: [embed],
                    components: components
                });

                // Start 15-second countdown for side bets
                let countdown = 15;
                const countdownInterval = setInterval(async () => {
                    countdown--;
                    if (countdown <= 0 || !newGame.sideBetPhase) {
                        clearInterval(countdownInterval);
                        newGame.sideBetPhase = false;
                        await dealCardsWithDelay(interaction, message, newGame, user.id, 1000);
                        return;
                    }

                    const embed = await createGameEmbed(newGame, user.id);
                    embed.setDescription(`⏰ Place your side bets! ${countdown} seconds remaining...`);
                    const buttons = createButtons(newGame, user.id);
                    let components = [];
                    if (buttons) {
                        if (Array.isArray(buttons)) {
                            components = buttons;
                        } else {
                            components = [buttons];
                        }
                    }

                    try {
                        await message.edit({
                            embeds: [embed],
                            components: components
                        });
                    } catch (error) {
                        console.error('Error updating countdown:', error);
                    }
                }, 1000);

                return;
            }

            if (customId === 'continue_playing') {
                game = activeGames.get(interaction.channelId);
                if (!game || !game.isMultiPlayer || !game.gameOver) {
                    return interaction.reply({ content: '❌ No active or finished multi-player game found!', flags: 64 });
                }
                if (!game.players.has(user.id)) {
                    return interaction.reply({ content: '❌ You were not part of the previous game!', flags: 64 });
                }

                game.startBettingPhase();
                await interaction.deferUpdate();
                const message = await interaction.channel.messages.fetch(interaction.message.id);
                const embed = await createGameEmbed(game, user.id);
                const buttons = createButtons(game, user.id);
                let components = [];
                if (buttons) {
                    if (Array.isArray(buttons)) {
                        components = buttons; // buttons is already an array of ActionRows
                    } else {
                        components = [buttons]; // buttons is a single ActionRow
                    }
                }
                try {
                    await message.edit({
                        content: null,
                        embeds: [embed],
                        components: components
                    });
                } catch (error) {
                    console.error('Error updating game message after continue_playing:', error);
                    await interaction.followUp({
                        content: '⚠️ Failed to update the game message. The betting phase has started, but the table may not reflect it.',
                        flags: 64
                    });
                }
                return;
            }

            if (customId === 'keep_bet') {
                game = activeGames.get(interaction.channelId);
                if (!game || !game.isMultiPlayer || !game.bettingPhase) {
                    return interaction.reply({ content: '❌ No active betting phase found!', flags: 64 });
                }
                if (!game.players.has(user.id)) {
                    return interaction.reply({ content: '❌ You are not part of this game!', flags: 64 });
                }
                const player = game.players.get(user.id);
                const currentBet = player.bet / (player.hasSplit ? 2 : 1);
                game.confirmBet(user.id, currentBet);
                await interaction.reply({ content: `✅ You kept your bet of ${currentBet}!`, flags: 64 });
                if (game.allPlayersReady()) {
                    const previousPlayers = new Map(game.players);
                    const playerBets = new Map(game.readyPlayers);
                    for (const [playerId, bet] of playerBets) {
                        const userMoney = await getUserMoney(playerId);
                        if (userMoney < bet) {
                            let username = 'Unknown User';
                            try {
                                const user = await client.users.fetch(playerId);
                                username = user.username;
                            } catch (error) {
                                console.error(`Error fetching user ${playerId}:`, error);
                            }
                            return interaction.followUp({
                                content: `❌ ${username} doesn't have enough money (${userMoney}) for their bet of ${bet}!`,
                                flags: 64
                            });
                        }
                    }
                    for (const [playerId, bet] of playerBets) {
                        const userMoney = await getUserMoney(playerId);
                        await setUserMoney(playerId, userMoney - bet);
                    }
                    const creatorId = Array.from(previousPlayers.keys())[0];
                    const creatorBet = playerBets.get(creatorId);
                    const newGame = new BlackjackGame(interaction.channelId, creatorId, creatorBet, true);
                    for (const [playerId, bet] of playerBets) {
                        if (playerId !== creatorId) {
                            newGame.addPlayer(playerId, bet);
                        }
                    }
                    activeGames.delete(interaction.channelId);
                    activeGames.set(interaction.channelId, newGame);
                    newGame.interactionId = interaction.id;
                    newGame.interactionStartTime = Date.now();
                    await dealCardsWithDelay(interaction, interaction.message, newGame, user.id, 1000);
                    const embed = await createGameEmbed(newGame, user.id);
                    const buttons = createButtons(newGame, user.id);
                    try {
                        await interaction.message.edit({
                            embeds: [embed],
                            components: buttons ? [buttons] : []
                        });
                        if (!newGame.gameOver && newGame.dealingPhase >= 5) {
                            startTurnTimer(newGame, interaction);
                        }
                    } catch (error) {
                        console.error('Error updating game message after betting phase:', error);
                        await interaction.followUp({
                            content: '⚠️ Failed to update the game message. The new game has started, but the table may not reflect it.',
                            flags: 64
                        });
                    }
                } else {
                    const embed = await createGameEmbed(game, user.id);
                    const buttons = createButtons(game, user.id);
                    let components = [];
                    if (buttons) {
                        if (Array.isArray(buttons)) {
                            components = buttons; // buttons is already an array of ActionRows
                        } else {
                            components = [buttons]; // buttons is a single ActionRow
                        }
                    }
                    try {
                        await message.edit({
                            content: null,
                            embeds: [embed],
                            components: components
                        });
                    } catch (error) {
                    }
                }
                return;
            }

            if (customId === 'adjust_bet') {
                game = activeGames.get(interaction.channelId);
                if (!game || !game.isMultiPlayer || !game.bettingPhase) {
                    return interaction.reply({ content: '❌ No active betting phase found!', flags: 64 });
                }
                if (!game.players.has(user.id)) {
                    return interaction.reply({ content: '❌ You are not part of this game!', flags: 64 });
                }
                const modal = new ModalBuilder()
                    .setCustomId('submit_adjusted_bet')
                    .setTitle('Adjust Your Bet')
                    .addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('bet_amount')
                                .setLabel('Enter your new bet (10-500,000)')
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true)
                                .setPlaceholder('100')
                        )
                    );
                await interaction.showModal(modal);
                return;
            }

            if (customId === 'leave_table') {
                game = activeGames.get(interaction.channelId);
                if (!game || !game.isMultiPlayer || !game.bettingPhase) {
                    return interaction.reply({ content: '❌ No active betting phase found!', flags: 64 });
                }
                if (!game.players.has(user.id)) {
                    return interaction.reply({ content: '❌ You are not part of this game!', flags: 64 });
                }
                const player = game.players.get(user.id);
                const refund = player.bet / (player.hasSplit ? 2 : 1);
                const userMoney = await getUserMoney(user.id);
                await setUserMoney(user.id, userMoney + refund);
                game.removePlayer(user.id);
                await interaction.reply({ content: `🚪 You left the table. ${refund} has been refunded.`, flags: 64 });
                if (game.players.size === 0) {
                    activeGames.delete(interaction.channelId);
                    await interaction.message.edit({
                        embeds: [new EmbedBuilder()
                            .setTitle('🃏 Blackjack Table')
                            .setDescription('Table closed: No players remaining.')
                            .setColor('#FF0000')],
                        components: []
                    });
                    return;
                }
                const embed = await createGameEmbed(game, user.id);
                const buttons = createButtons(game, Array.from(game.players.keys())[0]);
                await interaction.message.edit({
                    embeds: [embed],
                    components: buttons ? [buttons] : []
                });
                return;
            }

            if (isMultiPlayer && user.id !== Array.from(game.players.keys())[game.currentPlayerIndex]) {
                return interaction.reply({ content: `❌ It's not your turn! Waiting for ${client.users.cache.get(Array.from(game.players.keys())[game.currentPlayerIndex])?.username || 'another player'}.`, flags: 64 });
            }
            if (!isMultiPlayer && user.id !== Array.from(game.players.keys())[0]) {
                return interaction.reply({ content: '❌ This is not your game!', flags: 64 });
            }
            if (customId === 'not_your_game') {
                return interaction.reply({ content: '❌ This is not your game!', flags: 64 });
            }
            if (customId === 'inactive') {
                return interaction.reply({ content: isMultiPlayer ? `❌ It's not your turn!` : '❌ No active hand!', flags: 64 });
            }

            await interaction.deferUpdate();

            if (customId === 'hit' || customId === 'stand' || customId === 'double' || customId === 'split') {
                let actionSuccess = false;
                if (customId === 'hit') {
                    actionSuccess = game.hit(user.id);
                } else if (customId === 'stand') {
                    game.stand(user.id);
                    actionSuccess = true;
                } else if (customId === 'double') {
                    const currentHand = game.getCurrentHand(user.id);
                    if (!currentHand) {
                        return interaction.reply({ content: '❌ No active hand found!', flags: 64 });
                    }
                    const userMoney = await getUserMoney(user.id);
                    if (userMoney < currentHand.bet) {
                        return interaction.reply({ content: '❌ Not enough money to double!', flags: 64 });
                    }
                    actionSuccess = game.double(user.id);
                    if (actionSuccess) {
                        await setUserMoney(user.id, userMoney - currentHand.bet);
                    } else {
                        return interaction.reply({ content: '❌ Cannot double this hand!', flags: 64 });
                    }
                } else if (customId === 'split') {
                    const userMoney = await getUserMoney(user.id);
                    const player = game.players.get(user.id);
                    if (userMoney < player.bet) {
                        return interaction.reply({ content: '❌ Not enough money to split!', flags: 64 });
                    }
                    if (!game.canSplit(user.id)) {
                        return interaction.reply({ content: '❌ Cannot split these cards!', flags: 64 });
                    }
                    await setUserMoney(user.id, userMoney - player.bet);
                    actionSuccess = game.split(user.id);
                }

                if (actionSuccess && game.gameOver) {
                    if (!isMultiPlayer) {
                        const winnings = game.getWinnings(user.id);
                        const currentMoney = await getUserMoney(user.id);
                        await setUserMoney(user.id, currentMoney + game.getTotalBet(user.id) + winnings);
                        const results = game.getResult(user.id);
                        const result = Array.isArray(results) ? (results.includes('blackjack') ? 'blackjack' : (results.includes('win') ? 'win' : (results.includes('lose') ? 'lose' : 'push'))) : results;
                        const bet = game.getTotalBet(user.id);
                        await recordGameResult(user.id, 'blackjack', bet, winnings, result, {
                            handsPlayed: game.players.get(user.id).hands.length
                        });
                    } else {
                        for (const [playerId] of game.players) {
                            const winnings = game.getWinnings(playerId);
                            const currentMoney = await getUserMoney(playerId);
                            await setUserMoney(playerId, currentMoney + game.getTotalBet(playerId) + winnings);
                            const results = game.getResult(playerId);
                            const result = Array.isArray(results) ? (results.includes('blackjack') ? 'blackjack' : (results.includes('win') ? 'win' : (results.includes('lose') ? 'lose' : 'push'))) : results;
                            const bet = game.getTotalBet(playerId);
                            await recordGameResult(playerId, 'blackjack', bet, winnings, result, {
                                handsPlayed: game.players.get(playerId).hands.length
                            });
                        }
                    }
                }

                const channel = await client.channels.fetch(interaction.channelId);
                const message = await channel.messages.fetch(interaction.message.id);
                const embed = await createGameEmbed(game, user.id);
                const buttons = createButtons(game, user.id);
                let components = [];
                if (buttons) {
                    if (Array.isArray(buttons)) {
                        components = buttons; // buttons is already an array of ActionRows
                    } else {
                        components = [buttons]; // buttons is a single ActionRow
                    }
                }
                try {
                    await message.edit({
                        content: null,
                        embeds: [embed],
                        components: components
                    });
                } catch (error) {
                }
                if (isMultiPlayer && actionSuccess && !game.gameOver) {
                    startTurnTimer(game, interaction);
                }
            }
        }

        else if (interaction.isModalSubmit()) {
            const { customId, user } = interaction;
            if (customId === 'submit_bet') {
                game = activeGames.get(interaction.channelId);
                if (!game || !game.isMultiPlayer) {
                    return interaction.reply({ content: '❌ No active table found!', flags: 64 });
                }
                if (game.dealingPhase > 0) {
                    return interaction.reply({ content: '❌ Game has already started!', flags: 64 });
                }
                if (game.players.has(interaction.user.id)) {
                    return interaction.reply({ content: '❌ You\'re already in the game!', flags: 64 });
                }
                if (activeGames.has(interaction.user.id)) {
                    return interaction.reply({ content: '❌ You already have an active single-player game!', flags: 64 });
                }

                const betInput = interaction.fields.getTextInputValue('bet_amount');
                const bet = parseInt(betInput);
                if (isNaN(bet) || bet < 10 || bet > 500000) {
                    return interaction.reply({ content: '❌ Invalid bet! Must be between 10 and 500,000.', flags: 64 });
                }
                const userMoney = await getUserMoney(interaction.user.id);
                if (userMoney < bet) {
                    return interaction.reply({ content: `❌ You don't have enough money! You have ${userMoney}.`, flags: 64 });
                }

                await setUserMoney(interaction.user.id, userMoney - bet);
                if (!game.addPlayer(interaction.user.id, bet)) {
                    return interaction.reply({ content: '❌ Table is full or game has started!', flags: 64 });
                }

                await interaction.reply({ content: `✅ You joined the table with a bet of ${bet}!`, flags: 64 });

                try {
                    const channel = await client.channels.fetch(interaction.channelId);
                    const message = await channel.messages.fetch(interaction.message.id);
                    const embed = await createGameEmbed(game, interaction.user.id);
                    const countdown = Math.max(0, 30 - Math.floor((Date.now() - game.interactionStartTime) / 1000));
                    embed.setDescription(`🃏 Blackjack table started! Click to join (${countdown} seconds remaining).`);
                    const buttons = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('join_table')
                            .setLabel('Join Table')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('➕')
                    );
                    await message.edit({ embeds: [embed], components: [buttons] });
                } catch (error) {
                    console.error('Error updating game message:', error);
                    await interaction.followUp({
                        content: '⚠️ Failed to update the game message. Your bet was placed, but the table may not reflect it.',
                        flags: 64
                    });
                }
            } else if (customId === 'submit_adjusted_bet') {
                const betInput = interaction.fields.getTextInputValue('bet_amount');
                const bet = parseInt(betInput);

                if (isNaN(bet) || bet < 10 || bet > 500000) {
                    return interaction.reply({
                        content: '❌ Invalid bet! Please enter a number between 10 and 500,000.',
                        flags: 64
                    });
                }

                const game = activeGames.get(interaction.channelId);
                if (!game || !game.isMultiPlayer || !game.bettingPhase) {
                    return interaction.reply({
                        content: '❌ No active betting phase found!',
                        flags: 64
                    });
                }

                if (!game.players.has(user.id)) {
                    return interaction.reply({
                        content: '❌ You are not part of this game!',
                        flags: 64
                    });
                }

                const player = game.players.get(user.id);
                const oldBet = player.bet / (player.hasSplit ? 2 : 1);
                const userMoney = await getUserMoney(user.id);
                if (userMoney + oldBet < bet) {
                    return interaction.reply({
                        content: `❌ You don't have enough money! You have ${userMoney + oldBet}.`,
                        flags: 64
                    });
                }

                // Refund the old bet and confirm the new one
                await setUserMoney(user.id, userMoney + oldBet);
                game.confirmBet(user.id, bet);
                await interaction.reply({
                    content: `✅ You adjusted your bet to ${bet}!`,
                    flags: 64
                });

                if (game.allPlayersReady()) {
                    const previousPlayers = new Map(game.players);
                    const playerBets = new Map(game.readyPlayers);
                    for (const [playerId, bet] of playerBets) {
                        const userMoney = await getUserMoney(playerId);
                        if (userMoney < bet) {
                            let username = 'Unknown User';
                            try {
                                const user = await client.users.fetch(playerId);
                                username = user.username;
                            } catch (error) {
                                console.error(`Error fetching user ${playerId}:`, error);
                            }
                            return interaction.followUp({
                                content: `❌ ${username} doesn't have enough money (${userMoney}) for their bet of ${bet}!`,
                                flags: 64
                            });
                        }
                    }

                    for (const [playerId, bet] of playerBets) {
                        const userMoney = await getUserMoney(playerId);
                        await setUserMoney(playerId, userMoney - bet);
                    }

                    const creatorId = Array.from(previousPlayers.keys())[0];
                    const creatorBet = playerBets.get(creatorId);
                    const newGame = new BlackjackGame(interaction.channelId, creatorId, creatorBet, true);
                    for (const [playerId, bet] of playerBets) {
                        if (playerId !== creatorId) {
                            newGame.addPlayer(playerId, bet);
                        }
                    }

                    activeGames.delete(interaction.channelId);
                    activeGames.set(interaction.channelId, newGame);
                    newGame.interactionId = interaction.id;
                    newGame.interactionStartTime = Date.now();

                    await dealCardsWithDelay(interaction, interaction.message, newGame, user.id, 1000);
                    const embed = await createGameEmbed(newGame, user.id);
                    const buttons = createButtons(newGame, user.id);
                    try {
                        await interaction.message.edit({
                            embeds: [embed],
                            components: buttons ? [buttons] : []
                        });
                        if (!newGame.gameOver && newGame.dealingPhase >= 5) {
                            startTurnTimer(newGame, interaction);
                        }
                    } catch (error) {
                        console.error('Error updating game message after betting phase:', error);
                        await interaction.followUp({
                            content: '⚠️ Failed to update the game message. The new game has started, but the table may not reflect it.',
                            flags: 64
                        });
                    }
                } else {
                    const embed = await createGameEmbed(game, user.id);
                    const buttons = createButtons(game, user.id);
                    let components = [];
                    if (buttons) {
                        if (Array.isArray(buttons)) {
                            components = buttons;
                        } else {
                            components = [buttons];
                        }
                    }
                    try {
                        await message.edit({
                            embeds: [embed],
                            components: components
                        });
                    } catch (error) {
                        console.error('Error updating game message after bet adjustment:', error);
                        await interaction.followUp({
                            content: '⚠️ Failed to update the game message. Your bet was adjusted, but the table may not reflect it.',
                            flags: 64
                        });
                    }
                }
            } else if (customId === 'submit_perfect_pairs_bet') {
                const betInput = interaction.fields.getTextInputValue('sidebet_amount');
                const bet = parseInt(betInput);

                if (isNaN(bet) || bet < 1 || bet > 100) {
                    return interaction.reply({
                        content: '❌ Invalid bet! Perfect Pairs bet must be between 1 and 100.',
                        flags: 64
                    });
                }

                const game = activeGames.get(user.id) || activeGames.get(interaction.channelId);
                if (!game) {
                    return interaction.reply({ content: '❌ No active game found!', flags: 64 });
                }

                const userMoney = await getUserMoney(user.id);
                if (userMoney < bet) {
                    return interaction.reply({
                        content: `❌ You don't have enough money! You have ${userMoney}.`,
                        flags: 64
                    });
                }

                if (!game.addSideBet(user.id, 'perfectPairs', bet)) {
                    return interaction.reply({
                        content: '❌ Cannot place Perfect Pairs bet at this time!',
                        flags: 64
                    });
                }

                await setUserMoney(user.id, userMoney - bet);
                await interaction.reply({
                    content: `✅ Perfect Pairs side bet placed: ${bet}!`,
                    flags: 64
                });

                // Update the game display
                try {
                    const channel = await client.channels.fetch(interaction.channelId);
                    const message = await channel.messages.fetch(interaction.message.id);
                    const embed = await createGameEmbed(game, user.id);
                    const buttons = createButtons(game, user.id);
                    let components = [];
                    if (buttons) {
                        if (Array.isArray(buttons)) {
                            components = buttons;
                        } else {
                            components = [buttons];
                        }
                    }
                    await message.edit({
                        embeds: [embed],
                        components: components
                    });
                } catch (error) {
                    console.error('Error updating game message after Perfect Pairs bet:', error);
                }
            }

            else if (customId === 'submit_insurance_bet') {
                const betInput = interaction.fields.getTextInputValue('sidebet_amount');
                const bet = parseInt(betInput);

                if (isNaN(bet) || bet < 1 || bet > 50) {
                    return interaction.reply({
                        content: '❌ Invalid bet! Insurance bet must be between 1 and 50.',
                        flags: 64
                    });
                }

                const game = activeGames.get(user.id) || activeGames.get(interaction.channelId);
                if (!game) {
                    return interaction.reply({ content: '❌ No active game found!', flags: 64 });
                }

                const userMoney = await getUserMoney(user.id);
                if (userMoney < bet) {
                    return interaction.reply({
                        content: `❌ You don't have enough money! You have ${userMoney}.`,
                        flags: 64
                    });
                }

                if (!game.addSideBet(user.id, 'insurance', bet)) {
                    return interaction.reply({
                        content: '❌ Cannot place insurance bet at this time!',
                        flags: 64
                    });
                }

                await setUserMoney(user.id, userMoney - bet);
                await interaction.reply({
                    content: `✅ Insurance side bet placed: ${bet}!`,
                    flags: 64
                });

                // Update the game display
                try {
                    const channel = await client.channels.fetch(interaction.channelId);
                    const message = await channel.messages.fetch(interaction.message.id);
                    const embed = await createGameEmbed(game, user.id);
                    const buttons = createButtons(game, user.id);
                    let components = [];
                    if (buttons) {
                        if (Array.isArray(buttons)) {
                            components = buttons;
                        } else {
                            components = [buttons];
                        }
                    }
                    await message.edit({
                        embeds: [embed],
                        components: components
                    });
                } catch (error) {
                    console.error('Error updating game message after insurance bet:', error);
                }
            }
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
        try {
            await interaction.reply({
                content: '⚠️ An error occurred while processing your action. Please try again or contact the bot owner.',
                flags: 64
            });
        } catch (replyError) {
            console.error('Error sending error reply:', replyError);
        }
    }
});

client.login(token);