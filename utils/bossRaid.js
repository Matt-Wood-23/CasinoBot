const { query } = require('../database/connection');
const { createGuildEvent, getEvent, joinEvent, updateEventScore, recordMemberContribution, getEventLeaderboard } = require('./guildEvents');
const { convertDatabaseResult } = require('../database/queries/users');

// Boss configurations
const BOSS_TYPES = {
    'slot_demon': {
        name: '🎰 Slot Demon',
        baseHp: 1000000,
        level: 1,
        description: 'A demonic slot machine come to life! Deal damage by playing games.',
        rewardMultiplier: 1.0
    },
    'card_shark': {
        name: '🃏 Card Shark',
        baseHp: 1500000,
        level: 2,
        description: 'A legendary card player seeking worthy opponents.',
        rewardMultiplier: 1.5
    },
    'dice_dragon': {
        name: '🎲 Dice Dragon',
        baseHp: 2000000,
        level: 3,
        description: 'An ancient dragon that hoards casino winnings.',
        rewardMultiplier: 2.0
    },
    'jackpot_king': {
        name: '👑 Jackpot King',
        baseHp: 3000000,
        level: 4,
        description: 'The ruler of all progressive jackpots.',
        rewardMultiplier: 3.0
    },
    'roulette_reaper': {
        name: '☠️ Roulette Reaper',
        baseHp: 5000000,
        level: 5,
        description: 'Death himself, spinning the wheel of fate.',
        rewardMultiplier: 5.0
    }
};

// Damage values per game type
const GAME_DAMAGE = {
    'slots': 1000,
    'blackjack': 1500,
    'roulette': 1200,
    'coinflip': 800,
    'crash': 1800,
    'poker': 2000,
    'bingo': 1600,
    'war': 900,
    'horserace': 1400,
    'hilo': 1100
};

/**
 * Create a new boss raid event
 */
