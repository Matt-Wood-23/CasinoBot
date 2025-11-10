// Guild XP Award System - Central module for awarding guild experience
// Call these functions from games, commands, and events to award XP

const {
    addGuildExperience,
    updateGuildLevel,
    getGuildWithLevel,
    addContributionPoints
} = require('../database/queries');
const { calculateLevel } = require('./guildLevels');
const { getUserGuild } = require('./guilds');
const {
    trackGameWin,
    trackWager,
    trackDonation,
    trackHeist,
    trackDaily,
    trackWork,
    trackPersonalChallenge,
    checkAndResetChallenges
} = require('./guildChallenges');
const { applyXPBoost } = require('./guildShopEffects');

// ==========================================
// CONTRIBUTION POINT RATES
// ==========================================

const CONTRIBUTION_RATES = {
    GAME_PLAYED: 1,              // 1 point per game
    MONEY_WAGERED_PER_500: 1,    // 1 point per $500 wagered
    DONATION_PER_10000: 5,       // 5 points per $10,000 donated
    HEIST_SUCCESS: 25,           // 25 points for successful heist
    HEIST_FAILURE: 10,           // 10 points for failed heist
    WEEKLY_CHALLENGE: 50         // 50 points per weekly challenge
};

// ==========================================
// XP AWARD RATES
// ==========================================

const XP_RATES = {
    GAME_PLAYED: 5,              // 5 XP per game completed
    MONEY_WAGERED_PER_100: 1,    // 1 XP per $100 wagered
    DAILY_CHALLENGE: 50,          // 50 XP when member completes daily challenge
    WEEKLY_CHALLENGE: 200,        // 200 XP when member completes weekly challenge
    HEIST_SUCCESS: 500,           // 500 XP for successful guild heist
    HEIST_FAILURE: 100,           // 100 XP for failed guild heist (participation)
    DONATION_PER_1000: 1          // 1 XP per $1,000 donated to treasury
};

// ==========================================
// CORE FUNCTIONS
// ==========================================

/**
 * Award XP to a guild and check for level-ups
 * @param {string} guildId - Guild's unique ID
 * @param {string} userId - User who triggered the XP gain
 * @param {number} amount - Amount of XP to award
 * @param {string} source - Source of XP (for logging)
 * @param {string} details - Additional details
 * @returns {Promise<object>} Result with level-up info
 */
async function awardGuildXP(guildId, userId, amount, source, details = null) {
    if (!guildId || amount <= 0) return { success: false };

    // Add XP to database
    const xpResult = await addGuildExperience(guildId, userId, amount, source, details);

    if (!xpResult.success) return xpResult;

    // Check if level-up occurred
    const oldLevel = calculateLevel(xpResult.oldExp);
    const newLevel = calculateLevel(xpResult.newExp);

    if (newLevel > oldLevel) {
        // Update level in database
        await updateGuildLevel(guildId, newLevel);

        return {
            success: true,
            xpGained: amount,
            levelUp: true,
            oldLevel,
            newLevel,
            oldExp: xpResult.oldExp,
            newExp: xpResult.newExp
        };
    }

    return {
        success: true,
        xpGained: amount,
        levelUp: false,
        level: oldLevel,
        oldExp: xpResult.oldExp,
        newExp: xpResult.newExp
    };
}

// ==========================================
// SPECIFIC XP AWARD FUNCTIONS
// ==========================================

/**
 * Award XP for completing a game and track challenges
 * @param {string} userId - User ID
 * @param {string} gameName - Name of the game
 * @param {boolean} won - Whether the user won
 * @returns {Promise<object>} Result object
 */
async function awardGameXP(userId, gameName, won = false) {
    const userGuild = await getUserGuild(userId);

    if (!userGuild) return { success: false, message: 'Not in guild' };

    // Apply XP boost from shop items
    const boostedXP = await applyXPBoost(userId, XP_RATES.GAME_PLAYED);

    // Award XP for game played
    const result = await awardGuildXP(
        userGuild.guildId,
        userId,
        boostedXP,
        'game_played',
        gameName
    );

    // Award contribution points
    await addContributionPoints(
        userGuild.guildId,
        userId,
        CONTRIBUTION_RATES.GAME_PLAYED,
        'game_played',
        { game: gameName }
    );

    // Track game wins for challenges
    if (won) {
        await trackGameWin(userGuild.guildId, userId, gameName);
    }

    return result;
}

