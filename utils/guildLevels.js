// Guild Level System - Core Logic
// Handles level progression, XP requirements, and perk definitions

// ==========================================
// LEVEL PROGRESSION (Exponential Curve)
// ==========================================

// XP required to REACH each level (cumulative)
// Total XP to max level (20): ~2,000,000
const LEVEL_XP_REQUIREMENTS = [
    0,          // Level 1 (starting level)
    1000,       // Level 2
    3000,       // Level 3
    6000,       // Level 4
    10000,      // Level 5
    15000,      // Level 6
    25000,      // Level 7
    40000,      // Level 8
    60000,      // Level 9
    90000,      // Level 10
    130000,     // Level 11
    180000,     // Level 12
    250000,     // Level 13
    340000,     // Level 14
    450000,     // Level 15
    600000,     // Level 16
    800000,     // Level 17
    1050000,    // Level 18
    1350000,    // Level 19
    1700000     // Level 20 (max)
];

const MAX_LEVEL = 20;

// ==========================================
// PERK DEFINITIONS
// ==========================================

const PERKS = {
    // ===== ECONOMIC PERKS =====
    TREASURY_INTEREST_1: {
        level: 3,
        name: 'Treasury Interest I',
        description: 'Guild treasury earns 0.5% daily interest',
        category: 'economic',
        effect: { type: 'treasury_interest', value: 0.005 }
    },
    TREASURY_INTEREST_2: {
        level: 8,
        name: 'Treasury Interest II',
        description: 'Guild treasury interest increased to 1%',
        category: 'economic',
        effect: { type: 'treasury_interest', value: 0.01 }
    },
    TREASURY_INTEREST_3: {
        level: 13,
        name: 'Treasury Interest III',
        description: 'Guild treasury interest increased to 1.5%',
        category: 'economic',
        effect: { type: 'treasury_interest', value: 0.015 }
    },
    TREASURY_INTEREST_4: {
        level: 18,
        name: 'Treasury Interest IV',
        description: 'Guild treasury interest increased to 2%',
        category: 'economic',
        effect: { type: 'treasury_interest', value: 0.02 }
    },
    WORK_INCOME_BOOST: {
        level: 17,
        name: 'Labor Union',
        description: 'Members earn +25% from work commands',
        category: 'economic',
        effect: { type: 'work_bonus', value: 0.25 }
    },
    PROPERTY_INCOME_BOOST: {
        level: 18,
        name: 'Real Estate Mogul',
        description: 'Members earn +15% from property income',
        category: 'economic',
        effect: { type: 'property_bonus', value: 0.15 }
    },

    // ===== GAMEPLAY PERKS =====
    GAME_WINNINGS_1: {
        level: 2,
        name: 'Lucky Streak I',
        description: 'Members get +1% on all game winnings',
        category: 'gameplay',
        effect: { type: 'game_winnings', value: 0.01 }
    },
    GAME_WINNINGS_2: {
        level: 5,
        name: 'Lucky Streak II',
        description: 'Members get +3% on all game winnings',
        category: 'gameplay',
        effect: { type: 'game_winnings', value: 0.03 }
    },
    GAME_WINNINGS_3: {
        level: 8,
        name: 'Lucky Streak III',
        description: 'Members get +5% on all game winnings',
        category: 'gameplay',
        effect: { type: 'game_winnings', value: 0.05 }
    },
    GAME_WINNINGS_4: {
        level: 14,
        name: 'Lucky Streak IV',
        description: 'Members get +8% on all game winnings',
        category: 'gameplay',
        effect: { type: 'game_winnings', value: 0.08 }
    },
    GAME_WINNINGS_5: {
        level: 19,
        name: 'Lucky Streak V',
        description: 'Members get +10% on all game winnings',
        category: 'gameplay',
        effect: { type: 'game_winnings', value: 0.10 }
    },
    HEIST_SUCCESS_1: {
        level: 4,
        name: 'Master Planners I',
        description: 'Guild heists have +5% success rate',
        category: 'gameplay',
        effect: { type: 'heist_success', value: 0.05 }
    },
    HEIST_SUCCESS_2: {
        level: 9,
        name: 'Master Planners II',
        description: 'Guild heists have +10% success rate',
        category: 'gameplay',
        effect: { type: 'heist_success', value: 0.10 }
    },
    HEIST_SUCCESS_3: {
        level: 14,
        name: 'Master Planners III',
        description: 'Guild heists have +20% success rate',
        category: 'gameplay',
        effect: { type: 'heist_success', value: 0.20 }
    },
    HEIST_SUCCESS_4: {
        level: 19,
        name: 'Master Planners IV',
        description: 'Guild heists have +30% success rate',
        category: 'gameplay',
        effect: { type: 'heist_success', value: 0.30 }
    },
    HEIST_COST_REDUCTION_1: {
        level: 6,
        name: 'Efficient Operations I',
        description: 'Guild heist cost reduced by 20% ($8,000)',
        category: 'gameplay',
        effect: { type: 'heist_cost_reduction', value: 0.20 }
    },
    HEIST_COST_REDUCTION_2: {
        level: 16,
        name: 'Efficient Operations II',
        description: 'Guild heist cost reduced by 40% ($6,000)',
        category: 'gameplay',
        effect: { type: 'heist_cost_reduction', value: 0.40 }
    },
    HEIST_REWARD_MULTIPLIER: {
        level: 9,
        name: 'Big Score',
        description: 'Guild heist rewards multiplier +1x',
        category: 'gameplay',
        effect: { type: 'heist_reward_bonus', value: 1 }
    },
    DAILY_BONUS_INCREASE: {
        level: 11,
        name: 'Generous Patrons',
        description: 'Members get +10% on daily bonuses',
        category: 'gameplay',
        effect: { type: 'daily_bonus', value: 0.10 }
    },
    BET_LIMIT_INCREASE: {
        level: 12,
        name: 'High Roller Access',
        description: 'Members can bet 20% more on games',
        category: 'gameplay',
        effect: { type: 'bet_limit', value: 0.20 }
    },

    // ===== SOCIAL PERKS =====
    MEMBER_SLOTS_1: {
        level: 2,
        name: 'Growing Family I',
        description: 'Max members increased to 15',
        category: 'social',
        effect: { type: 'max_members', value: 15 }
    },
    MEMBER_SLOTS_2: {
        level: 4,
        name: 'Growing Family II',
        description: 'Max members increased to 20',
        category: 'social',
        effect: { type: 'max_members', value: 20 }
    },
    MEMBER_SLOTS_3: {
        level: 7,
        name: 'Growing Family III',
        description: 'Max members increased to 30',
        category: 'social',
        effect: { type: 'max_members', value: 30 }
    },
    MEMBER_SLOTS_4: {
        level: 10,
        name: 'Growing Family IV',
        description: 'Max members increased to 40',
        category: 'social',
        effect: { type: 'max_members', value: 40 }
    },
    MEMBER_SLOTS_5: {
        level: 13,
        name: 'Growing Family V',
        description: 'Max members increased to 50',
        category: 'social',
        effect: { type: 'max_members', value: 50 }
    },
    MEMBER_SLOTS_6: {
        level: 16,
        name: 'Growing Family VI',
        description: 'Max members increased to 75',
        category: 'social',
        effect: { type: 'max_members', value: 75 }
    },
    GUILD_RANKS: {
        level: 7,
        name: 'Guild Hierarchy',
        description: 'Unlock custom ranks/titles for members',
        category: 'social',
        effect: { type: 'feature_unlock', value: 'ranks' }
    },
    GUILD_ACHIEVEMENTS: {
        level: 15,
        name: 'Guild Legends',
        description: 'Unlock exclusive guild-only achievements',
        category: 'social',
        effect: { type: 'feature_unlock', value: 'achievements' }
    },

    // ===== COSMETIC PERKS =====
    CUSTOM_EMBLEM: {
        level: 6,
        name: 'Guild Emblem',
        description: 'Unlock custom guild emblem/icon',
        category: 'cosmetic',
        effect: { type: 'feature_unlock', value: 'emblem' }
    },
    CUSTOM_COLORS: {
        level: 12,
        name: 'Guild Colors',
        description: 'Unlock custom embed colors for guild',
        category: 'cosmetic',
        effect: { type: 'feature_unlock', value: 'colors' }
    },
    ELITE_STATUS: {
        level: 20,
        name: 'Elite Guild',
        description: 'Prestigious status with special effects and announcements',
        category: 'cosmetic',
        effect: { type: 'feature_unlock', value: 'elite' }
    },
    ELITE_BONUS: {
        level: 20,
        name: 'Elite Mastery',
        description: 'All percentage-based perks increased by 50%',
        category: 'cosmetic',
        effect: { type: 'elite_multiplier', value: 1.5 }
    },

    // ===== SPECIAL FEATURE UNLOCKS =====
    GUILD_CHALLENGES: {
        level: 5,
        name: 'Guild Challenges',
        description: 'Unlock weekly cooperative challenges',
        category: 'special',
        effect: { type: 'feature_unlock', value: 'challenges' }
    },
    GUILD_SHOP: {
        level: 10,
        name: 'Guild Shop',
        description: 'Unlock ability to purchase special items with treasury',
        category: 'special',
        effect: { type: 'feature_unlock', value: 'shop' }
    },
    GUILD_VAULT: {
        level: 15,
        name: 'Guild Vault',
        description: 'Unlock secure vault storage separate from treasury',
        category: 'special',
        effect: { type: 'feature_unlock', value: 'vault' }
    }
};

