const { getUserData, saveUserData, getAllUserData } = require('./data');

// Guild data storage (in-memory, will be persisted in user data)
let guilds = {};

// Load guilds from user data
function loadGuilds() {
    const allUsers = getAllUserData();
    guilds = {};

    // Reconstruct guilds from user data
    for (const [userId, userData] of Object.entries(allUsers)) {
        if (userData.guild) {
            const guildId = userData.guild.guildId;

            if (!guilds[guildId]) {
                guilds[guildId] = {
                    id: guildId,
                    name: userData.guild.guildName || 'Unknown Guild',
                    ownerId: userData.guild.isOwner ? userId : guilds[guildId]?.ownerId,
                    createdAt: userData.guild.joinedAt,
                    treasury: userData.guild.treasury || 0,
                    members: []
                };
            }

            guilds[guildId].members.push({
                userId,
                joinedAt: userData.guild.joinedAt,
                contributedTotal: userData.guild.contributedTotal || 0
            });

            if (userData.guild.isOwner) {
                guilds[guildId].ownerId = userId;
            }
        }
    }

    return guilds;
}

// Create a guild
async function createGuild(userId, guildName) {
    const userData = getUserData(userId);
    if (!userData) {
        return { success: false, message: 'User data not found!' };
    }

    if (userData.guild) {
        return {
            success: false,
            message: 'You\'re already in a guild! Leave your current guild first.'
        };
    }

    const { getUserMoney, setUserMoney } = require('./data');
    const currentMoney = await getUserMoney(userId);
    const creationCost = 25000;

    if (currentMoney < creationCost) {
        return {
            success: false,
            message: `You need $${creationCost.toLocaleString()} to create a guild! You have $${currentMoney.toLocaleString()}`
        };
    }

    // Validate guild name
    if (!guildName || guildName.length < 3 || guildName.length > 32) {
        return {
            success: false,
            message: 'Guild name must be between 3 and 32 characters!'
        };
    }

    // Check if guild name already exists
    loadGuilds();
    const existingGuild = Object.values(guilds).find(
        g => g.name.toLowerCase() === guildName.toLowerCase()
    );

    if (existingGuild) {
        return {
            success: false,
            message: 'A guild with that name already exists!'
        };
    }

    // Deduct money
    await setUserMoney(userId, currentMoney - creationCost);

    // Create guild
    const guildId = `guild_${Date.now()}_${userId}`;
    const now = Date.now();

    userData.guild = {
        guildId,
        guildName,
        isOwner: true,
        joinedAt: now,
        contributedTotal: 0,
        treasury: 0
    };

    guilds[guildId] = {
        id: guildId,
        name: guildName,
        ownerId: userId,
        createdAt: now,
        treasury: 0,
        members: [{
            userId,
            joinedAt: now,
            contributedTotal: 0
        }]
    };

    await saveUserData();

    return {
        success: true,
        guild: guilds[guildId]
    };
}

// Join a guild
async function joinGuild(userId, guildName) {
    const userData = getUserData(userId);
    if (!userData) {
        return { success: false, message: 'User data not found!' };
    }

    if (userData.guild) {
        return {
            success: false,
            message: 'You\'re already in a guild! Leave your current guild first.'
        };
    }

    loadGuilds();
    const guild = Object.values(guilds).find(
        g => g.name.toLowerCase() === guildName.toLowerCase()
    );

    if (!guild) {
        return {
            success: false,
            message: 'Guild not found! Check the guild name and try again.'
        };
    }

    if (guild.members.length >= 10) {
        return {
            success: false,
            message: 'This guild is full! (Maximum 10 members)'
        };
    }

    const now = Date.now();

    userData.guild = {
        guildId: guild.id,
        guildName: guild.name,
        isOwner: false,
        joinedAt: now,
        contributedTotal: 0,
        treasury: guild.treasury
    };

    guild.members.push({
        userId,
        joinedAt: now,
        contributedTotal: 0
    });

    await saveUserData();

    return {
        success: true,
        guild
    };
}

