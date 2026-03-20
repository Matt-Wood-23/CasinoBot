// Casino Bot Configuration
// Copy this file to config.js and fill in your values.
// All sensitive values are loaded from .env — see .env.example

require('dotenv').config();

// Discord Bot Configuration
const token = process.env.DISCORD_TOKEN;

// Channel and User Configuration
const ALLOWED_CHANNEL_IDS = process.env.ALLOWED_CHANNEL_IDS
  ? process.env.ALLOWED_CHANNEL_IDS.split(',').map(id => id.trim())
  : [];
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;
const liam = process.env.LIAM_USER_ID; // Optional: a trusted secondary user ID

// Validation
if (!token) {
  console.error('ERROR: DISCORD_TOKEN is not set in .env file');
  process.exit(1);
}

// ─────────────────────────────────────────────
// Game Constants — tweak these to adjust game balance
// ─────────────────────────────────────────────

const GAME_CONSTANTS = {
    // Cooldowns (milliseconds) — prevent spamming
    COOLDOWN_BLACKJACK: 5000,
    COOLDOWN_SLOTS: 3000,
    COOLDOWN_CRASH: 5000,
    COOLDOWN_ROULETTE: 3000,
    COOLDOWN_HILO: 3000,
    COOLDOWN_COINFLIP: 3000,
    COOLDOWN_WAR: 3000,
    COOLDOWN_CRAPS: 3000,
    COOLDOWN_HORSERACE: 3000,
    COOLDOWN_PLINKO: 3000,
    COOLDOWN_POKER: 3000,
    COOLDOWN_LOTTERY: 5000,
    COOLDOWN_WORK: 4 * 60 * 60 * 1000,    // 4 hours
    COOLDOWN_DAILY: 24 * 60 * 60 * 1000,  // 24 hours
    COOLDOWN_WELFARE: 12 * 60 * 60 * 1000, // 12 hours

    // Lottery
    LOTTERY_TICKET_PRICE: 100,
    LOTTERY_DRAW_DELAY_MS: 30 * 60 * 1000, // 30 minutes
    LOTTERY_MAX_TICKETS_PER_BUY: 10,
    LOTTERY_NUMBERS_COUNT: 5,
    LOTTERY_NUMBER_MAX: 50,

    // Jackpot
    JACKPOT_CONTRIBUTION_RATE: 0.005, // 0.5% of every bet goes to jackpot pool
    JACKPOT_WIN_CHANCE: 0.0005,       // 0.05% chance to win jackpot per game

    // Loans
    LOAN_BASE_INTEREST_RATE: 10,       // 10% interest
    LOAN_OVERDUE_INTEREST_PER_DAY: 5,  // 5% of principal charged per day overdue
    LOAN_OVERDUE_INTEREST_CAP_DAYS: 30,// Stop charging interest after 30 days
    LOAN_OVERDUE_CREDIT_HIT_PER_DAY: 5,
    LOAN_LATE_LOCK_DAYS: 3,            // Days overdue before user is locked out
    LOAN_BANKRUPTCY_CREDIT_PENALTY: 200,

    // Guild system
    GUILD_CREATION_COST: 25000,
    GUILD_LEVEL_XP_BASE: 1000,

    // Heist
    HEIST_ENTRY_COST: 10000,
    HEIST_SUCCESS_CHANCE: 0.30,        // 30% base success rate
    HEIST_BAN_DURATION_MS: 8 * 60 * 60 * 1000, // 8 hours ban on failure
    HEIST_COOLDOWN_MS: 24 * 60 * 60 * 1000,    // 24 hours between heists
};

module.exports = {
  token,
  ALLOWED_CHANNEL_IDS,
  ADMIN_USER_ID,
  liam,
  GAME_CONSTANTS
};
