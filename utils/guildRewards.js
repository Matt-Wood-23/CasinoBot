/**
 * Guild Leaderboard Rewards System
 * Handles season-end and weekly reward distribution for top guilds
 */

const { query } = require('../database/connection');
const { convertDatabaseResult } = require('../database/queries/users');

// Reward tiers for season-end
const SEASON_REWARDS = {
    1: {
        money: 10000000,           // $10M
        contributionPoints: 5000,   // 5000 points per member
        shopItem: 'guild_xp_surge', // Free item
        badge: '👑 Season Champion'
    },
    2: {
        money: 7500000,            // $7.5M
        contributionPoints: 3500,
        shopItem: 'personal_xp_boost',
        badge: '🥈 Season Runner-Up'
    },
    3: {
        money: 5000000,            // $5M
        contributionPoints: 2500,
        shopItem: 'lucky_charm',
        badge: '🥉 Season Bronze'
    },
    4: { money: 3000000, contributionPoints: 1500 },
    5: { money: 2000000, contributionPoints: 1000 },
    6: { money: 1500000, contributionPoints: 750 },
    7: { money: 1250000, contributionPoints: 600 },
    8: { money: 1000000, contributionPoints: 500 },
    9: { money: 750000, contributionPoints: 400 },
    10: { money: 500000, contributionPoints: 300 }
};

// Reward tiers for weekly top guilds
const WEEKLY_REWARDS = {
    1: {
        money: 2000000,            // $2M
        contributionPoints: 1000,
        badge: '⭐ Weekly Star'
    },
    2: {
        money: 1500000,            // $1.5M
        contributionPoints: 750
    },
    3: {
        money: 1000000,            // $1M
        contributionPoints: 500
    },
    4: { money: 750000, contributionPoints: 400 },
    5: { money: 500000, contributionPoints: 300 }
};

/**
 * Get top guilds by XP for a time period
 */
async function getTopGuildsByXP(limit = 10, since = null) {
    let sql = `
        SELECT
            g.id as guild_id,
            g.name as guild_name,
            g.level,
            gxp.total_xp,
            gxp.current_level_xp,
            COUNT(DISTINCT gm.user_id) as member_count
        FROM guilds g
        JOIN guild_xp gxp ON g.id = gxp.guild_id
        LEFT JOIN guild_members gm ON g.id = gm.guild_id
    `;

    const params = [];
    let paramCount = 1;

    if (since) {
        sql += ` WHERE gxp.updated_at >= $${paramCount}`;
        params.push(since);
        paramCount++;
    }

    sql += `
        GROUP BY g.id, g.name, g.level, gxp.total_xp, gxp.current_level_xp
        ORDER BY gxp.total_xp DESC
        LIMIT $${paramCount}
    `;
    params.push(limit);

    const result = await query(sql, params);
    return result.rows.map(convertDatabaseResult);
}

/**
 * Get reward history for a guild
 */