/**
 * Award XP for money wagered and track challenges
 * @param {string} userId - User ID
 * @param {number} amount - Amount wagered
 * @param {string} gameName - Name of the game
 * @returns {Promise<object>} Result object
 */
async function awardWagerXP(userId, amount, gameName = 'unknown') {
    const userGuild = await getUserGuild(userId);

    if (!userGuild || amount <= 0) return { success: false };

    // Calculate XP (1 XP per $100 wagered)
    const xpAmount = Math.floor(amount / 100) * XP_RATES.MONEY_WAGERED_PER_100;

    if (xpAmount === 0) return { success: false, message: 'Wager too small' };

    // Apply XP boost from shop items
    const boostedXP = await applyXPBoost(userId, xpAmount);

    const result = await awardGuildXP(
        userGuild.guildId,
        userId,
        boostedXP,
        'money_wagered',
        `$${amount} on ${gameName}`
    );

    // Award contribution points (1 point per $500 wagered)
    const contributionPoints = Math.floor(amount / 500) * CONTRIBUTION_RATES.MONEY_WAGERED_PER_500;
    if (contributionPoints > 0) {
        await addContributionPoints(
            userGuild.guildId,
            userId,
            contributionPoints,
            'money_wagered',
            { amount, game: gameName }
        );
    }

    // Track wager for challenges
    await trackWager(userGuild.guildId, userId, amount);

    return result;
}

/**
 * Award XP for heist completion and track challenges
 * @param {string} userId - User ID
 * @param {boolean} success - Whether the heist was successful
 * @returns {Promise<object>} Result object
 */
async function awardHeistXP(userId, success) {
    const userGuild = await getUserGuild(userId);

    if (!userGuild) return { success: false, message: 'Not in guild' };

    const xpAmount = success ? XP_RATES.HEIST_SUCCESS : XP_RATES.HEIST_FAILURE;

    const result = await awardGuildXP(
        userGuild.guildId,
        userId,
        xpAmount,
        success ? 'heist_success' : 'heist_failure',
        `Guild heist ${success ? 'succeeded' : 'failed'}`
    );

    // Award contribution points
    const contributionPoints = success ? CONTRIBUTION_RATES.HEIST_SUCCESS : CONTRIBUTION_RATES.HEIST_FAILURE;
    await addContributionPoints(
        userGuild.guildId,
        userId,
        contributionPoints,
        success ? 'heist_success' : 'heist_failure',
        { success }
    );

    // Track heist for challenges
    await trackHeist(userGuild.guildId, userId);

    return result;
}

/**
 * Award XP for guild donation and track challenges
 * @param {string} userId - User ID
 * @param {number} amount - Amount donated
 * @returns {Promise<object>} Result object
 */
async function awardDonationXP(userId, amount) {
    const userGuild = await getUserGuild(userId);

    if (!userGuild || amount <= 0) return { success: false };

    // Calculate XP (1 XP per $1,000 donated)
    const xpAmount = Math.floor(amount / 1000) * XP_RATES.DONATION_PER_1000;

    if (xpAmount === 0) return { success: false, message: 'Donation too small' };

    const result = await awardGuildXP(
        userGuild.guildId,
        userId,
        xpAmount,
        'guild_donation',
        `Donated $${amount}`
    );

    // Award contribution points (5 points per $10,000 donated)
    const contributionPoints = Math.floor(amount / 10000) * CONTRIBUTION_RATES.DONATION_PER_10000;
    if (contributionPoints > 0) {
        await addContributionPoints(
            userGuild.guildId,
            userId,
            contributionPoints,
            'guild_donation',
            { amount }
        );
    }

    // Track donation for challenges
    await trackDonation(userGuild.guildId, userId, amount);

    return result;
}

