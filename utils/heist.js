const { getUserData, saveUserData, getUserMoney, setUserMoney } = require('./data');

const HEIST_COST = 10000;
const HEIST_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours (always, regardless of success)
const GAMBLING_BAN_DURATION = 8 * 60 * 60 * 1000; // 8 hours (on failure)
const SUCCESS_RATE = 0.30; // 30% chance
const FAILURE_DEBT = 5000;
const MIN_MULTIPLIER = 3;
const MAX_MULTIPLIER = 10;

// Initialize heist data for a user
function initializeHeist(userId) {
    const userData = getUserData(userId);
    if (!userData) return null;

    if (!userData.heist) {
        userData.heist = {
            lastHeist: 0,
            cooldownUntil: 0,
            gamblingBanUntil: 0,
            totalHeists: 0,
            successfulHeists: 0,
            totalEarned: 0,
            totalLost: 0,
            biggestScore: 0
        };
    }

    return userData.heist;
}

// Check if user is banned from gambling (after failed heist)
function isGamblingBanned(userId) {
    const heistData = initializeHeist(userId);
    if (!heistData) return { isBanned: false };

    const now = Date.now();

    if (now < heistData.gamblingBanUntil) {
        const timeLeft = heistData.gamblingBanUntil - now;
        const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
        const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

        return {
            isBanned: true,
            reason: `🚫 You're banned from gambling after your failed heist!\nTime remaining: ${hoursLeft}h ${minutesLeft}m\n\nUse this time to reflect on your choices.`
        };
    }

    return { isBanned: false };
}

// Check if user can attempt heist
function canAttemptHeist(userId) {
    const heistData = initializeHeist(userId);
    if (!heistData) {
        return { canAttempt: false, reason: 'User data not found!' };
    }

    const now = Date.now();

    if (now < heistData.cooldownUntil) {
        const timeLeft = heistData.cooldownUntil - now;
        const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
        const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

        return {
            canAttempt: false,
            reason: `⏰ Daily heist limit reached!\nNext heist available in: ${hoursLeft}h ${minutesLeft}m`
        };
    }

    return { canAttempt: true };
}

// Attempt a heist
async function attemptHeist(userId) {
    const heistData = initializeHeist(userId);
    if (!heistData) {
        return { success: false, message: 'User data not found!' };
    }

    const canAttempt = canAttemptHeist(userId);
    if (!canAttempt.canAttempt) {
        return { success: false, message: canAttempt.reason };
    }

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

    const now = Date.now();
    heistData.lastHeist = now;
    heistData.totalHeists++;

    // Set 24-hour cooldown regardless of success or failure
    heistData.cooldownUntil = now + HEIST_COOLDOWN;

    if (isSuccess) {
        // Success - give 3x to 10x return
        const multiplier = Math.random() * (MAX_MULTIPLIER - MIN_MULTIPLIER) + MIN_MULTIPLIER;
        const winnings = Math.floor(HEIST_COST * multiplier);

        await setUserMoney(userId, currentMoney - HEIST_COST + winnings);

        heistData.successfulHeists++;
        heistData.totalEarned += winnings;

        if (winnings > heistData.biggestScore) {
            heistData.biggestScore = winnings;
        }

        await saveUserData();

        return {
            success: true,
            heistSuccess: true,
            multiplier: multiplier.toFixed(2),
            winnings,
            netProfit: winnings - HEIST_COST
        };
    } else {
        // Failure - lose entry fee + $5k debt + 8hr gambling ban
        heistData.gamblingBanUntil = now + GAMBLING_BAN_DURATION;
        heistData.totalLost += HEIST_COST + FAILURE_DEBT;

        // Add debt
        const userData = getUserData(userId);
        if (!userData.heistDebt) {
            userData.heistDebt = 0;
        }
        userData.heistDebt += FAILURE_DEBT;

        await saveUserData();

        return {
            success: true,
            heistSuccess: false,
            debtAdded: FAILURE_DEBT,
            totalLoss: HEIST_COST + FAILURE_DEBT,
            gamblingBanHours: 8
        };
    }
}

