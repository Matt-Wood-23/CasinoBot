// Guild Challenges System - Weekly Cooperative Challenges
// Unlocked at Guild Level 5

const {
    initializeGuildChallenges,
    getGuildChallenges,
    updateGuildChallengeProgress,
    addGuildExperience
} = require('../database/queries');

// ==========================================
// CHALLENGE DEFINITIONS
// ==========================================

const CHALLENGE_TYPES = {
    WAGER_MASTER: {
        type: 'wager_master',
        name: 'Wager Master',
        description: 'Collectively wager $1,000,000 across all games',
        target: 1000000,
        xpReward: 500,
        icon: '💰'
    },
    HEIST_SQUAD: {
        type: 'heist_squad',
        name: 'Heist Squad',
        description: 'Complete 3 guild heists (win or lose)',
        target: 3,
        xpReward: 800,
        icon: '🏴‍☠️'
    },
    HIGH_ROLLERS: {
        type: 'high_rollers',
        name: 'High Rollers',
        description: 'Win 100 games together',
        target: 100,
        xpReward: 400,
        icon: '🎲'
    },
    BLACKJACK_MASTERS: {
        type: 'blackjack_masters',
        name: 'Blackjack Masters',
        description: 'Win 50 blackjack games',
        target: 50,
        xpReward: 300,
        icon: '🃏'
    },
    SLOTS_CHAMPIONS: {
        type: 'slots_champions',
        name: 'Slots Champions',
        description: 'Win 50 slots games',
        target: 50,
        xpReward: 300,
        icon: '🎰'
    },
    POKER_PROS: {
        type: 'poker_pros',
        name: 'Poker Pros',
        description: 'Win 30 poker games',
        target: 30,
        xpReward: 300,
        icon: '♠️'
    },
    GENEROUS_GUILD: {
        type: 'generous_guild',
        name: 'Generous Guild',
        description: 'Donate $100,000 to the guild treasury',
        target: 100000,
        xpReward: 600,
        icon: '🏦'
    },
    DAILY_GRINDERS: {
        type: 'daily_grinders',
        name: 'Daily Grinders',
        description: 'Members complete 50 daily bonuses combined',
        target: 50,
        xpReward: 350,
        icon: '📅'
    },
    HARD_WORKERS: {
        type: 'hard_workers',
        name: 'Hard Workers',
        description: 'Members work 100 shifts combined',
        target: 100,
        xpReward: 250,
        icon: '⚒️'
    },
    CHALLENGE_COMPLETERS: {
        type: 'challenge_completers',
        name: 'Challenge Completers',
        description: 'Members complete 20 personal challenges',
        target: 20,
        xpReward: 450,
        icon: '✅'
    }
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Get the start of the current week (Monday at 00:00 UTC)
 * @returns {number} Timestamp in milliseconds
 */
function getWeekStart() {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Days since last Monday

    const monday = new Date(now);
    monday.setUTCDate(now.getUTCDate() - daysFromMonday);
    monday.setUTCHours(0, 0, 0, 0);

    return monday.getTime();
}

/**
 * Get random challenges for the week
 * @param {number} count - Number of challenges to generate
 * @returns {Array} Array of challenge definitions
 */
function getRandomChallenges(count = 5) {
    const allChallenges = Object.values(CHALLENGE_TYPES);
    const selected = [];
    const used = new Set();

    while (selected.length < count && selected.length < allChallenges.length) {
        const randomIndex = Math.floor(Math.random() * allChallenges.length);
        if (!used.has(randomIndex)) {
            selected.push(allChallenges[randomIndex]);
            used.add(randomIndex);
        }
    }

    return selected;
}

/**
 * Get challenge definition by type
 * @param {string} challengeType - Type of challenge
 * @returns {object|null} Challenge definition or null
 */
function getChallengeDefinition(challengeType) {
    return Object.values(CHALLENGE_TYPES).find(c => c.type === challengeType) || null;
}

// ==========================================
// MAIN FUNCTIONS
// ==========================================

/**
 * Initialize weekly challenges for a guild
 * @param {string} guildId - Guild's unique ID
 * @returns {Promise<object>} Result object
 */
async function setupWeeklyChallenges(guildId) {
    const weekStart = getWeekStart();
    const challenges = getRandomChallenges(5); // 5 random challenges per week

    const result = await initializeGuildChallenges(guildId, weekStart, challenges);
    return result;
}

/**
 * Get current week's challenges for a guild
 * @param {string} guildId - Guild's unique ID
 * @returns {Promise<Array>} Array of challenge progress objects
 */
async function getWeeklyChallenges(guildId) {
    const weekStart = getWeekStart();
    const challenges = await getGuildChallenges(guildId, weekStart);

    // Enrich with challenge definitions
    return challenges.map(challenge => {
        const definition = getChallengeDefinition(challenge.challengeType);
        return {
            ...challenge,
            ...definition,
            progressPercentage: Math.floor((challenge.progress / challenge.target) * 100)
        };
    });
}

/**
 * Update challenge progress and award XP if completed
 * @param {string} guildId - Guild's unique ID
 * @param {string} challengeType - Type of challenge to update
 * @param {number} incrementAmount - Amount to increment progress
 * @param {string} userId - User who triggered the progress (optional)
 * @returns {Promise<object>} Result object with completion status
 */
async function progressChallenge(guildId, challengeType, incrementAmount = 1, userId = null) {
    const weekStart = getWeekStart();

    const result = await updateGuildChallengeProgress(
        guildId,
        weekStart,
        challengeType,
        incrementAmount
    );

    // If challenge was completed, award XP
    if (result.success && result.completed) {
        const xpResult = await addGuildExperience(
            guildId,
            userId,
            result.xpReward,
            'guild_challenge',
            `Completed ${challengeType}`
        );

        return {
            ...result,
            xpAwarded: xpResult.success,
            xpAmount: result.xpReward
        };
    }

    return result;
}

/**
 * Check if challenges need to be reset and initialize new week
 * @param {string} guildId - Guild's unique ID
 * @returns {Promise<boolean>} True if challenges were reset
 */
async function checkAndResetChallenges(guildId) {
    const weekStart = getWeekStart();
    const currentChallenges = await getGuildChallenges(guildId, weekStart);

    // If no challenges exist for this week, set them up
    if (currentChallenges.length === 0) {
        await setupWeeklyChallenges(guildId);
        return true;
    }

    return false;
}

/**
 * Get time until weekly reset (in milliseconds)
 * @returns {number} Milliseconds until next Monday 00:00 UTC
 */
function getTimeUntilReset() {
    const now = new Date();
    const nextMonday = new Date(now);
    const daysUntilMonday = (8 - now.getUTCDay()) % 7 || 7; // Days until next Monday

    nextMonday.setUTCDate(now.getUTCDate() + daysUntilMonday);
    nextMonday.setUTCHours(0, 0, 0, 0);

    return nextMonday.getTime() - now.getTime();
}

/**
 * Format time remaining until reset
 * @returns {string} Formatted time string
 */
function getFormattedTimeUntilReset() {
    const ms = getTimeUntilReset();
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) {
        return `${days}d ${hours}h`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

// ==========================================
// CHALLENGE TRACKING HELPERS
// ==========================================

/**
 * Track game win for challenges
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {string} gameName - Name of the game
 * @returns {Promise<void>}
 */
async function trackGameWin(guildId, userId, gameName) {
    // Track general game wins
    await progressChallenge(guildId, 'high_rollers', 1, userId);

    // Track game-specific challenges
    const gameType = gameName.toLowerCase();
    if (gameType.includes('blackjack')) {
        await progressChallenge(guildId, 'blackjack_masters', 1, userId);
    } else if (gameType.includes('slot')) {
        await progressChallenge(guildId, 'slots_champions', 1, userId);
    } else if (gameType.includes('poker')) {
        await progressChallenge(guildId, 'poker_pros', 1, userId);
    }
}

/**
 * Track money wagered for challenges
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {number} amount - Amount wagered
 * @returns {Promise<void>}
 */
async function trackWager(guildId, userId, amount) {
    await progressChallenge(guildId, 'wager_master', amount, userId);
}

/**
 * Track guild donation for challenges
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {number} amount - Amount donated
 * @returns {Promise<void>}
 */
async function trackDonation(guildId, userId, amount) {
    await progressChallenge(guildId, 'generous_guild', amount, userId);
}

/**
 * Track heist completion for challenges
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
async function trackHeist(guildId, userId) {
    await progressChallenge(guildId, 'heist_squad', 1, userId);
}

/**
 * Track daily bonus completion for challenges
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
async function trackDaily(guildId, userId) {
    await progressChallenge(guildId, 'daily_grinders', 1, userId);
}

/**
 * Track work completion for challenges
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
async function trackWork(guildId, userId) {
    await progressChallenge(guildId, 'hard_workers', 1, userId);
}

/**
 * Track personal challenge completion for challenges
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @returns {Promise<void>}
 */
async function trackPersonalChallenge(guildId, userId) {
    await progressChallenge(guildId, 'challenge_completers', 1, userId);
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
    // Constants
    CHALLENGE_TYPES,

    // Core Functions
    setupWeeklyChallenges,
    getWeeklyChallenges,
    progressChallenge,
    checkAndResetChallenges,

    // Utilities
    getWeekStart,
    getTimeUntilReset,
    getFormattedTimeUntilReset,
    getChallengeDefinition,

    // Tracking Helpers
    trackGameWin,
    trackWager,
    trackDonation,
    trackHeist,
    trackDaily,
    trackWork,
    trackPersonalChallenge
};
