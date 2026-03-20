const { getUserData } = require('./data');
const {
    unlockAchievementDB,
    hasAchievementDB,
    getUserAchievementsDB,
    getAchievementProgressDB,
    updateWinStreakDB,
    incrementWorkShiftsDB,
    updateLoanProgressDB
} = require('./data');

// Achievement definitions
const ACHIEVEMENTS = {
    // Money-based achievements
    broke_the_bank: {
        id: 'broke_the_bank',
        name: '💰 Broke the Bank',
        description: 'Win $10,000 or more in a single bet',
        emoji: '💰',
        category: 'gambling'
    },
    high_roller: {
        id: 'high_roller',
        name: '🎰 High Roller',
        description: 'Wager a total of $100,000 across all games',
        emoji: '🎰',
        category: 'gambling'
    },
    millionaire: {
        id: 'millionaire',
        name: '💎 Millionaire',
        description: 'Reach a balance of $1,000,000',
        emoji: '💎',
        category: 'wealth'
    },

    // Win streak achievements
    lucky_streak: {
        id: 'lucky_streak',
        name: '🍀 Lucky Streak',
        description: 'Win 10 games in a row',
        emoji: '🍀',
        category: 'skill'
    },
    unstoppable: {
        id: 'unstoppable',
        name: '🔥 Unstoppable',
        description: 'Win 25 games in a row',
        emoji: '🔥',
        category: 'skill'
    },

    // Loan achievements
    loan_shark: {
        id: 'loan_shark',
        name: '🦈 Loan Shark',
        description: 'Fully repay a loan of $50,000 or more',
        emoji: '🦈',
        category: 'financial'
    },
    debt_free: {
        id: 'debt_free',
        name: '✨ Debt Free',
        description: 'Pay off 10 loans',
        emoji: '✨',
        category: 'financial'
    },

    // Game-specific achievements
    blackjack_master: {
        id: 'blackjack_master',
        name: '🃏 Blackjack Master',
        description: 'Get 100 blackjacks',
        emoji: '🃏',
        category: 'games'
    },
    slots_champion: {
        id: 'slots_champion',
        name: '🎰 Slots Champion',
        description: 'Win 500 times on slots',
        emoji: '🎰',
        category: 'games'
    },
    roulette_king: {
        id: 'roulette_king',
        name: '👑 Roulette King',
        description: 'Win 100 roulette spins',
        emoji: '👑',
        category: 'games'
    },

    // Work achievements
    hard_worker: {
        id: 'hard_worker',
        name: '💼 Hard Worker',
        description: 'Complete 100 work shifts',
        emoji: '💼',
        category: 'work'
    },

    // Social achievements
    generous: {
        id: 'generous',
        name: '🎁 Generous',
        description: 'Send a total of $50,000 in gifts',
        emoji: '🎁',
        category: 'social'
    },

    // Loss achievements (for fun)
    rock_bottom: {
        id: 'rock_bottom',
        name: '📉 Rock Bottom',
        description: 'Lose $50,000 or more in a single bet',
        emoji: '📉',
        category: 'gambling'
    },

    // Lottery achievements
    lottery_winner: {
        id: 'lottery_winner',
        name: '🎟️ Lottery Winner',
        description: 'Win the lottery jackpot (5/5 numbers)',
        emoji: '🎟️',
        category: 'games'
    }
};

// Check if user has unlocked an achievement (FIXED - now uses database)
async function hasAchievement(userId, achievementId) {
    return await hasAchievementDB(userId, achievementId);
}

// Unlock an achievement for a user (FIXED - now uses database)
async function unlockAchievement(userId, achievementId) {
    const unlocked = await unlockAchievementDB(userId, achievementId);

    if (!unlocked) {
        return null; // Already unlocked or failed
    }

    return ACHIEVEMENTS[achievementId];
}