// Get heist stats
function getHeistStats(userId) {
    const heistData = initializeHeist(userId);
    if (!heistData) return null;

    const successRate = heistData.totalHeists > 0
        ? ((heistData.successfulHeists / heistData.totalHeists) * 100).toFixed(1)
        : '0.0';

    return {
        ...heistData,
        successRate
    };
}

// Pay off heist debt
async function payHeistDebt(userId, amount) {
    const userData = getUserData(userId);
    if (!userData) {
        return { success: false, message: 'User data not found!' };
    }

    if (!userData.heistDebt || userData.heistDebt === 0) {
        return {
            success: false,
            message: 'You don\'t have any heist debt!'
        };
    }

    const currentMoney = await getUserMoney(userId);

    if (currentMoney < amount) {
        return {
            success: false,
            message: `You don't have enough money! You have $${currentMoney.toLocaleString()}`
        };
    }

    const payment = Math.min(amount, userData.heistDebt);

    await setUserMoney(userId, currentMoney - payment);
    userData.heistDebt -= payment;

    await saveUserData();

    return {
        success: true,
        payment,
        remainingDebt: userData.heistDebt
    };
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

// Active guild heists (in-memory)
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
function startGuildHeist(guildId, initiatorId) {
    const { getUserGuild } = require('./guilds');
    const guild = getUserGuild(initiatorId);

    if (!guild) {
        return { success: false, message: 'You\'re not in a guild!' };
    }

    if (guild.id !== guildId) {
        return { success: false, message: 'You can only start heists for your own guild!' };
    }

    // Check if guild has cooldown
    const userData = getUserData(initiatorId);
    if (!userData.guild.guildHeistData) {
        userData.guild.guildHeistData = {
            lastHeist: 0,
            cooldownUntil: 0,
            totalHeists: 0,
            successfulHeists: 0
        };
    }

    const now = Date.now();
    if (now < userData.guild.guildHeistData.cooldownUntil) {
        const timeLeft = userData.guild.guildHeistData.cooldownUntil - now;
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

    // Create heist session
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
}

// Join a guild heist
async function joinGuildHeist(guildId, userId) {
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
        return { success: false, message: 'You\'ve already joined this heist!' };
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
    const banCheck = isGamblingBanned(userId);
    if (banCheck.isBanned) {
        return { success: false, message: banCheck.reason };
    }

    // Add to participants
    heist.participants.push(userId);

    return {
        success: true,
        participantCount: heist.participants.length
    };
}

// Execute a guild heist
async function executeGuildHeist(guildId) {
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

    // Update guild heist data for all members
    for (const userId of heist.participants) {
        const userData = getUserData(userId);
        if (userData && userData.guild) {
            if (!userData.guild.guildHeistData) {
                userData.guild.guildHeistData = {
                    lastHeist: 0,
                    cooldownUntil: 0,
                    totalHeists: 0,
                    successfulHeists: 0
                };
            }
            userData.guild.guildHeistData.lastHeist = now;
            userData.guild.guildHeistData.cooldownUntil = now + GUILD_HEIST_COOLDOWN;
            userData.guild.guildHeistData.totalHeists++;

            if (isSuccess) {
                userData.guild.guildHeistData.successfulHeists++;
            }
        }
    }

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

        await saveUserData();
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
            const userData = getUserData(userId);
            const heistData = initializeHeist(userId);

            // Add gambling ban
            heistData.gamblingBanUntil = now + GAMBLING_BAN_DURATION;

            // Add fine as debt
            if (!userData.heistDebt) {
                userData.heistDebt = 0;
            }
            userData.heistDebt += finePerPerson;
        }

        await saveUserData();
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
    initializeHeist,
    isGamblingBanned,
    canAttemptHeist,
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
