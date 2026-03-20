const {
    getUserChallengesDB,
    createChallengeDB,
    deleteChallengesDB,
    hasActiveChallengesDB,
    getLastResetTimeDB,
    batchUpdateChallengeProgressDB,
    batchMarkChallengesCompletedDB
} = require('./data');

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

// Get user challenges from database (replaces initializeChallenges)
async function getUserChallenges(userId) {
    const challenges = await getUserChallengesDB(userId);

    // Add emoji property from templates
    for (const challenge of challenges.daily) {
        const template = DAILY_CHALLENGE_POOL.find(t => t.id === challenge.id);
        if (template) {
            challenge.emoji = template.emoji;
        }
    }

    for (const challenge of challenges.weekly) {
        const template = WEEKLY_CHALLENGE_POOL.find(t => t.id === challenge.id);
        if (template) {
            challenge.emoji = template.emoji;
        }
    }

    return challenges;
}

// Generate random daily challenges (for DB insertion)
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
        startedAt: now,
        period: 'daily'
    }));
}

// Generate random weekly challenges (for DB insertion)
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
        period: 'weekly',
        uniqueGamesPlayed: [] // For tracking unique games
    }));
}

// Reset daily challenges
async function resetDailyChallenges(userId) {
    // Delete all existing daily challenges
    await deleteChallengesDB(userId, 'daily');

    // Generate and create new daily challenges
    const newChallenges = generateDailyChallenges();

    for (const challenge of newChallenges) {
        await createChallengeDB(userId, challenge);
    }
}

// Reset weekly challenges
async function resetWeeklyChallenges(userId) {
    // Delete all existing weekly challenges
    await deleteChallengesDB(userId, 'weekly');

    // Generate and create new weekly challenges
    const newChallenges = generateWeeklyChallenges();

    for (const challenge of newChallenges) {
        await createChallengeDB(userId, challenge);
    }
}

// Check if daily challenges need reset
async function shouldResetDaily(userId) {
    const lastReset = await getLastResetTimeDB(userId, 'daily');

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    return (now - lastReset) >= oneDayMs;
}

// Check if weekly challenges need reset
async function shouldResetWeekly(userId) {
    const lastReset = await getLastResetTimeDB(userId, 'weekly');

    const now = Date.now();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

    return (now - lastReset) >= oneWeekMs;
}

// Compute new progress for a single challenge given the update data
function computeNewProgress(challenge, updateData) {
    let newProgress = challenge.progress;
    switch (challenge.type) {
        case 'blackjack_wins':
            if (updateData.gameType === 'blackjack' && (updateData.result === 'win' || updateData.result === 'blackjack')) newProgress++;
            break;
        case 'blackjack_hands':
            if (updateData.gameType === 'blackjack') newProgress += updateData.handsPlayed || 1;
            break;
        case 'slots_spins':
            if (updateData.gameType === 'slots') newProgress++;
            break;
        case 'slots_wins':
            if (updateData.gameType === 'slots' && updateData.result === 'win') newProgress++;
            break;
        case 'roulette_spins':
            if (updateData.gameType === 'roulette') newProgress++;
            break;
        case 'coinflip_games':
            if (updateData.gameType === 'coinflip') newProgress++;
            break;
        case 'any_wins':
            if (updateData.result === 'win' || updateData.result === 'blackjack') newProgress++;
            break;
        case 'total_wagered':
            if (updateData.bet) newProgress += updateData.bet;
            break;
        case 'net_profit':
            if (updateData.winnings) newProgress += updateData.winnings;
            break;
        case 'work_shifts':
            if (updateData.type === 'work') newProgress++;
            break;
        case 'single_big_win':
            if (updateData.winnings >= challenge.target) newProgress = challenge.target;
            break;
        case 'unique_games':
            if (updateData.gameType && !challenge.uniqueGamesPlayed.includes(updateData.gameType)) {
                challenge.uniqueGamesPlayed.push(updateData.gameType);
                newProgress++;
            }
            break;
    }
    return newProgress;
}

// Update challenge progress (batch DB writes: one update + one complete per call)
async function updateChallengeProgress(userId, updateData = {}) {
    const completedChallenges = [];

    // Check if resets are needed
    if (await shouldResetDaily(userId)) await resetDailyChallenges(userId);
    if (await shouldResetWeekly(userId)) await resetWeeklyChallenges(userId);

    const challenges = await getUserChallengesDB(userId);
    const allChallenges = [...challenges.daily, ...challenges.weekly];

    const progressUpdates = [];   // { challengeId, progress }
    const completedIds = [];      // challenge ids to mark completed

    for (const challenge of allChallenges) {
        if (challenge.completed) continue;

        const newProgress = computeNewProgress(challenge, updateData);

        if (newProgress !== challenge.progress) {
            challenge.progress = newProgress;
            const update = { challengeId: challenge.id, progress: newProgress };
            if (challenge.type === 'unique_games') {
                update.metadata = { gamesPlayed: challenge.uniqueGamesPlayed };
            }
            progressUpdates.push(update);
        }

        if (challenge.progress >= challenge.target) {
            challenge.completed = true;
            challenge.completedAt = Date.now();
            completedIds.push(challenge.id);
            completedChallenges.push(challenge);
        }
    }

    // Single batch write for progress, single batch write for completions
    await Promise.all([
        batchUpdateChallengeProgressDB(userId, progressUpdates),
        batchMarkChallengesCompletedDB(userId, completedIds)
    ]);

    return completedChallenges;
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
    const allUsers = await getAllUserData();

    for (const userId in allUsers) {
        if (type === 'daily' && await shouldResetDaily(userId)) {
            await resetDailyChallenges(userId);
        } else if (type === 'weekly' && await shouldResetWeekly(userId)) {
            await resetWeeklyChallenges(userId);
        }
    }
}

module.exports = {
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
