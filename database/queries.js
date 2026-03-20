// ============================================================================
// MAIN DATABASE QUERIES MODULE
// This file imports and re-exports all query functions from organized modules
// ============================================================================

// Import all modules
const users = require('./queries/users');
const games = require('./queries/games');
const economy = require('./queries/economy');
const shop = require('./queries/shop');
const vip = require('./queries/vip');
const achievements = require('./queries/achievements');
const challenges = require('./queries/challenges');
const guilds = require('./queries/guilds');
const heists = require('./queries/heists');
const streaks = require('./queries/streaks');

// Re-export everything for backward compatibility
module.exports = {
    // ========== USER FUNCTIONS (users.js) ==========
    ...users,

    // ========== GAME FUNCTIONS (games.js) ==========
    ...games,

    // ========== ECONOMY FUNCTIONS (economy.js) ==========
    ...economy,

    // ========== SHOP FUNCTIONS (shop.js) ==========
    ...shop,

    // ========== VIP FUNCTIONS (vip.js) ==========
    ...vip,

    // ========== ACHIEVEMENTS FUNCTIONS (achievements.js) ==========
    ...achievements,

    // ========== CHALLENGES FUNCTIONS (challenges.js) ==========
    ...challenges,

    // ========== GUILD FUNCTIONS (guilds.js) ==========
    ...guilds,

    // ========== HEIST FUNCTIONS (heists.js) ==========
    ...heists,

    // ========== STREAK FUNCTIONS (streaks.js) ==========
    ...streaks
};