// ==========================================
// CORE FUNCTIONS
// ==========================================

/**
 * Calculate level from experience points
 * @param {number} xp - Current experience points
 * @returns {number} Current level (1-20)
 */
function calculateLevel(xp) {
    for (let level = MAX_LEVEL; level >= 1; level--) {
        if (xp >= LEVEL_XP_REQUIREMENTS[level - 1]) {
            return level;
        }
    }
    return 1;
}

/**
 * Get XP required for next level
 * @param {number} currentLevel - Current guild level
 * @returns {number|null} XP needed for next level, or null if max level
 */
function getXPForNextLevel(currentLevel) {
    if (currentLevel >= MAX_LEVEL) return null;
    return LEVEL_XP_REQUIREMENTS[currentLevel];
}

/**
 * Get XP progress toward next level
 * @param {number} currentXP - Current experience points
 * @param {number} currentLevel - Current guild level
 * @returns {object} Progress information
 */
function getLevelProgress(currentXP, currentLevel) {
    if (currentLevel >= MAX_LEVEL) {
        return {
            current: currentXP,
            required: 0,
            percentage: 100,
            isMaxLevel: true
        };
    }

    const currentLevelXP = LEVEL_XP_REQUIREMENTS[currentLevel - 1];
    const nextLevelXP = LEVEL_XP_REQUIREMENTS[currentLevel];
    const xpIntoLevel = currentXP - currentLevelXP;
    const xpNeeded = nextLevelXP - currentLevelXP;
    const percentage = Math.floor((xpIntoLevel / xpNeeded) * 100);

    return {
        current: xpIntoLevel,
        required: xpNeeded,
        percentage,
        isMaxLevel: false
    };
}

