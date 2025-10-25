const {
    getGuildByName,
    getUserGuildDB,
    createGuildDB,
    joinGuildDB,
    leaveGuildDB,
    donateToGuildTreasury,
    getGuildMembers,
    getGuildLeaderboardsDB,
    getUserMoney,
    setUserMoney
} = require('./data');

// Create a guild
async function createGuild(userId, guildName) {
    // Validate guild name
    if (!guildName || guildName.length < 3 || guildName.length > 32) {
        return {
            success: false,
            message: 'Guild name must be between 3 and 32 characters!'
        };
    }

    // Check money
    const currentMoney = await getUserMoney(userId);
    const creationCost = 25000;

    if (currentMoney < creationCost) {
        return {
            success: false,
            message: `You need $${creationCost.toLocaleString()} to create a guild! You have $${currentMoney.toLocaleString()}`
        };
    }

    // Deduct money
    await setUserMoney(userId, currentMoney - creationCost);

    // Create guild in database
    return await createGuildDB(userId, guildName);
}

// Join a guild
async function joinGuild(userId, guildName) {
    return await joinGuildDB(userId, guildName);
}

// Leave a guild
async function leaveGuild(userId) {
    return await leaveGuildDB(userId);
}

// Donate to guild treasury
async function donateToGuild(userId, amount) {
    // Check user has enough money
    const currentMoney = await getUserMoney(userId);

    if (currentMoney < amount) {
        return {
            success: false,
            message: `You don't have enough money! You have $${currentMoney.toLocaleString()}`
        };
    }

    // Deduct money from user
    await setUserMoney(userId, currentMoney - amount);

    // Add to guild treasury
    return await donateToGuildTreasury(userId, amount);
}

// Get guild info
async function getGuildInfo(guildName) {
    const guild = await getGuildByName(guildName);
    if (!guild) return null;

    const members = await getGuildMembers(guildName);

    return {
        ...guild,
        members
    };
}

// Get user's guild
async function getUserGuild(userId) {
    return await getUserGuildDB(userId);
}

// Load guilds (for compatibility - no longer needed with database)
async function loadGuilds() {
    console.log('loadGuilds() called - guilds now stored in database');
    return {};
}

// Get guild leaderboards
async function getGuildLeaderboards() {
    return await getGuildLeaderboardsDB();
}

module.exports = {
    createGuild,
    joinGuild,
    leaveGuild,
    donateToGuild,
    getGuildInfo,
    getUserGuild,
    loadGuilds,
    getGuildLeaderboards
};
