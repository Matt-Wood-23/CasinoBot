const { getUserData, saveUserData } = require('./data');

// Challenge templates for daily challenges
const DAILY_CHALLENGE_POOL = [
    {
        id: 'daily_blackjack_wins',
        name: 'Blackjack Winner',
        description: 'Win 5 blackjack hands',
        type: 'blackjack_wins',
        target: 5,
        reward: 250,
        emoji: '🃏'
    },
    {
        id: 'daily_slots_spins',
        name: 'Slot Machine Enthusiast',
        description: 'Spin the slots 20 times',
        type: 'slots_spins',
        target: 20,
        reward: 200,
        emoji: '🎰'
    },
    {
        id: 'daily_any_wins',
        name: 'Winning Streak',
        description: 'Win any 10 games',
        type: 'any_wins',
        target: 10,
        reward: 300,
        emoji: '🏆'
    },
    {
        id: 'daily_bet_amount',
        name: 'Big Spender',
        description: 'Wager a total of $2,000',
        type: 'total_wagered',
        target: 2000,
        reward: 250,
        emoji: '💸'
    },
    {
        id: 'daily_roulette_spins',
        name: 'Roulette Runner',
        description: 'Play roulette 10 times',
        type: 'roulette_spins',
        target: 10,
        reward: 200,
        emoji: '🎲'
    },
    {
        id: 'daily_work',
        name: 'Hard Worker',
        description: 'Complete 3 work shifts',
        type: 'work_shifts',
        target: 3,
        reward: 300,
        emoji: '💼'
    },
    {
        id: 'daily_coinflip',
        name: 'Coin Flipper',
        description: 'Play coinflip 15 times',
        type: 'coinflip_games',
        target: 15,
        reward: 150,
        emoji: '🪙'
    },
    {
        id: 'daily_big_win',
        name: 'Big Winner',
        description: 'Win $1,000 or more in a single game',
        type: 'single_big_win',
        target: 1000,
        reward: 500,
        emoji: '💰'
    }
];

// Challenge templates for weekly challenges
const WEEKLY_CHALLENGE_POOL = [
    {
        id: 'weekly_total_bet',
        name: 'High Roller Week',
        description: 'Wager a total of $10,000 this week',
        type: 'total_wagered',
        target: 10000,
        reward: 1500,
        emoji: '🎰'
    },
    {
        id: 'weekly_wins',
        name: 'Winning Week',
        description: 'Win 50 games this week',
        type: 'any_wins',
        target: 50,
        reward: 2000,
        emoji: '🏆'
    },
    {
        id: 'weekly_blackjack',
        name: 'Blackjack Marathon',
        description: 'Play 100 blackjack hands',
        type: 'blackjack_hands',
        target: 100,
        reward: 1500,
        emoji: '🃏'
    },
    {
        id: 'weekly_slots',
        name: 'Slots Master',
        description: 'Win 100 times on slots',
        type: 'slots_wins',
        target: 100,
        reward: 2500,
        emoji: '🎰'
    },
    {
        id: 'weekly_profit',
        name: 'Profit Hunter',
        description: 'Earn a total profit of $5,000',
        type: 'net_profit',
        target: 5000,
        reward: 3000,
        emoji: '💵'
    },
    {
        id: 'weekly_work',
        name: 'Work Week',
        description: 'Complete 10 work shifts',
        type: 'work_shifts',
        target: 10,
        reward: 1000,
        emoji: '💼'
    },
    {
        id: 'weekly_diverse',
        name: 'Jack of All Games',
        description: 'Play 5 different game types',
        type: 'unique_games',
        target: 5,
        reward: 1200,
        emoji: '🎮'
    }
];

// Initialize challenges for a user
function initializeChallenges(userId) {
    const userData = getUserData(userId);
    if (!userData) return null;

    const now = Date.now();

    if (!userData.challenges) {
        userData.challenges = {
            daily: [],
            weekly: [],
            lastDailyReset: now,
            lastWeeklyReset: now,
            completionHistory: [],
            dailyStreak: 0,
            lastDailyCompletion: 0
        };
    }

    // Ensure all fields exist
    userData.challenges.daily = userData.challenges.daily || [];
    userData.challenges.weekly = userData.challenges.weekly || [];
    userData.challenges.lastDailyReset = userData.challenges.lastDailyReset || now;
    userData.challenges.lastWeeklyReset = userData.challenges.lastWeeklyReset || now;
    userData.challenges.completionHistory = userData.challenges.completionHistory || [];
    userData.challenges.dailyStreak = userData.challenges.dailyStreak || 0;
    userData.challenges.lastDailyCompletion = userData.challenges.lastDailyCompletion || 0;

    return userData.challenges;
}

