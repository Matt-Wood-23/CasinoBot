const {
    createGuildRank,
    getGuildRanks,
    getMemberRank,
    assignMemberRank,
    updateGuildRankPermissions,
    deleteGuildRank
} = require('../database/queries');

// Default ranks created for every new guild
const DEFAULT_RANKS = [
    {
        rankName: 'Leader',
        rankOrder: 0,
        permissions: {
            invite_members: true,
            kick_members: true,
            manage_ranks: true,
            manage_treasury: true,
            start_heist: true,
            manage_vault: true,
            manage_shop: false, // Reserved for future
            view_logs: true,
            manage_events: false // Reserved for future
        }
    },
    {
        rankName: 'Officer',
        rankOrder: 1,
        permissions: {
            invite_members: true,
            kick_members: true,
            manage_ranks: false,
            manage_treasury: true,
            start_heist: true,
            manage_vault: true,
            manage_shop: false,
            view_logs: true,
            manage_events: false
        }
    },
    {
        rankName: 'Veteran',
        rankOrder: 2,
        permissions: {
            invite_members: true,
            kick_members: false,
            manage_ranks: false,
            manage_treasury: false,
            start_heist: true,
            manage_vault: false,
            manage_shop: false,
            view_logs: false,
            manage_events: false
        }
    },
    {
        rankName: 'Member',
        rankOrder: 3,
        permissions: {
            invite_members: false,
            kick_members: false,
            manage_ranks: false,
            manage_treasury: false,
            start_heist: true,
            manage_vault: false,
            manage_shop: false,
            view_logs: false,
            manage_events: false
        }
    },
    {
        rankName: 'Recruit',
        rankOrder: 4,
        permissions: {
            invite_members: false,
            kick_members: false,
            manage_ranks: false,
            manage_treasury: false,
            start_heist: false,
            manage_vault: false,
            manage_shop: false,
            view_logs: false,
            manage_events: false
        }
    }
];

// Permission descriptions for display
const PERMISSION_DESCRIPTIONS = {
    invite_members: 'Invite new members to the guild',
    kick_members: 'Remove members from the guild',
    manage_ranks: 'Create, delete, and modify ranks',
    manage_treasury: 'Manage guild treasury and donations',
    start_heist: 'Initiate guild heists',
    manage_vault: 'Withdraw from guild vault',
    manage_shop: 'Manage guild shop (future)',
    view_logs: 'View guild activity logs',
    manage_events: 'Manage guild events (future)'
};

/**
 * Create default ranks for a new guild
 * @param {number} guildId - The guild ID
 * @returns {Promise<Object>} Object with rankIds for each default rank
 */
