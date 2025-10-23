const fs = require('fs').promises;
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'blackjack_data.json');
let userData = {};

async function loadUserData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        userData = JSON.parse(data);
        console.log('User data loaded successfully');
    } catch (error) {
        console.log('No existing data file found, creating new one');
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
    const isNewUser = !userData[userId];

    if (isNewUser) {
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
                threeCardPokerWins: 0,
                // Work stats
                totalWorkSessions: 0,
                totalWorkEarnings: 0,
                // Property stats
                totalPropertiesOwned: 0,
                totalPropertyIncomeCollected: 0,
                totalPropertyValue: 0,
                // Shop stats
                totalItemsPurchased: 0,
                totalBoostsUsed: 0,
                totalSpentOnShop: 0,
                // Achievement/Challenge stats
                totalAchievementsUnlocked: 0,
                totalChallengesCompleted: 0,
                totalChallengeRewardsEarned: 0,
                // Guild stats
                totalGuildContributions: 0,
                guildHeistsParticipated: 0,
                guildHeistsWon: 0
            },
            gameHistory: [],
            giftsReceived: 0,
            giftsSent: 0,
            totalGiftsReceived: 0,
            totalGiftsSent: 0,
            activeLoan: null,
            loanHistory: [],
            creditScore: 500,
            lastWork: 0
        };
        // Save immediately for new users
        await saveUserData();
    } else {
        // Ensure all fields exist and are numbers to prevent toString() errors
        userData[userId].money = userData[userId].money ?? 500;
        userData[userId].lastDaily = userData[userId].lastDaily ?? 0;
        userData[userId].statistics = userData[userId].statistics ?? {};

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
        // Work stats
        stats.totalWorkSessions = stats.totalWorkSessions ?? 0;
        stats.totalWorkEarnings = stats.totalWorkEarnings ?? 0;
        // Property stats
        stats.totalPropertiesOwned = stats.totalPropertiesOwned ?? 0;
        stats.totalPropertyIncomeCollected = stats.totalPropertyIncomeCollected ?? 0;
        stats.totalPropertyValue = stats.totalPropertyValue ?? 0;
        // Shop stats
        stats.totalItemsPurchased = stats.totalItemsPurchased ?? 0;
        stats.totalBoostsUsed = stats.totalBoostsUsed ?? 0;
        stats.totalSpentOnShop = stats.totalSpentOnShop ?? 0;
        // Achievement/Challenge stats
        stats.totalAchievementsUnlocked = stats.totalAchievementsUnlocked ?? 0;
        stats.totalChallengesCompleted = stats.totalChallengesCompleted ?? 0;
        stats.totalChallengeRewardsEarned = stats.totalChallengeRewardsEarned ?? 0;
        // Guild stats
        stats.totalGuildContributions = stats.totalGuildContributions ?? 0;
        stats.guildHeistsParticipated = stats.guildHeistsParticipated ?? 0;
        stats.guildHeistsWon = stats.guildHeistsWon ?? 0;

        userData[userId].gameHistory = userData[userId].gameHistory ?? [];
        userData[userId].giftsReceived = userData[userId].giftsReceived ?? 0;
        userData[userId].giftsSent = userData[userId].giftsSent ?? 0;
        userData[userId].totalGiftsReceived = userData[userId].totalGiftsReceived ?? 0;
        userData[userId].totalGiftsSent = userData[userId].totalGiftsSent ?? 0;
        userData[userId].activeLoan = userData[userId].activeLoan ?? null;
        userData[userId].loanHistory = userData[userId].loanHistory ?? [];
        userData[userId].creditScore = userData[userId].creditScore ?? 500;
        userData[userId].lastWork = userData[userId].lastWork ?? 0;
        // No save for existing users - saves happen only on modifications
    }

    return userData[userId].money;
}

async function setUserMoney(userId, amount) {
    await getUserMoney(userId); // Ensure user exists

    const oldMoney = userData[userId].money;
    const newMoney = Math.max(0, Math.floor(amount));

    // If money increased (winnings), check for loan deduction
    if (newMoney > oldMoney && userData[userId].activeLoan) {
        const { deductFromWinnings } = require('./loanSystem');
        const winnings = newMoney - oldMoney;

        const { deducted, remaining } = await deductFromWinnings(userId, winnings);

        if (deducted > 0) {
            // Set to old money + remaining winnings (after loan deduction)
            userData[userId].money = Math.max(0, Math.floor(oldMoney + remaining));
            console.log(`Auto-deducted ${deducted} from ${userId}'s winnings for loan payment`);
        } else {
            userData[userId].money = newMoney;
        }
    } else {
        userData[userId].money = newMoney;
    }

    await saveUserData(); // Await save for consistency
}