async function createBossRaid(bossType, durationHours = 48) {
    const bossConfig = BOSS_TYPES[bossType];
    if (!bossConfig) {
        return { success: false, error: 'Invalid boss type' };
    }

    // Create the event
    const eventResult = await createGuildEvent(
        'boss_raid',
        bossConfig.name,
        bossConfig.description,
        durationHours,
        0, // reward pool calculated on defeat
        true // global event
    );

    if (!eventResult.success) {
        return eventResult;
    }

    const event = eventResult.event;

    // Create boss raid specific data
    const bossResult = await query(
        `INSERT INTO guild_boss_raids
         (event_id, boss_name, boss_hp_max, boss_hp_current, boss_level, reward_multiplier)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [event.id, bossConfig.name, bossConfig.baseHp, bossConfig.baseHp, bossConfig.level, bossConfig.rewardMultiplier]
    );

    return {
        success: true,
        event: event,
        boss: convertDatabaseResult(bossResult.rows[0])
    };
}

/**
 * Get boss raid data for an event
 */
async function getBossRaid(eventId) {
    const result = await query(
        'SELECT * FROM guild_boss_raids WHERE event_id = $1',
        [eventId]
    );

    if (result.rows.length === 0) {
        return null;
    }

    return convertDatabaseResult(result.rows[0]);
}

/**
 * Get current active boss raid
 */
async function getCurrentBossRaid() {
    const { getCurrentEvent } = require('./guildEvents');
    const event = await getCurrentEvent('boss_raid');

    if (!event) {
        return null;
    }

    const boss = await getBossRaid(event.id);
    return {
        event,
        boss
    };
}

/**
 * Deal damage to boss
 */
async function dealDamageToBoss(eventId, guildId, userId, gameName, wagerAmount) {
    // Get boss raid data
    const boss = await getBossRaid(eventId);
    if (!boss) {
        return { success: false, error: 'Boss raid not found' };
    }

    if (boss.isDefeated) {
        return { success: false, error: 'Boss already defeated' };
    }

    // Calculate damage based on game type
    const baseDamage = GAME_DAMAGE[gameName.toLowerCase()] || 1000;

    // Bonus damage based on wager (1 damage per $100 wagered)
    const wagerDamage = Math.floor(wagerAmount / 100);

    const totalDamage = baseDamage + wagerDamage;

    // Update boss HP
    const newHp = Math.max(0, boss.bossHpCurrent - totalDamage);

    const updateResult = await query(
        `UPDATE guild_boss_raids
         SET boss_hp_current = $1
         WHERE event_id = $2
         RETURNING *`,
        [newHp, eventId]
    );

    const updatedBoss = convertDatabaseResult(updateResult.rows[0]);

    // Record guild contribution (auto-join if not already)
    await joinEvent(eventId, guildId);
    await updateEventScore(eventId, guildId, totalDamage);
    await recordMemberContribution(eventId, guildId, userId, totalDamage);

    // Check if boss is defeated
    if (newHp <= 0 && !boss.isDefeated) {
        await defeatBoss(eventId, guildId);
        return {
            success: true,
            damage: totalDamage,
            boss: updatedBoss,
            defeated: true,
            defeatingGuild: guildId
        };
    }

    return {
        success: true,
        damage: totalDamage,
        boss: updatedBoss,
        defeated: false
    };
}

/**
 * Mark boss as defeated
 */
async function defeatBoss(eventId, defeatingGuildId) {
    const defeatedAt = Date.now();

    await query(
        `UPDATE guild_boss_raids
         SET is_defeated = true, defeated_at = $1, defeating_guild_id = $2
         WHERE event_id = $3`,
        [defeatedAt, defeatingGuildId, eventId]
    );

    return { success: true };
}

/**
 * Calculate boss raid rewards
 */
async function calculateBossRewards(eventId) {
    const boss = await getBossRaid(eventId);
    const event = await getEvent(eventId);

    if (!boss || !boss.isDefeated) {
        return { success: false, error: 'Boss not defeated' };
    }

    // Base reward pool (scales with boss level)
    const baseReward = boss.bossLevel * 500000; // Level 1 = 500k, Level 5 = 2.5M
    const totalRewardPool = Math.floor(baseReward * boss.rewardMultiplier);

    // Get top contributing guilds
    const leaderboard = await getEventLeaderboard(eventId, 10);

    const rewards = [];

    // Distribute rewards based on contribution percentage
    for (let i = 0; i < leaderboard.length; i++) {
        const participation = leaderboard[i];

        // Reward tiers: 1st = 30%, 2nd = 20%, 3rd = 15%, 4-10 = split remaining 35%
        let percentage = 0;
        if (i === 0) percentage = 0.30;
        else if (i === 1) percentage = 0.20;
        else if (i === 2) percentage = 0.15;
        else percentage = 0.35 / 7; // Split among 4th-10th place

        const guildReward = Math.floor(totalRewardPool * percentage);

        rewards.push({
            rank: i + 1,
            guildId: participation.guildId,
            guildName: participation.guildName,
            contribution: participation.score,
            reward: guildReward,
            percentage: (percentage * 100).toFixed(1)
        });
    }

    return {
        success: true,
        totalRewardPool,
        rewards
    };
}

/**
 * Get boss raid status embed data
 */
async function getBossRaidStatus(eventId) {
    const event = await getEvent(eventId);
    const boss = await getBossRaid(eventId);

    if (!event || !boss) {
        return null;
    }

    const hpPercentage = (boss.bossHpCurrent / boss.bossHpMax) * 100;
    const hpBar = createHPBar(hpPercentage);

    return {
        event,
        boss,
        hpPercentage: hpPercentage.toFixed(1),
        hpBar,
        status: boss.isDefeated ? 'Defeated' : 'Active'
    };
}

/**
 * Create HP bar visualization
 */
function createHPBar(percentage) {
    const totalBars = 20;
    const filledBars = Math.ceil((percentage / 100) * totalBars);
    const emptyBars = totalBars - filledBars;

    let bar = '```\n[';
    bar += '█'.repeat(filledBars);
    bar += '░'.repeat(emptyBars);
    bar += '] ' + percentage.toFixed(1) + '%\n```';

    return bar;
}

/**
 * Get player damage leaderboard for a boss raid
 */
async function getPlayerDamageLeaderboard(eventId, guildId = null, limit = 10) {
    let sql = `
        SELECT gemc.*, u.discord_id
        FROM guild_event_member_contributions gemc
        JOIN users u ON gemc.user_id = u.id
        WHERE gemc.event_id = $1
    `;
    const params = [eventId];

    if (guildId) {
        sql += ' AND gemc.guild_id = $2';
        params.push(guildId);
    }

    sql += ' ORDER BY gemc.contribution_amount DESC LIMIT $' + (guildId ? '3' : '2');
    params.push(limit);

    const result = await query(sql, params);
    return result.rows.map(convertDatabaseResult);
}

module.exports = {
    BOSS_TYPES,
    GAME_DAMAGE,
    createBossRaid,
    getBossRaid,
    getCurrentBossRaid,
    dealDamageToBoss,
    defeatBoss,
    calculateBossRewards,
    getBossRaidStatus,
    getPlayerDamageLeaderboard
};