// Generate random daily challenges
function generateDailyChallenges() {
    // Pick 3 random daily challenges
    const shuffled = [...DAILY_CHALLENGE_POOL].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 3);

    const now = Date.now();
    const tomorrow = new Date();
    tomorrow.setHours(24, 0, 0, 0);

    return selected.map(template => ({
        ...template,
        progress: 0,
        completed: false,
        expiresAt: tomorrow.getTime(),
        startedAt: now
    }));
}

// Generate random weekly challenges
function generateWeeklyChallenges() {
    // Pick 2 random weekly challenges
    const shuffled = [...WEEKLY_CHALLENGE_POOL].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 2);

    const now = Date.now();
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    nextWeek.setHours(0, 0, 0, 0);

    return selected.map(template => ({
        ...template,
        progress: 0,
        completed: false,
        expiresAt: nextWeek.getTime(),
        startedAt: now,
        uniqueGamesPlayed: [] // For tracking unique games
    }));
}

// Reset daily challenges
async function resetDailyChallenges(userId) {
    const challenges = initializeChallenges(userId);
    if (!challenges) return;

    challenges.daily = generateDailyChallenges();
    challenges.lastDailyReset = Date.now();

    await saveUserData();
}

// Reset weekly challenges
async function resetWeeklyChallenges(userId) {
    const challenges = initializeChallenges(userId);
    if (!challenges) return;

    challenges.weekly = generateWeeklyChallenges();
    challenges.lastWeeklyReset = Date.now();

    await saveUserData();
}

// Check if daily challenges need reset
function shouldResetDaily(userId) {
    const challenges = initializeChallenges(userId);
    if (!challenges) return false;

    const now = Date.now();
    const lastReset = challenges.lastDailyReset || 0;
    const oneDayMs = 24 * 60 * 60 * 1000;

    return (now - lastReset) >= oneDayMs;
}

// Check if weekly challenges need reset
function shouldResetWeekly(userId) {
    const challenges = initializeChallenges(userId);
    if (!challenges) return false;

    const now = Date.now();
    const lastReset = challenges.lastWeeklyReset || 0;
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

    return (now - lastReset) >= oneWeekMs;
}