async function getGuildRewardHistory(guildId, limit = 10) {
    const result = await query(
        `SELECT * FROM guild_rewards
         WHERE guild_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [guildId, limit]
    );

    return result.rows.map(convertDatabaseResult);
}

/**
 * Record a reward distribution
 */
async function recordReward(guildId, rewardType, rewardData, reason) {
    const createdAt = Date.now();

    const result = await query(
        `INSERT INTO guild_rewards
         (guild_id, reward_type, reward_data, reason, created_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [guildId, rewardType, JSON.stringify(rewardData), reason, createdAt]
    );

    return convertDatabaseResult(result.rows[0]);
}

/**
 * Distribute season-end rewards to top guilds
 */
async function distributeSeasonRewards(seasonId) {
    try {
        const topGuilds = await getTopGuildsByXP(10);

        if (topGuilds.length === 0) {
            return { success: false, error: 'No guilds found' };
        }

        const distributions = [];

        for (let i = 0; i < topGuilds.length; i++) {
            const guild = topGuilds[i];
            const rank = i + 1;
            const rewards = SEASON_REWARDS[rank];

            if (!rewards) continue;

            // Distribute money to treasury
            await query(
                'UPDATE guilds SET treasury = treasury + $1 WHERE id = $2',
                [rewards.money, guild.guildId]
            );

            // Distribute contribution points to all members
            if (rewards.contributionPoints) {
                await query(
                    `UPDATE guild_members
                     SET contribution_points = contribution_points + $1
                     WHERE guild_id = $2`,
                    [rewards.contributionPoints, guild.guildId]
                );
            }

            // Give shop items (if applicable)
            if (rewards.shopItem) {
                const { purchaseShopItemForGuild } = require('../database/queries');
                const members = await query(
                    'SELECT user_id FROM guild_members WHERE guild_id = $1',
                    [guild.guildId]
                );

                for (const member of members.rows) {
                    try {
                        await purchaseShopItemForGuild(guild.guildId, member.user_id, rewards.shopItem, 0);
                    } catch (error) {
                        console.error(`Error giving shop item to member ${member.user_id}:`, error);
                    }
                }
            }

            // Record the reward
            await recordReward(guild.guildId, 'season_end', {
                season: seasonId,
                rank: rank,
                money: rewards.money,
                contributionPoints: rewards.contributionPoints,
                shopItem: rewards.shopItem,
                badge: rewards.badge
            }, `Season ${seasonId} - Rank ${rank}`);

            distributions.push({
                guildId: guild.guildId,
                guildName: guild.guildName,
                rank: rank,
                rewards: rewards
            });
        }

        return {
            success: true,
            distributions: distributions
        };

    } catch (error) {
        console.error('Error distributing season rewards:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Distribute weekly rewards to top guilds
 */
async function distributeWeeklyRewards() {
    try {
        const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const topGuilds = await getTopGuildsByXP(5, oneWeekAgo);

        if (topGuilds.length === 0) {
            return { success: false, error: 'No guilds found' };
        }

        const distributions = [];

        for (let i = 0; i < topGuilds.length; i++) {
            const guild = topGuilds[i];
            const rank = i + 1;
            const rewards = WEEKLY_REWARDS[rank];

            if (!rewards) continue;

            // Distribute money to treasury
            await query(
                'UPDATE guilds SET treasury = treasury + $1 WHERE id = $2',
                [rewards.money, guild.guildId]
            );

            // Distribute contribution points to all members
            if (rewards.contributionPoints) {
                await query(
                    `UPDATE guild_members
                     SET contribution_points = contribution_points + $1
                     WHERE guild_id = $2`,
                    [rewards.contributionPoints, guild.guildId]
                );
            }

            // Record the reward
            const weekNumber = getWeekNumber();
            await recordReward(guild.guildId, 'weekly', {
                week: weekNumber,
                rank: rank,
                money: rewards.money,
                contributionPoints: rewards.contributionPoints,
                badge: rewards.badge
            }, `Week ${weekNumber} - Rank ${rank}`);

            distributions.push({
                guildId: guild.guildId,
                guildName: guild.guildName,
                rank: rank,
                rewards: rewards
            });
        }

        return {
            success: true,
            distributions: distributions
        };

    } catch (error) {
        console.error('Error distributing weekly rewards:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get current week number of the year
 */
function getWeekNumber() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const diff = now - start;
    const oneWeek = 1000 * 60 * 60 * 24 * 7;
    return Math.floor(diff / oneWeek) + 1;
}

/**
 * Get pending rewards for a guild
 */
async function getPendingRewards(guildId) {
    // Check if guild qualifies for current week/season rewards
    const topGuilds = await getTopGuildsByXP(10);
    const guildRank = topGuilds.findIndex(g => g.guildId === guildId) + 1;

    if (guildRank === 0) {
        return { seasonRank: null, weeklyRank: null };
    }

    const seasonReward = SEASON_REWARDS[guildRank];
    const weeklyReward = guildRank <= 5 ? WEEKLY_REWARDS[guildRank] : null;

    return {
        seasonRank: guildRank <= 10 ? guildRank : null,
        seasonReward: seasonReward || null,
        weeklyRank: guildRank <= 5 ? guildRank : null,
        weeklyReward: weeklyReward || null
    };
}

/**
 * Calculate total XP earned by guild in a time period
 */
async function getGuildXPInPeriod(guildId, startTime, endTime) {
    const result = await query(
        `SELECT COALESCE(SUM(xp_amount), 0) as total_xp
         FROM guild_xp_log
         WHERE guild_id = $1 AND timestamp >= $2 AND timestamp < $3`,
        [guildId, startTime, endTime]
    );

    if (result.rows.length === 0) {
        return 0;
    }

    return parseInt(result.rows[0].total_xp) || 0;
}

module.exports = {
    SEASON_REWARDS,
    WEEKLY_REWARDS,
    getTopGuildsByXP,
    getGuildRewardHistory,
    recordReward,
    distributeSeasonRewards,
    distributeWeeklyRewards,
    getPendingRewards,
    getGuildXPInPeriod
};