// Leave a guild
async function leaveGuild(userId) {
    const userData = getUserData(userId);
    if (!userData || !userData.guild) {
        return {
            success: false,
            message: 'You\'re not in a guild!'
        };
    }

    const guildId = userData.guild.guildId;
    const isOwner = userData.guild.isOwner;

    loadGuilds();
    const guild = guilds[guildId];

    if (!guild) {
        // Guild doesn't exist, just remove from user
        delete userData.guild;
        await saveUserData();
        return { success: true, disbanded: false };
    }

    // If owner leaves and there are other members, transfer ownership
    if (isOwner && guild.members.length > 1) {
        const newOwner = guild.members.find(m => m.userId !== userId);
        const newOwnerData = getUserData(newOwner.userId);

        if (newOwnerData && newOwnerData.guild) {
            newOwnerData.guild.isOwner = true;
            guild.ownerId = newOwner.userId;
        }
    }

    // Remove member
    guild.members = guild.members.filter(m => m.userId !== userId);

    // If no members left, disband guild
    if (guild.members.length === 0) {
        delete guilds[guildId];
    }

    delete userData.guild;

    // Update all guild members with new data
    for (const member of guild.members) {
        const memberData = getUserData(member.userId);
        if (memberData && memberData.guild) {
            memberData.guild.treasury = guild.treasury;
        }
    }

    await saveUserData();

    return {
        success: true,
        disbanded: guild.members.length === 0
    };
}

// Donate to guild treasury
async function donateToGuild(userId, amount) {
    const userData = getUserData(userId);
    if (!userData || !userData.guild) {
        return {
            success: false,
            message: 'You\'re not in a guild!'
        };
    }

    if (amount < 100) {
        return {
            success: false,
            message: 'Minimum donation is $100!'
        };
    }

    const { getUserMoney, setUserMoney } = require('./data');
    const currentMoney = await getUserMoney(userId);

    if (currentMoney < amount) {
        return {
            success: false,
            message: `You don't have enough money! You have $${currentMoney.toLocaleString()}`
        };
    }

    loadGuilds();
    const guild = guilds[userData.guild.guildId];

    if (!guild) {
        return {
            success: false,
            message: 'Guild not found!'
        };
    }

    // Deduct money
    await setUserMoney(userId, currentMoney - amount);

    // Add to treasury
    guild.treasury += amount;
    userData.guild.contributedTotal = (userData.guild.contributedTotal || 0) + amount;
    userData.guild.treasury = guild.treasury;

    // Update member contribution
    const member = guild.members.find(m => m.userId === userId);
    if (member) {
        member.contributedTotal = userData.guild.contributedTotal;
    }

    // Update all guild members with new treasury amount
    for (const m of guild.members) {
        const memberData = getUserData(m.userId);
        if (memberData && memberData.guild) {
            memberData.guild.treasury = guild.treasury;
        }
    }

    await saveUserData();

    return {
        success: true,
        amount,
        newTreasury: guild.treasury
    };
}

// Get guild info
function getGuildInfo(guildId) {
    loadGuilds();
    return guilds[guildId] || null;
}

// Get user's guild
function getUserGuild(userId) {
    const userData = getUserData(userId);
    if (!userData || !userData.guild) return null;

    loadGuilds();
    return guilds[userData.guild.guildId] || null;
}

// Get guild leaderboards
function getGuildLeaderboards() {
    loadGuilds();
    const guildArray = Object.values(guilds);

    // Calculate total stats for each guild
    const guildStats = guildArray.map(guild => {
        let totalWealth = guild.treasury;
        let totalGamesWon = 0;
        let totalWagered = 0;

        for (const member of guild.members) {
            const userData = getUserData(member.userId);
            if (userData) {
                totalWealth += userData.money || 0;
                totalGamesWon += userData.statistics?.gamesWon || 0;
                totalWagered += userData.statistics?.totalWagered || 0;
            }
        }

        return {
            ...guild,
            totalWealth,
            totalGamesWon,
            totalWagered,
            memberCount: guild.members.length
        };
    });

    return {
        byWealth: [...guildStats].sort((a, b) => b.totalWealth - a.totalWealth).slice(0, 10),
        byGamesWon: [...guildStats].sort((a, b) => b.totalGamesWon - a.totalGamesWon).slice(0, 10),
        byWagered: [...guildStats].sort((a, b) => b.totalWagered - a.totalWagered).slice(0, 10)
    };
}

// Get all guilds
function getAllGuilds() {
    loadGuilds();
    return Object.values(guilds);
}

module.exports = {
    loadGuilds,
    createGuild,
    joinGuild,
    leaveGuild,
    donateToGuild,
    getGuildInfo,
    getUserGuild,
    getGuildLeaderboards,
    getAllGuilds
};
