const { getUserMoney, setUserMoney } = require('./data');
const {
    getUserHeistStats,
    updateHeistCooldown,
    recordHeistAttempt,
    getHeistDebt,
    addHeistDebt,
    payHeistDebt: payHeistDebtDB,
    getGuildHeistStats,
    updateGuildHeistCooldown,
    recordGuildHeistAttempt,
    setGamblingBan,
    isGamblingBanned
} = require('../database/queries');

const HEIST_COST = 10000;
const HEIST_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours (always, regardless of success)
const GAMBLING_BAN_DURATION = 8 * 60 * 60 * 1000; // 8 hours (on failure)
const SUCCESS_RATE = 0.30; // 30% chance
const FAILURE_DEBT = 5000;
const MIN_MULTIPLIER = 3;
const MAX_MULTIPLIER = 10;

// Attempt a heist
async function attemptHeist(userId) {
    try {
        // Get heist stats from database
        const heistStats = await getUserHeistStats(userId);
        if (!heistStats) {
            return { success: false, message: 'User data not found!' };
        }

        const now = Date.now();

        // Check cooldown
        if (now < heistStats.cooldownUntil) {
            const timeLeft = heistStats.cooldownUntil - now;
            const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
            const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

            return {
                success: false,
                message: `⏰ Daily heist limit reached!\nNext heist available in: ${hoursLeft}h ${minutesLeft}m`
            };
        }

        // Check if user can afford
        const currentMoney = await getUserMoney(userId);
        if (currentMoney < HEIST_COST) {
            return {
                success: false,
                message: `You need $${HEIST_COST.toLocaleString()} to attempt a heist! You have $${currentMoney.toLocaleString()}`
            };
        }

        // Deduct heist cost
        await setUserMoney(userId, currentMoney - HEIST_COST);

        // Determine success/failure (30% chance)
        const roll = Math.random();
        const isSuccess = roll < SUCCESS_RATE;

        // Set 24-hour cooldown regardless of success or failure
        await updateHeistCooldown(userId, now + HEIST_COOLDOWN);

        if (isSuccess) {
            // Success - give 3x to 10x return
            const multiplier = Math.random() * (MAX_MULTIPLIER - MIN_MULTIPLIER) + MIN_MULTIPLIER;
            const winnings = Math.floor(HEIST_COST * multiplier);

            // Update user's money
            await setUserMoney(userId, currentMoney - HEIST_COST + winnings);

            // Record successful heist in database
            await recordHeistAttempt(userId, true, winnings);

            return {
                success: true,
                heistSuccess: true,
                multiplier: multiplier.toFixed(2),
                winnings,
                netProfit: winnings - HEIST_COST
            };
        } else {
            // Failure - lose entry fee + $5k debt + 8hr gambling ban
            const totalLoss = HEIST_COST + FAILURE_DEBT;

            // Add gambling ban
            await setGamblingBan(userId, now + GAMBLING_BAN_DURATION);

            // Add heist debt
            await addHeistDebt(userId, FAILURE_DEBT);

            // Record failed heist in database
            await recordHeistAttempt(userId, false, totalLoss);

            return {
                success: true,
                heistSuccess: false,
                debtAdded: FAILURE_DEBT,
                totalLoss,
                gamblingBanHours: 8
            };
        }
    } catch (error) {
        console.error('Error in attemptHeist:', error);
        return { success: false, message: 'An error occurred during the heist!' };
    }
}

// Get heist stats
async function getHeistStats(userId) {
    try {
        const heistStats = await getUserHeistStats(userId);
        if (!heistStats) return null;

        const successRate = heistStats.totalHeists > 0
            ? ((heistStats.successfulHeists / heistStats.totalHeists) * 100).toFixed(1)
            : '0.0';

        return {
            ...heistStats,
            successRate
        };
    } catch (error) {
        console.error('Error in getHeistStats:', error);
        return null;
    }
}

// Pay off heist debt
async function payHeistDebt(userId, amount) {
    try {
        // Get current debt
        const currentDebt = await getHeistDebt(userId);

        if (currentDebt === 0) {
            return {
                success: false,
                message: "You don't have any heist debt!"
            };
        }

        // Check if user can afford
        const currentMoney = await getUserMoney(userId);
        if (currentMoney < amount) {
            return {
                success: false,
                message: `You don't have enough money! You have $${currentMoney.toLocaleString()}`
            };
        }

        const payment = Math.min(amount, currentDebt);

        // Deduct money from user
        await setUserMoney(userId, currentMoney - payment);

        // Pay debt in database
        const result = await payHeistDebtDB(userId, payment);

        return result;
    } catch (error) {
        console.error('Error in payHeistDebt:', error);
        return { success: false, message: 'An error occurred while paying debt!' };
    }
}