async function recordGameResult(userId, gameType, bet, winnings, result, details = {},  additionalData = {}) {
    if (!userData[userId]) await getUserMoney(userId);

    const gameRecord = {
        timestamp: Date.now(),
        gameType,
        bet: Math.floor(bet),
        winnings: Math.floor(winnings),
        result,
        details,
        id: Date.now() + Math.random()
    };

    // Apply active boost effects
    const { hasActiveBoost, getActiveBoost, consumeBoost } = require('./shop');
    const boostsApplied = [];
    let modifiedWinnings = Math.floor(winnings);

    // Check for Win Multiplier boost (25% bonus on wins)
    if ((result === 'win' || result === 'blackjack') && hasActiveBoost(userId, 'win_multiplier')) {
        const boost = getActiveBoost(userId, 'win_multiplier');
        const bonusAmount = Math.floor(winnings * (boost.value / 100));
        modifiedWinnings += bonusAmount;

        // Add money for the bonus
        const currentMoney = await getUserMoney(userId);
        await setUserMoney(userId, currentMoney + bonusAmount);

        await consumeBoost(userId, 'win_multiplier');
        boostsApplied.push({ type: 'win_multiplier', bonus: bonusAmount });
    }

    // Check for Insurance boost (50% refund on loss)
    if (result === 'lose' && hasActiveBoost(userId, 'insurance')) {
        const boost = getActiveBoost(userId, 'insurance');
        const refundAmount = Math.floor(bet * (boost.value / 100));

        // Refund money
        const currentMoney = await getUserMoney(userId);
        await setUserMoney(userId, currentMoney + refundAmount);

        modifiedWinnings += refundAmount; // Add to winnings for display
        await consumeBoost(userId, 'insurance');
        boostsApplied.push({ type: 'insurance', refund: refundAmount });
    }

    // Update game record with modified winnings if boosts were applied
    if (boostsApplied.length > 0) {
        gameRecord.boostsApplied = boostsApplied;
        gameRecord.originalWinnings = Math.floor(winnings);
        gameRecord.winnings = modifiedWinnings;
    }

    userData[userId].gameHistory.unshift(gameRecord);

    // Keep only last 50 games
    if (userData[userId].gameHistory.length > 50) {
        userData[userId].gameHistory = userData[userId].gameHistory.slice(0, 50);
    }

    // Update statistics
    const stats = userData[userId].statistics;
    stats.gamesPlayed = (stats.gamesPlayed || 0) + 1;
    stats.totalWagered = (stats.totalWagered || 0) + Math.floor(bet);
    stats.totalWinnings = (stats.totalWinnings || 0) + modifiedWinnings + Math.floor(bet);

    if (result === 'win' || result === 'blackjack') {
        stats.gamesWon = (stats.gamesWon || 0) + 1;
        if (modifiedWinnings > (stats.biggestWin || 0)) {
            stats.biggestWin = Math.floor(modifiedWinnings);
        }
    }

    // Check achievements and update challenges
    const { checkAchievements } = require('./achievements');
    const { updateChallengeProgress } = require('./challenges');

    // Check for achievement unlocks
    const newAchievements = await checkAchievements(userId, {
        gameType,
        bet: Math.floor(bet),
        winnings: Math.floor(winnings),
        result,
        details
    });

    // Update challenge progress
    const completedChallenges = await updateChallengeProgress(userId, {
        gameType,
        bet: Math.floor(bet),
        winnings: Math.floor(winnings),
        result,
        handsPlayed: details.handsPlayed
    });

    // Store notifications for later (to be shown after game)
    if (!userData[userId].pendingNotifications) {
        userData[userId].pendingNotifications = { achievements: [], challenges: [] };
    }

    if (newAchievements.length > 0) {
        userData[userId].pendingNotifications.achievements.push(...newAchievements);
    }

    if (completedChallenges.length > 0) {
        userData[userId].pendingNotifications.challenges.push(...completedChallenges);
    }

    if (gameType === 'roulette') {
    stats.rouletteSpins = (stats.rouletteSpins || 0) + 1;
    if (result === 'win') {
        stats.rouletteWins = (stats.rouletteWins || 0) + 1;
    }
    
    // Track additional roulette stats if provided
    if (additionalData) {
        if (additionalData.winningNumber !== undefined) {
            stats.rouletteNumbers = stats.rouletteNumbers || {};
            const numKey = additionalData.winningNumber.toString();
            stats.rouletteNumbers[numKey] = (stats.rouletteNumbers[numKey] || 0) + 1;
        }
        if (additionalData.betsPlaced) {
            stats.rouletteBetsPlaced = (stats.rouletteBetsPlaced || 0) + additionalData.betsPlaced;
        }
    }
}

    if (winnings < 0 && Math.abs(winnings) > (stats.biggestLoss || 0)) {
        stats.biggestLoss = Math.floor(Math.abs(winnings));
    }

    if (result === 'blackjack') {
        stats.blackjacks = (stats.blackjacks || 0) + 1;
    }
    
    if (details.handsPlayed) {
        stats.handsPlayed = (stats.handsPlayed || 0) + details.handsPlayed;
    }
    
    if (gameType === 'slots') {
        stats.slotsSpins = (stats.slotsSpins || 0) + 1;
        if (winnings > 0) {
            stats.slotsWins = (stats.slotsWins || 0) + 1;
        }
    }
    
    if (gameType === 'three_card_poker') {
        stats.threeCardPokerGames = (stats.threeCardPokerGames || 0) + 1;
        if (winnings > 0) {
            stats.threeCardPokerWins = (stats.threeCardPokerWins || 0) + 1;
        }
    }

    if (gameType === 'craps') {
        stats.crapsGames = (stats.crapsGames || 0) + 1;
        if (result === 'win') {
            stats.crapsWins = (stats.crapsWins || 0) + 1;
        }
    }

    if (gameType === 'war') {
        stats.warGames = (stats.warGames || 0) + 1;
        if (result === 'win') {
            stats.warWins = (stats.warWins || 0) + 1;
        }
    }

    if (gameType === 'coinflip') {
        stats.coinflipGames = (stats.coinflipGames || 0) + 1;
        if (result === 'win') {
            stats.coinflipWins = (stats.coinflipWins || 0) + 1;
        }
    }

    if (gameType === 'horserace') {
        stats.horseraceGames = (stats.horseraceGames || 0) + 1;
        if (result === 'win') {
            stats.horseraceWins = (stats.horseraceWins || 0) + 1;
        }
    }

    if (gameType === 'crash') {
        stats.crashGames = (stats.crashGames || 0) + 1;
        if (result === 'win') {
            stats.crashWins = (stats.crashWins || 0) + 1;
        }
    }

    if (gameType === 'hilo') {
        stats.hiloGames = (stats.hiloGames || 0) + 1;
        if (result === 'win') {
            stats.hiloWins = (stats.hiloWins || 0) + 1;
        }
        if (details.maxStreak) {
            stats.hiloMaxStreak = Math.max(stats.hiloMaxStreak || 0, details.maxStreak);
        }
    }

    if (gameType === 'bingo') {
        stats.bingoGames = (stats.bingoGames || 0) + 1;
        if (result === 'win') {
            stats.bingoWins = (stats.bingoWins || 0) + 1;
        }
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

function getAllUserData() {
    return userData;
}

function getUserData(userId) {
    return userData[userId] || null;
}

async function updateUserGifts(senderId, receiverId, amount) {
    await getUserMoney(senderId);
    await getUserMoney(receiverId);
    
    userData[senderId].giftsSent = (userData[senderId].giftsSent || 0) + 1;
    userData[receiverId].giftsReceived = (userData[receiverId].giftsReceived || 0) + 1;
    
    await saveUserData();
}

// Utility function to fix any corrupted data
function cleanUserData() {
    for (const userId in userData) {
        const user = userData[userId];

        // Ensure all numeric fields are actually numbers
        user.money = Number(user.money) || 500;
        user.lastDaily = Number(user.lastDaily) || 0;
        user.giftsReceived = Number(user.giftsReceived) || 0;
        user.giftsSent = Number(user.giftsSent) || 0;

        if (user.statistics) {
            const stats = user.statistics;
            Object.keys(stats).forEach(key => {
                stats[key] = Number(stats[key]) || 0;
            });
        }

        // Ensure gameHistory is an array
        if (!Array.isArray(user.gameHistory)) {
            user.gameHistory = [];
        }
    }

    saveUserData();
}

// Get and clear pending notifications
function getPendingNotifications(userId) {
    if (!userData[userId] || !userData[userId].pendingNotifications) {
        return { achievements: [], challenges: [] };
    }

    const notifications = userData[userId].pendingNotifications;
    userData[userId].pendingNotifications = { achievements: [], challenges: [] };

    return notifications;
}

module.exports = {
    loadUserData,
    saveUserData,
    getUserMoney,
    setUserMoney,
    recordGameResult,
    canClaimDaily,
    setLastDaily,
    getTimeUntilNextDaily,
    getAllUserData,
    getUserData,
    updateUserGifts,
    cleanUserData,
    getPendingNotifications
};