// Update challenge progress
async function updateChallengeProgress(userId, updateData = {}) {
    const challenges = initializeChallenges(userId);
    if (!challenges) return [];

    const completedChallenges = [];

    // Check if resets are needed
    if (shouldResetDaily(userId)) {
        await resetDailyChallenges(userId);
    }
    if (shouldResetWeekly(userId)) {
        await resetWeeklyChallenges(userId);
    }

    // Update daily challenges
    for (const challenge of challenges.daily) {
        if (challenge.completed) continue;

        const progressBefore = challenge.progress;

        switch (challenge.type) {
            case 'blackjack_wins':
                if (updateData.gameType === 'blackjack' && (updateData.result === 'win' || updateData.result === 'blackjack')) {
                    challenge.progress++;
                }
                break;

            case 'blackjack_hands':
                if (updateData.gameType === 'blackjack') {
                    challenge.progress += updateData.handsPlayed || 1;
                }
                break;

            case 'slots_spins':
                if (updateData.gameType === 'slots') {
                    challenge.progress++;
                }
                break;

            case 'slots_wins':
                if (updateData.gameType === 'slots' && updateData.result === 'win') {
                    challenge.progress++;
                }
                break;

            case 'roulette_spins':
                if (updateData.gameType === 'roulette') {
                    challenge.progress++;
                }
                break;

            case 'coinflip_games':
                if (updateData.gameType === 'coinflip') {
                    challenge.progress++;
                }
                break;

            case 'any_wins':
                if (updateData.result === 'win' || updateData.result === 'blackjack') {
                    challenge.progress++;
                }
                break;

            case 'total_wagered':
                if (updateData.bet) {
                    challenge.progress += updateData.bet;
                }
                break;

            case 'work_shifts':
                if (updateData.type === 'work') {
                    challenge.progress++;
                }
                break;

            case 'single_big_win':
                if (updateData.winnings >= challenge.target) {
                    challenge.progress = challenge.target;
                }
                break;
        }

        // Check if challenge is completed
        if (challenge.progress >= challenge.target && !challenge.completed) {
            challenge.completed = true;
            challenge.completedAt = Date.now();

            // Add to completion history
            challenges.completionHistory.unshift({
                id: challenge.id,
                name: challenge.name,
                reward: challenge.reward,
                completedAt: challenge.completedAt,
                type: 'daily'
            });

            // Keep only last 50 completions
            if (challenges.completionHistory.length > 50) {
                challenges.completionHistory = challenges.completionHistory.slice(0, 50);
            }

            completedChallenges.push(challenge);
        }
    }

    // Update weekly challenges
    for (const challenge of challenges.weekly) {
        if (challenge.completed) continue;

        switch (challenge.type) {
            case 'blackjack_hands':
                if (updateData.gameType === 'blackjack') {
                    challenge.progress += updateData.handsPlayed || 1;
                }
                break;

            case 'slots_wins':
                if (updateData.gameType === 'slots' && updateData.result === 'win') {
                    challenge.progress++;
                }
                break;

            case 'any_wins':
                if (updateData.result === 'win' || updateData.result === 'blackjack') {
                    challenge.progress++;
                }
                break;

            case 'total_wagered':
                if (updateData.bet) {
                    challenge.progress += updateData.bet;
                }
                break;

            case 'net_profit':
                if (updateData.winnings) {
                    challenge.progress += updateData.winnings;
                }
                break;

            case 'work_shifts':
                if (updateData.type === 'work') {
                    challenge.progress++;
                }
                break;

            case 'unique_games':
                if (updateData.gameType && !challenge.uniqueGamesPlayed.includes(updateData.gameType)) {
                    challenge.uniqueGamesPlayed.push(updateData.gameType);
                    challenge.progress = challenge.uniqueGamesPlayed.length;
                }
                break;
        }

        // Check if challenge is completed
        if (challenge.progress >= challenge.target && !challenge.completed) {
            challenge.completed = true;
            challenge.completedAt = Date.now();

            // Add to completion history
            challenges.completionHistory.unshift({
                id: challenge.id,
                name: challenge.name,
                reward: challenge.reward,
                completedAt: challenge.completedAt,
                type: 'weekly'
            });

            // Keep only last 50 completions
            if (challenges.completionHistory.length > 50) {
                challenges.completionHistory = challenges.completionHistory.slice(0, 50);
            }

            completedChallenges.push(challenge);
        }
    }

    await saveUserData();

    return completedChallenges;
}

// Get user challenges
function getUserChallenges(userId) {
    const challenges = initializeChallenges(userId);
    if (!challenges) return null;

    // Generate challenges if none exist
    if (challenges.daily.length === 0) {
        challenges.daily = generateDailyChallenges();
    }
    if (challenges.weekly.length === 0) {
        challenges.weekly = generateWeeklyChallenges();
    }

    return challenges;
}

// Award challenge rewards
async function awardChallengeReward(userId, challenge) {
    const { getUserMoney, setUserMoney } = require('./data');

    const currentMoney = await getUserMoney(userId);
    await setUserMoney(userId, currentMoney + challenge.reward);

    return challenge.reward;
}

// Reset all users' challenges (called daily/weekly)
async function resetAllChallenges(type = 'daily') {
    const { getAllUserData } = require('./data');
    const allUsers = getAllUserData();

    for (const userId in allUsers) {
        if (type === 'daily' && shouldResetDaily(userId)) {
            await resetDailyChallenges(userId);
        } else if (type === 'weekly' && shouldResetWeekly(userId)) {
            await resetWeeklyChallenges(userId);
        }
    }
}

module.exports = {
    initializeChallenges,
    generateDailyChallenges,
    generateWeeklyChallenges,
    resetDailyChallenges,
    resetWeeklyChallenges,
    shouldResetDaily,
    shouldResetWeekly,
    updateChallengeProgress,
    getUserChallenges,
    awardChallengeReward,
    resetAllChallenges,
    DAILY_CHALLENGE_POOL,
    WEEKLY_CHALLENGE_POOL
};