// Guild heist constants
const GUILD_HEIST_COST_PER_PERSON = 10000;
const GUILD_HEIST_MIN_MEMBERS = 3;
const GUILD_HEIST_BASE_SUCCESS = 0.30; // 30% base
const GUILD_HEIST_MEMBER_BONUS = 0.04; // +4% per member
const GUILD_HEIST_MIN_MULTIPLIER = 5;
const GUILD_HEIST_MAX_MULTIPLIER = 15;
const GUILD_HEIST_FAILURE_FINE = 20000; // Split among participants
const GUILD_HEIST_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours

// Active guild heists (in-memory - sessions lost on restart is acceptable)
let activeGuildHeists = {};

// Clean up expired guild heists
function cleanupExpiredGuildHeists() {
    const now = Date.now();
    for (const [guildId, heist] of Object.entries(activeGuildHeists)) {
        if (now > heist.expiresAt) {
            console.log(`Cleaning up expired guild heist for guild ${guildId}`);
            delete activeGuildHeists[guildId];
        }
    }
}

// Start a guild heist
async function startGuildHeist(guildId, initiatorId) {
    try {
        const { getUserGuild } = require('./guilds');
        const guild = getUserGuild(initiatorId);

        if (!guild) {
            return { success: false, message: "You're not in a guild!" };
        }

        if (guild.id !== guildId) {
            return { success: false, message: 'You can only start heists for your own guild!' };
        }

        // Check if guild has cooldown (from database)
        const guildHeistStats = await getGuildHeistStats(guildId);
        if (!guildHeistStats) {
            return { success: false, message: 'Guild heist data not found!' };
        }

        const now = Date.now();
        if (now < guildHeistStats.cooldownUntil) {
            const timeLeft = guildHeistStats.cooldownUntil - now;
            const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
            const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

            return {
                success: false,
                message: `⏰ Guild heist cooldown active!\nNext heist available in: ${hoursLeft}h ${minutesLeft}m`
            };
        }

        // Clean up any expired heists first
        cleanupExpiredGuildHeists();

        // Check if already active
        if (activeGuildHeists[guildId]) {
            return { success: false, message: 'A guild heist is already in progress!' };
        }

        // Create heist session (in-memory)
        activeGuildHeists[guildId] = {
            guildId,
            guildName: guild.name,
            initiatorId,
            participants: [initiatorId],
            startTime: now,
            expiresAt: now + 60000 // 60 seconds to join
        };

        return {
            success: true,
            heist: activeGuildHeists[guildId]
        };
    } catch (error) {
        console.error('Error in startGuildHeist:', error);
        return { success: false, message: 'An error occurred while starting the guild heist!' };
    }
}

// Join a guild heist
async function joinGuildHeist(guildId, userId) {
    try {
        const heist = activeGuildHeists[guildId];

        if (!heist) {
            return { success: false, message: 'No active guild heist found!' };
        }

        const now = Date.now();
        if (now > heist.expiresAt) {
            delete activeGuildHeists[guildId];
            return { success: false, message: 'Guild heist signup has expired!' };
        }

        // Check if user is in the guild
        const { getUserGuild } = require('./guilds');
        const guild = getUserGuild(userId);

        if (!guild || guild.id !== guildId) {
            return { success: false, message: 'You must be in this guild to join the heist!' };
        }

        // Check if already joined
        if (heist.participants.includes(userId)) {
            return { success: false, message: "You've already joined this heist!" };
        }

        // Check if user can afford
        const currentMoney = await getUserMoney(userId);
        if (currentMoney < GUILD_HEIST_COST_PER_PERSON) {
            return {
                success: false,
                message: `You need $${GUILD_HEIST_COST_PER_PERSON.toLocaleString()} to join the heist!`
            };
        }

        // Check if user is gambling banned
        const isBanned = await isGamblingBanned(userId);
        if (isBanned) {
            return { success: false, message: "🚫 You're banned from gambling after a failed heist!" };
        }

        // Add to participants
        heist.participants.push(userId);

        return {
            success: true,
            participantCount: heist.participants.length
        };
    } catch (error) {
        console.error('Error in joinGuildHeist:', error);
        return { success: false, message: 'An error occurred while joining the guild heist!' };
    }
}

