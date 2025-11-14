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

// Check achievements after a game result (FIXED - now uses database)
async function checkAchievements(userId, gameData = {}) {
    const userData = await getUserData(userId);
    if (!userData) return [];

    const stats = userData.statistics || {};
    const newAchievements = [];

    // Check Broke the Bank (win $10k+ in one bet)
    if (gameData.winnings >= 10000 && !(await hasAchievement(userId, 'broke_the_bank'))) {
        const achievement = await unlockAchievement(userId, 'broke_the_bank');
        if (achievement) newAchievements.push(achievement);
    }

    // Check Rock Bottom (lose $50k+ in one bet)
    if (gameData.winnings <= -50000 && !(await hasAchievement(userId, 'rock_bottom'))) {
        const achievement = await unlockAchievement(userId, 'rock_bottom');
        if (achievement) newAchievements.push(achievement);
    }

    // Check High Roller (wager $100k total)
    if (stats.totalWagered >= 100000 && !(await hasAchievement(userId, 'high_roller'))) {
        const achievement = await unlockAchievement(userId, 'high_roller');
        if (achievement) newAchievements.push(achievement);
    }

    // Check Millionaire (reach $1M balance)
    if (userData.money >= 1000000 && !(await hasAchievement(userId, 'millionaire'))) {
        const achievement = await unlockAchievement(userId, 'millionaire');
        if (achievement) newAchievements.push(achievement);
    }

    // Check win streak achievements
    if (gameData.result === 'win' || gameData.result === 'blackjack') {
        const streakData = await updateWinStreakDB(userId, true);

        if (streakData) {
            // Lucky Streak - 10 wins in a row
            if (streakData.currentWinStreak >= 10 && !(await hasAchievement(userId, 'lucky_streak'))) {
                const achievement = await unlockAchievement(userId, 'lucky_streak');
                if (achievement) newAchievements.push(achievement);
            }

            // Unstoppable - 25 wins in a row
            if (streakData.currentWinStreak >= 25 && !(await hasAchievement(userId, 'unstoppable'))) {
                const achievement = await unlockAchievement(userId, 'unstoppable');
                if (achievement) newAchievements.push(achievement);
            }
        }
    } else if (gameData.result === 'lose') {
        // Check for Win Streak Protection boost
        const { hasActiveBoost, consumeBoost } = require('./shop');
        const hasProtection = await hasActiveBoost(userId, 'streak_protection');

        if (hasProtection) {
            await consumeBoost(userId, 'streak_protection');
            // Store notification that protection was used
            const { storeBoostNotification } = require('../database/queries');
            await storeBoostNotification(userId, {
                type: 'streak_protection',
                message: '🛡️ Your Win Streak Protection saved your streak from being reset!'
            });
            // Don't reset streak
        } else {
            await updateWinStreakDB(userId, false);
        }
    }

    // Check Blackjack Master (100 blackjacks)
    if (stats.blackjacks >= 100 && !(await hasAchievement(userId, 'blackjack_master'))) {
        const achievement = await unlockAchievement(userId, 'blackjack_master');
        if (achievement) newAchievements.push(achievement);
    }

    // Check Slots Champion (500 slots wins)
    if (stats.slots_wins >= 500 && !(await hasAchievement(userId, 'slots_champion'))) {
        const achievement = await unlockAchievement(userId, 'slots_champion');
        if (achievement) newAchievements.push(achievement);
    }

    // Check Roulette King (100 roulette wins)
    if (stats.roulette_wins >= 100 && !(await hasAchievement(userId, 'roulette_king'))) {
        const achievement = await unlockAchievement(userId, 'roulette_king');
        if (achievement) newAchievements.push(achievement);
    }

    // Check Generous (send $50k in gifts)
    if (userData.totalGiftsSent >= 50000 && !(await hasAchievement(userId, 'generous'))) {
        const achievement = await unlockAchievement(userId, 'generous');
        if (achievement) newAchievements.push(achievement);
    }

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