/**
 * Get all active perks for a given level
 * @param {number} level - Guild level
 * @returns {Array} Array of active perk objects
 */
function getActivePerks(level) {
    const activePerks = [];

    for (const [key, perk] of Object.entries(PERKS)) {
        if (perk.level <= level) {
            activePerks.push({
                key,
                ...perk
            });
        }
    }

    return activePerks;
}

/**
 * Get perks unlocked at a specific level
 * @param {number} level - Guild level
 * @returns {Array} Array of perks unlocked at this level
 */
function getPerksAtLevel(level) {
    const perks = [];

    for (const [key, perk] of Object.entries(PERKS)) {
        if (perk.level === level) {
            perks.push({
                key,
                ...perk
            });
        }
    }

    return perks;
}

/**
 * Calculate the effect of a specific perk type
 * @param {number} level - Guild level
 * @param {string} perkType - Type of perk effect to calculate
 * @returns {number} Cumulative effect value
 */
function getPerkValue(level, perkType) {
    const activePerks = getActivePerks(level);
    let value = 0;
    let hasEliteMultiplier = false;

    // Check if elite multiplier is active
    const elitePerk = activePerks.find(p => p.effect.type === 'elite_multiplier');
    if (elitePerk) {
        hasEliteMultiplier = true;
    }

    // Find the highest value for this perk type (newer perks override older ones)
    for (const perk of activePerks) {
        if (perk.effect.type === perkType) {
            value = Math.max(value, perk.effect.value);
        }
    }

    // Apply elite multiplier to percentage-based bonuses
    if (hasEliteMultiplier && value > 0 && value < 1 && perkType !== 'elite_multiplier') {
        value *= elitePerk.effect.value;
    }

    return value;
}

/**
 * Check if a feature is unlocked
 * @param {number} level - Guild level
 * @param {string} featureName - Name of feature to check
 * @returns {boolean} True if feature is unlocked
 */
function hasFeatureUnlocked(level, featureName) {
    const activePerks = getActivePerks(level);
    return activePerks.some(p =>
        p.effect.type === 'feature_unlock' && p.effect.value === featureName
    );
}

/**
 * Apply guild level bonuses to a game winning
 * @param {number} winnings - Original winnings amount
 * @param {number} guildLevel - Guild level
 * @returns {number} Modified winnings with bonuses applied
 */
function applyWinningsBonus(winnings, guildLevel) {
    const bonus = getPerkValue(guildLevel, 'game_winnings');
    return Math.floor(winnings * (1 + bonus));
}

/**
 * Get the maximum members for a guild level
 * @param {number} level - Guild level
 * @returns {number} Maximum number of members
 */
function getMaxMembers(level) {
    const maxMembersPerk = getPerkValue(level, 'max_members');
    return maxMembersPerk > 0 ? maxMembersPerk : 10; // Default 10
}

/**
 * Create a progress bar for level progress
 * @param {number} percentage - Progress percentage (0-100)
 * @param {number} length - Length of progress bar
 * @returns {string} Visual progress bar
 */
function createProgressBar(percentage, length = 20) {
    const filled = Math.floor((percentage / 100) * length);
    const empty = length - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Format XP number with commas
 * @param {number} xp - Experience points
 * @returns {string} Formatted XP string
 */
function formatXP(xp) {
    return xp.toLocaleString();
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
    // Constants
    LEVEL_XP_REQUIREMENTS,
    MAX_LEVEL,
    PERKS,

    // Level Calculation
    calculateLevel,
    getXPForNextLevel,
    getLevelProgress,

    // Perk Management
    getActivePerks,
    getPerksAtLevel,
    getPerkValue,
    hasFeatureUnlocked,

    // Bonus Application
    applyWinningsBonus,
    getMaxMembers,

    // Utilities
    createProgressBar,
    formatXP
};