// Execute a guild heist
async function executeGuildHeist(guildId) {
    try {
        const heist = activeGuildHeists[guildId];

        if (!heist) {
            return { success: false, message: 'No active guild heist found!' };
        }

        if (heist.participants.length < GUILD_HEIST_MIN_MEMBERS) {
            delete activeGuildHeists[guildId];
            return {
                success: false,
                message: `Not enough participants! Minimum ${GUILD_HEIST_MIN_MEMBERS} members required.`
            };
        }

        const participantCount = heist.participants.length;

        // Deduct entry fees from all participants
        for (const userId of heist.participants) {
            const currentMoney = await getUserMoney(userId);
            await setUserMoney(userId, currentMoney - GUILD_HEIST_COST_PER_PERSON);
        }

        // Calculate success rate: 30% base + 4% per member
        const successRate = GUILD_HEIST_BASE_SUCCESS + (participantCount * GUILD_HEIST_MEMBER_BONUS);
        const roll = Math.random();
        const isSuccess = roll < successRate;

        const now = Date.now();

        // Update guild heist cooldown in database
        await updateGuildHeistCooldown(guildId, now + GUILD_HEIST_COOLDOWN);

        // Record guild heist attempt in database
        await recordGuildHeistAttempt(guildId, heist.participants, isSuccess);

        if (isSuccess) {
            // Success - distribute winnings
            const multiplier = Math.random() * (GUILD_HEIST_MAX_MULTIPLIER - GUILD_HEIST_MIN_MULTIPLIER) + GUILD_HEIST_MIN_MULTIPLIER;
            const totalPot = GUILD_HEIST_COST_PER_PERSON * participantCount;
            const totalWinnings = Math.floor(totalPot * multiplier);
            const winningsPerPerson = Math.floor(totalWinnings / participantCount);

            // Distribute winnings
            for (const userId of heist.participants) {
                const currentMoney = await getUserMoney(userId);
                await setUserMoney(userId, currentMoney + winningsPerPerson);
            }

            delete activeGuildHeists[guildId];

            return {
                success: true,
                heistSuccess: true,
                participantCount,
                successRate: (successRate * 100).toFixed(1),
                multiplier: multiplier.toFixed(2),
                totalWinnings,
                winningsPerPerson,
                netProfitPerPerson: winningsPerPerson - GUILD_HEIST_COST_PER_PERSON
            };
        } else {
            // Failure - add debt and gambling bans
            const finePerPerson = Math.floor(GUILD_HEIST_FAILURE_FINE / participantCount);

            for (const userId of heist.participants) {
                // Add gambling ban
                await setGamblingBan(userId, now + GAMBLING_BAN_DURATION);

                // Add fine as heist debt
                await addHeistDebt(userId, finePerPerson);
            }

            delete activeGuildHeists[guildId];

            return {
                success: true,
                heistSuccess: false,
                participantCount,
                successRate: (successRate * 100).toFixed(1),
                finePerPerson,
                totalLossPerPerson: GUILD_HEIST_COST_PER_PERSON + finePerPerson,
                gamblingBanHours: 8
            };
        }
    } catch (error) {
        console.error('Error in executeGuildHeist:', error);
        return { success: false, message: 'An error occurred during the guild heist!' };
    }
}

// Get active guild heist
function getActiveGuildHeist(guildId) {
    return activeGuildHeists[guildId] || null;
}

// Cancel a guild heist (admin/testing)
function cancelGuildHeist(guildId) {
    if (activeGuildHeists[guildId]) {
        delete activeGuildHeists[guildId];
        return { success: true, message: 'Guild heist cancelled.' };
    }
    return { success: false, message: 'No active guild heist found for this guild.' };
}

// Get all active guild heists (admin/debugging)
function getAllActiveGuildHeists() {
    return Object.values(activeGuildHeists);
}

module.exports = {
    HEIST_COST,
    HEIST_COOLDOWN,
    GAMBLING_BAN_DURATION,
    SUCCESS_RATE,
    GUILD_HEIST_COST_PER_PERSON,
    GUILD_HEIST_MIN_MEMBERS,
    attemptHeist,
    getHeistStats,
    payHeistDebt,
    startGuildHeist,
    joinGuildHeist,
    executeGuildHeist,
    getActiveGuildHeist,
    cancelGuildHeist,
    cleanupExpiredGuildHeists,
    getAllActiveGuildHeists
};