/**
 * Award XP for daily bonus and track challenges
 * @param {string} userId - User ID
 * @returns {Promise<object>} Result object
 */
async function awardDailyXP(userId) {
    const userGuild = await getUserGuild(userId);

    if (!userGuild) return { success: false, message: 'Not in guild' };

    const result = await awardGuildXP(
        userGuild.guildId,
        userId,
        XP_RATES.DAILY_CHALLENGE,
        'daily_bonus',
        'Claimed daily bonus'
    );

    // Track daily for challenges
    await trackDaily(userGuild.guildId, userId);

    return result;
}

/**
 * Award XP for work completion and track challenges
 * @param {string} userId - User ID
 * @returns {Promise<object>} Result object
 */
async function awardWorkXP(userId) {
    const userGuild = await getUserGuild(userId);

    if (!userGuild) return { success: false, message: 'Not in guild' };

    // Award small amount of XP for work (2 XP)
    const result = await awardGuildXP(
        userGuild.guildId,
        userId,
        2,
        'work_completed',
        'Completed work shift'
    );

    // Track work for challenges
    await trackWork(userGuild.guildId, userId);

    return result;
}

/**
 * Award XP for personal challenge completion and track challenges
 * @param {string} userId - User ID
 * @param {string} challengeType - Type of challenge (daily/weekly)
 * @returns {Promise<object>} Result object
 */
async function awardPersonalChallengeXP(userId, challengeType) {
    const userGuild = await getUserGuild(userId);

    if (!userGuild) return { success: false, message: 'Not in guild' };

    const xpAmount = challengeType === 'weekly' ? XP_RATES.WEEKLY_CHALLENGE : XP_RATES.DAILY_CHALLENGE;

    const result = await awardGuildXP(
        userGuild.guildId,
        userId,
        xpAmount,
        'personal_challenge',
        `Completed ${challengeType} challenge`
    );

    // Track personal challenge for guild challenges
    await trackPersonalChallenge(userGuild.guildId, userId);

    return result;
}

/**
 * Check if a guild's weekly challenges need to be reset
 * @param {string} userId - User ID (to get their guild)
 * @returns {Promise<boolean>} True if challenges were reset
 */
async function checkGuildChallengesReset(userId) {
    const userGuild = await getUserGuild(userId);

    if (!userGuild) return false;

    return await checkAndResetChallenges(userGuild.guildId);
}

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Get formatted XP gain message
 * @param {object} result - Result from awardGuildXP
 * @param {string} guildName - Name of the guild
 * @returns {string} Formatted message
 */
function getXPGainMessage(result, guildName) {
    if (!result.success) return '';

    let message = `Guild XP: +${result.xpGained}`;

    if (result.levelUp) {
        message += ` | ${guildName} leveled up to **Level ${result.newLevel}**!`;
    }

    return message;
}

/**
 * Create a small embed for level-up notification
 * @param {string} guildName - Name of the guild
 * @param {number} newLevel - New level achieved
 * @param {Array} newPerks - Array of perks unlocked
 * @returns {object} Embed object
 */
function createLevelUpEmbed(guildName, newLevel, newPerks = []) {
    const { EmbedBuilder } = require('discord.js');

    const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle(`🎉 ${guildName} Leveled Up!`)
        .setDescription(`Your guild has reached **Level ${newLevel}**!`)
        .setTimestamp();

    if (newPerks.length > 0) {
        const perksText = newPerks.map(p => `• **${p.name}**: ${p.description}`).join('\n');
        embed.addFields({
            name: '🎁 New Perks Unlocked',
            value: perksText,
            inline: false
        });
    }

    embed.setFooter({ text: 'Use /guild perks to see all active perks' });

    return embed;
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
    // Constants
    XP_RATES,

    // Core Functions
    awardGuildXP,

    // Specific Award Functions
    awardGameXP,
    awardWagerXP,
    awardHeistXP,
    awardDonationXP,
    awardDailyXP,
    awardWorkXP,
    awardPersonalChallengeXP,

    // Challenge Management
    checkGuildChallengesReset,

    // Helper Functions
    getXPGainMessage,
    createLevelUpEmbed
};