async function createDefaultRanks(guildId) {
    try {
        const createdRanks = {};

        for (const rank of DEFAULT_RANKS) {
            const result = await createGuildRank(
                guildId,
                rank.rankName,
                rank.rankOrder,
                rank.permissions
            );
            createdRanks[rank.rankName.toLowerCase()] = result.id;
        }

        return { success: true, ranks: createdRanks };
    } catch (error) {
        console.error('Error creating default ranks:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Check if a member has a specific permission
 * @param {number} guildId - The guild ID
 * @param {string} userId - The user ID
 * @param {string} permission - The permission to check
 * @returns {Promise<boolean>} True if member has permission
 */
async function hasPermission(guildId, userId, permission) {
    try {
        const rank = await getMemberRank(guildId, userId);
        if (!rank) return false;

        const permissions = typeof rank.permissions === 'string'
            ? JSON.parse(rank.permissions)
            : rank.permissions;

        return permissions[permission] === true;
    } catch (error) {
        console.error('Error checking permission:', error);
        return false;
    }
}

/**
 * Get member's rank or return default recruit rank info
 * @param {number} guildId - The guild ID
 * @param {string} userId - The user ID
 * @returns {Promise<Object|null>} Rank object or null
 */
async function getMemberRankOrDefault(guildId, userId) {
    try {
        const rank = await getMemberRank(guildId, userId);
        if (rank) return rank;

        // Return default recruit rank info
        const ranks = await getGuildRanks(guildId);
        return ranks.find(r => r.rankOrder === 4) || null;
    } catch (error) {
        console.error('Error getting member rank:', error);
        return null;
    }
}

/**
 * Check if a member is guild leader (rank order 0)
 * @param {number} guildId - The guild ID
 * @param {string} userId - The user ID
 * @returns {Promise<boolean>} True if member is leader
 */
async function isGuildLeader(guildId, userId) {
    try {
        const rank = await getMemberRank(guildId, userId);
        return rank && rank.rankOrder === 0;
    } catch (error) {
        console.error('Error checking if guild leader:', error);
        return false;
    }
}

/**
 * Check if a member can manage another member (rank order comparison)
 * @param {number} guildId - The guild ID
 * @param {string} managerId - The manager's user ID
 * @param {string} targetId - The target member's user ID
 * @returns {Promise<boolean>} True if manager can manage target
 */
async function canManageMember(guildId, managerId, targetId) {
    try {
        const managerRank = await getMemberRank(guildId, managerId);
        const targetRank = await getMemberRank(guildId, targetId);

        if (!managerRank) return false;
        if (!targetRank) return true; // Can manage unranked members

        // Lower rank order = higher rank
        return managerRank.rankOrder < targetRank.rankOrder;
    } catch (error) {
        console.error('Error checking if can manage member:', error);
        return false;
    }
}

/**
 * Get rank name for display
 * @param {number} guildId - The guild ID
 * @param {string} userId - The user ID
 * @returns {Promise<string>} Rank name or "No Rank"
 */
async function getRankDisplayName(guildId, userId) {
    try {
        const rank = await getMemberRank(guildId, userId);
        return rank ? rank.rankName : 'No Rank';
    } catch (error) {
        console.error('Error getting rank display name:', error);
        return 'Unknown';
    }
}

/**
 * Format permissions for display
 * @param {Object} permissions - Permissions object
 * @returns {string} Formatted permissions string
 */
function formatPermissions(permissions) {
    const perms = typeof permissions === 'string' ? JSON.parse(permissions) : permissions;
    const enabledPerms = Object.entries(perms)
        .filter(([key, value]) => value === true)
        .map(([key]) => PERMISSION_DESCRIPTIONS[key] || key);

    return enabledPerms.length > 0 ? enabledPerms.join('\n• ') : 'No permissions';
}

/**
 * Get rank emoji based on order
 * @param {number} rankOrder - The rank order (0 = highest)
 * @returns {string} Emoji representing the rank
 */
function getRankEmoji(rankOrder) {
    const emojis = ['👑', '⭐', '🎖️', '🎯', '🌟'];
    return emojis[rankOrder] || '📌';
}

/**
 * Validate rank name
 * @param {string} rankName - The rank name to validate
 * @returns {Object} Validation result
 */
function validateRankName(rankName) {
    if (!rankName || rankName.trim().length === 0) {
        return { valid: false, error: 'Rank name cannot be empty' };
    }

    if (rankName.length > 50) {
        return { valid: false, error: 'Rank name must be 50 characters or less' };
    }

    if (!/^[a-zA-Z0-9\s\-_]+$/.test(rankName)) {
        return { valid: false, error: 'Rank name can only contain letters, numbers, spaces, hyphens, and underscores' };
    }

    return { valid: true };
}

/**
 * Validate rank order
 * @param {number} rankOrder - The rank order to validate
 * @param {Array} existingRanks - Array of existing ranks
 * @returns {Object} Validation result
 */
function validateRankOrder(rankOrder, existingRanks = []) {
    if (typeof rankOrder !== 'number' || rankOrder < 0) {
        return { valid: false, error: 'Rank order must be a positive number' };
    }

    if (rankOrder === 0) {
        return { valid: false, error: 'Rank order 0 is reserved for the guild leader' };
    }

    if (existingRanks.some(r => r.rankOrder === rankOrder)) {
        return { valid: false, error: 'A rank with this order already exists' };
    }

    return { valid: true };
}

module.exports = {
    DEFAULT_RANKS,
    PERMISSION_DESCRIPTIONS,
    createDefaultRanks,
    hasPermission,
    getMemberRankOrDefault,
    isGuildLeader,
    canManageMember,
    getRankDisplayName,
    formatPermissions,
    getRankEmoji,
    validateRankName,
    validateRankOrder
};