// Check achievements after a game result (batch: loads all unlocked IDs in one query)
async function checkAchievements(userId, gameData = {}) {
    const [userData, existingList] = await Promise.all([
        getUserData(userId),
        getUserAchievementsDB(userId)
    ]);
    if (!userData) return [];

    const unlocked = new Set(existingList.map(a => a.achievementId));
    const stats = userData.statistics || {};
    const newAchievements = [];

    const tryUnlock = async (id) => {
        if (unlocked.has(id)) return;
        const achievement = await unlockAchievement(userId, id);
        if (achievement) {
            unlocked.add(id);
            newAchievements.push(achievement);
        }
    };

    if (gameData.winnings >= 10000) await tryUnlock('broke_the_bank');
    if (gameData.winnings <= -50000) await tryUnlock('rock_bottom');
    if (stats.totalWagered >= 100000) await tryUnlock('high_roller');
    if (userData.money >= 1000000) await tryUnlock('millionaire');

    // Check win streak achievements
    if (gameData.result === 'win' || gameData.result === 'blackjack') {
        const streakData = await updateWinStreakDB(userId, true);

        if (streakData) {
            if (streakData.currentWinStreak >= 10) await tryUnlock('lucky_streak');
            if (streakData.currentWinStreak >= 25) await tryUnlock('unstoppable');
        }
    } else if (gameData.result === 'lose') {
        const { hasActiveBoost, consumeBoost } = require('./shop');
        const hasProtection = await hasActiveBoost(userId, 'streak_protection');

        if (hasProtection) {
            await consumeBoost(userId, 'streak_protection');
            const { storeBoostNotification } = require('../database/queries');
            await storeBoostNotification(userId, {
                type: 'streak_protection',
                message: '🛡️ Your Win Streak Protection saved your streak from being reset!'
            });
        } else {
            await updateWinStreakDB(userId, false);
        }
    }

    if (stats.blackjacks >= 100) await tryUnlock('blackjack_master');
    if (stats.slots_wins >= 500) await tryUnlock('slots_champion');
    if (stats.roulette_wins >= 100) await tryUnlock('roulette_king');
    if (userData.totalGiftsSent >= 50000) await tryUnlock('generous');

    return newAchievements;
}

// Check work-related achievements (FIXED - now uses database)
async function checkWorkAchievements(userId) {
    const newAchievements = [];

    const workShifts = await incrementWorkShiftsDB(userId);

    // Check Hard Worker (100 work shifts)
    if (workShifts >= 100 && !(await hasAchievement(userId, 'hard_worker'))) {
        const achievement = await unlockAchievement(userId, 'hard_worker');
        if (achievement) newAchievements.push(achievement);
    }

    return newAchievements;
}

// Check loan-related achievements (FIXED - now uses database)
async function checkLoanAchievements(userId, loanAmount) {
    const newAchievements = [];

    const loanProgress = await updateLoanProgressDB(userId, loanAmount);

    if (!loanProgress) return newAchievements;

    // Check Loan Shark (repay $50k+ loan)
    if (loanAmount >= 50000 && !(await hasAchievement(userId, 'loan_shark'))) {
        const achievement = await unlockAchievement(userId, 'loan_shark');
        if (achievement) newAchievements.push(achievement);
    }

    // Check Debt Free (pay off 10 loans)
    if (loanProgress.loansRepaid >= 10 && !(await hasAchievement(userId, 'debt_free'))) {
        const achievement = await unlockAchievement(userId, 'debt_free');
        if (achievement) newAchievements.push(achievement);
    }

    return newAchievements;
}

// Get all achievements for a user (FIXED - now uses database)
async function getUserAchievements(userId) {
    const achievementsList = await getUserAchievementsDB(userId);
    const progress = await getAchievementProgressDB(userId);
    const userData = await getUserData(userId);

    const unlocked = achievementsList.map(item => ({
        ...ACHIEVEMENTS[item.achievementId],
        unlockedAt: item.unlockedAt
    }));

    const locked = Object.values(ACHIEVEMENTS).filter(achievement =>
        !achievementsList.some(item => item.achievementId === achievement.id)
    );

    return {
        unlocked,
        locked,
        progress: progress || {
            currentWinStreak: 0,
            bestWinStreak: 0,
            loansRepaid: 0,
            largestLoanRepaid: 0,
            workShifts: 0
        },
        stats: userData?.statistics || {}
    };
}

// Get achievement categories
function getAchievementsByCategory() {
    const categories = {};

    for (const achievement of Object.values(ACHIEVEMENTS)) {
        if (!categories[achievement.category]) {
            categories[achievement.category] = [];
        }
        categories[achievement.category].push(achievement);
    }

    return categories;
}

module.exports = {
    ACHIEVEMENTS,
    hasAchievement,
    unlockAchievement,
    checkAchievements,
    checkWorkAchievements,
    checkLoanAchievements,
    getUserAchievements,
    getAchievementsByCategory
};
