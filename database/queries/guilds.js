const { query, getClient } = require('../connection');
const { getUserMoney, convertKeysToCamelCase } = require('./users');

// Alias for convenience
const toCamelCase = convertKeysToCamelCase;

// ============ CORE GUILD FUNCTIONS ============

// Get guild by name
async function getGuildByName(guildName) {
    try {
        const result = await query(
            `SELECT g.id, g.guild_id, g.name, g.treasury, g.created_at, u.discord_id as owner_discord_id
             FROM guilds g
             LEFT JOIN users u ON u.id = g.owner_id
             WHERE LOWER(g.name) = LOWER($1)`,
            [guildName]
        );

        if (result.rows.length === 0) return null;

        const guild = result.rows[0];
        return {
            id: guild.id,
            guildId: guild.guild_id,
            name: guild.name,
            treasury: parseInt(guild.treasury),
            createdAt: parseInt(guild.created_at),
            ownerId: guild.owner_discord_id
        };
    } catch (error) {
        console.error('Error getting guild by name:', error);
        return null;
    }
}

// Get user's guild
async function getUserGuildDB(userId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return null;

        const dbUserId = userResult.rows[0].id;

        const result = await query(
            `SELECT g.id, g.guild_id, g.name, g.treasury, g.created_at, g.owner_id,
                    gm.joined_at, gm.contributed_total, u.discord_id as owner_discord_id
             FROM guild_members gm
             JOIN guilds g ON g.id = gm.guild_id
             JOIN users u ON u.id = g.owner_id
             WHERE gm.user_id = $1`,
            [dbUserId]
        );

        if (result.rows.length === 0) return null;

        const row = result.rows[0];
        return {
            guildId: row.guild_id,  // String guild_id field (e.g., "guild_123_456"), used by all guild functions
            guildName: row.name,
            isOwner: row.owner_id === dbUserId,
            joinedAt: parseInt(row.joined_at),
            contributedTotal: parseInt(row.contributed_total),
            treasury: parseInt(row.treasury),
            ownerId: row.owner_discord_id
        };
    } catch (error) {
        console.error('Error getting user guild:', error);
        return null;
    }
}

// Create guild
async function createGuildDB(userId, guildName) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Ensure user exists
        await getUserMoney(userId);

        const userResult = await client.query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );
        const dbUserId = userResult.rows[0].id;

        // Check if guild name exists
        const existingGuild = await client.query(
            'SELECT id FROM guilds WHERE LOWER(name) = LOWER($1)',
            [guildName]
        );

        if (existingGuild.rows.length > 0) {
            await client.query('ROLLBACK');
            return { success: false, message: 'A guild with that name already exists!' };
        }

        // Check if user is already in a guild
        const userGuild = await client.query(
            'SELECT guild_id FROM guild_members WHERE user_id = $1',
            [dbUserId]
        );

        if (userGuild.rows.length > 0) {
            await client.query('ROLLBACK');
            return { success: false, message: 'You\'re already in a guild!' };
        }

        const guildId = `guild_${Date.now()}_${userId}`;
        const now = Date.now();

        // Create guild
        const guildResult = await client.query(
            `INSERT INTO guilds (guild_id, name, owner_id, treasury, created_at)
             VALUES ($1, $2, $3, 0, $4)
             RETURNING id`,
            [guildId, guildName, dbUserId, now]
        );

        const newGuildId = guildResult.rows[0].id;

        // Add owner as member
        await client.query(
            `INSERT INTO guild_members (guild_id, user_id, joined_at, contributed_total)
             VALUES ($1, $2, $3, 0)`,
            [newGuildId, dbUserId, now]
        );

        // Create default ranks for the guild
        const defaultRanks = [
            { name: 'Leader', order: 0, perms: '{"invite_members": true, "kick_members": true, "manage_ranks": true, "manage_treasury": true, "start_heist": true, "manage_vault": true, "manage_shop": false, "view_logs": true, "manage_events": false}' },
            { name: 'Officer', order: 1, perms: '{"invite_members": true, "kick_members": true, "manage_ranks": false, "manage_treasury": true, "start_heist": true, "manage_vault": true, "manage_shop": false, "view_logs": true, "manage_events": false}' },
            { name: 'Veteran', order: 2, perms: '{"invite_members": true, "kick_members": false, "manage_ranks": false, "manage_treasury": false, "start_heist": true, "manage_vault": false, "manage_shop": false, "view_logs": false, "manage_events": false}' },
            { name: 'Member', order: 3, perms: '{"invite_members": false, "kick_members": false, "manage_ranks": false, "manage_treasury": false, "start_heist": true, "manage_vault": false, "manage_shop": false, "view_logs": false, "manage_events": false}' },
            { name: 'Recruit', order: 4, perms: '{"invite_members": false, "kick_members": false, "manage_ranks": false, "manage_treasury": false, "start_heist": false, "manage_vault": false, "manage_shop": false, "view_logs": false, "manage_events": false}' }
        ];

        let leaderRankId = null;
        for (const rank of defaultRanks) {
            const rankResult = await client.query(
                `INSERT INTO guild_ranks (guild_id, rank_name, rank_order, permissions)
                 VALUES ($1, $2, $3, $4)
                 RETURNING id`,
                [newGuildId, rank.name, rank.order, rank.perms]
            );
            if (rank.order === 0) {
                leaderRankId = rankResult.rows[0].id;
            }
        }

        // Assign leader rank to guild owner
        if (leaderRankId) {
            await client.query(
                `UPDATE guild_members SET rank_id = $1 WHERE guild_id = $2 AND user_id = $3`,
                [leaderRankId, newGuildId, dbUserId]
            );
        }

        await client.query('COMMIT');

        return {
            success: true,
            guild: {
                id: guildId,
                name: guildName,
                ownerId: userId,
                treasury: 0,
                createdAt: now
            }
        };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating guild:', error);
        return { success: false, message: 'Failed to create guild.' };
    } finally {
        client.release();
    }
}

// Join guild
async function joinGuildDB(userId, guildName) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        await getUserMoney(userId); // Ensure user exists

        const userResult = await client.query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );
        const dbUserId = userResult.rows[0].id;

        // Check if user is already in a guild
        const userGuild = await client.query(
            'SELECT guild_id FROM guild_members WHERE user_id = $1',
            [dbUserId]
        );

        if (userGuild.rows.length > 0) {
            await client.query('ROLLBACK');
            return { success: false, message: 'You\'re already in a guild!' };
        }

        // Find guild
        const guildResult = await client.query(
            `SELECT g.id, g.guild_id, g.name, g.treasury, g.created_at, COUNT(gm.user_id) as member_count
             FROM guilds g
             LEFT JOIN guild_members gm ON gm.guild_id = g.id
             WHERE LOWER(g.name) = LOWER($1)
             GROUP BY g.id, g.guild_id, g.name, g.treasury, g.created_at`,
            [guildName]
        );

        if (guildResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, message: 'Guild not found!' };
        }

        const guild = guildResult.rows[0];

        if (parseInt(guild.member_count) >= 10) {
            await client.query('ROLLBACK');
            return { success: false, message: 'This guild is full! (Maximum 10 members)' };
        }

        // Get the Member rank (order 3) for this guild
        const memberRankResult = await client.query(
            `SELECT id FROM guild_ranks WHERE guild_id = $1 AND rank_order = 3`,
            [guild.id]
        );
        const memberRankId = memberRankResult.rows[0]?.id || null;

        // Add member with Member rank
        const now = Date.now();
        await client.query(
            `INSERT INTO guild_members (guild_id, user_id, joined_at, contributed_total, rank_id)
             VALUES ($1, $2, $3, 0, $4)`,
            [guild.id, dbUserId, now, memberRankId]
        );

        await client.query('COMMIT');

        return {
            success: true,
            guild: {
                id: guild.guild_id,
                name: guild.name,
                treasury: parseInt(guild.treasury)
            }
        };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error joining guild:', error);
        return { success: false, message: 'Failed to join guild.' };
    } finally {
        client.release();
    }
}

// Leave guild
async function leaveGuildDB(userId) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        const userResult = await client.query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, message: 'User not found!' };
        }

        const dbUserId = userResult.rows[0].id;

        // Get user's guild
        const memberResult = await client.query(
            `SELECT gm.guild_id, g.owner_id, g.guild_id as guild_string_id
             FROM guild_members gm
             JOIN guilds g ON g.id = gm.guild_id
             WHERE gm.user_id = $1`,
            [dbUserId]
        );

        if (memberResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, message: 'You\'re not in a guild!' };
        }

        const guildId = memberResult.rows[0].guild_id;
        const isOwner = memberResult.rows[0].owner_id === dbUserId;

        // Count remaining members
        const memberCountResult = await client.query(
            'SELECT COUNT(*) as count FROM guild_members WHERE guild_id = $1',
            [guildId]
        );

        const memberCount = parseInt(memberCountResult.rows[0].count);

        // If owner leaves with other members, transfer ownership
        if (isOwner && memberCount > 1) {
            const newOwnerResult = await client.query(
                `SELECT user_id FROM guild_members
                 WHERE guild_id = $1 AND user_id != $2
                 ORDER BY joined_at ASC LIMIT 1`,
                [guildId, dbUserId]
            );

            if (newOwnerResult.rows.length > 0) {
                await client.query(
                    'UPDATE guilds SET owner_id = $1 WHERE id = $2',
                    [newOwnerResult.rows[0].user_id, guildId]
                );
            }
        }

        // Remove member
        await client.query(
            'DELETE FROM guild_members WHERE guild_id = $1 AND user_id = $2',
            [guildId, dbUserId]
        );

        // If no members left, delete guild
        let disbanded = false;
        if (memberCount <= 1) {
            await client.query('DELETE FROM guilds WHERE id = $1', [guildId]);
            disbanded = true;
        }

        await client.query('COMMIT');

        return { success: true, disbanded };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error leaving guild:', error);
        return { success: false, message: 'Failed to leave guild.' };
    } finally {
        client.release();
    }
}

// Donate to guild treasury
async function donateToGuildTreasury(userId, amount) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        const userResult = await client.query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, message: 'User not found!' };
        }

        const dbUserId = userResult.rows[0].id;

        // Get user's guild
        const memberResult = await client.query(
            'SELECT guild_id FROM guild_members WHERE user_id = $1',
            [dbUserId]
        );

        if (memberResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, message: 'You\'re not in a guild!' };
        }

        const guildId = memberResult.rows[0].guild_id;

        // Update guild treasury
        await client.query(
            'UPDATE guilds SET treasury = treasury + $1 WHERE id = $2',
            [amount, guildId]
        );

        // Update member's contributed total
        await client.query(
            'UPDATE guild_members SET contributed_total = contributed_total + $1 WHERE guild_id = $2 AND user_id = $3',
            [amount, guildId, dbUserId]
        );

        // Get new treasury amount
        const treasuryResult = await client.query(
            'SELECT treasury FROM guilds WHERE id = $1',
            [guildId]
        );

        await client.query('COMMIT');

        return {
            success: true,
            newTreasury: parseInt(treasuryResult.rows[0].treasury)
        };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error donating to guild:', error);
        return { success: false, message: 'Failed to donate to guild.' };
    } finally {
        client.release();
    }
}

// Get guild members
async function getGuildMembers(guildName) {
    try {
        const result = await query(
            `SELECT u.discord_id, gm.joined_at, gm.contributed_total
             FROM guild_members gm
             JOIN guilds g ON g.id = gm.guild_id
             JOIN users u ON u.id = gm.user_id
             WHERE LOWER(g.name) = LOWER($1)
             ORDER BY gm.joined_at ASC`,
            [guildName]
        );

        return result.rows.map(row => ({
            userId: row.discord_id,
            joinedAt: parseInt(row.joined_at),
            contributedTotal: parseInt(row.contributed_total)
        }));
    } catch (error) {
        console.error('Error getting guild members:', error);
        return [];
    }
}

// ============ GUILD LEVEL SYSTEM ============

// Add experience to a guild and handle level-ups
async function addGuildExperience(guildId, userId, amount, source, details = null) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Get guild's database ID
        const guildResult = await client.query(
            'SELECT id, experience, level FROM guilds WHERE guild_id = $1',
            [guildId]
        );

        if (guildResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, message: 'Guild not found' };
        }

        const guild = guildResult.rows[0];
        const guildDbId = guild.id;
        const oldExp = parseInt(guild.experience);
        const oldLevel = parseInt(guild.level);
        const newExp = oldExp + amount;

        // Get user's database ID if provided
        let userDbId = null;
        if (userId) {
            const userResult = await client.query(
                'SELECT id FROM users WHERE discord_id = $1',
                [userId]
            );
            if (userResult.rows.length > 0) {
                userDbId = userResult.rows[0].id;
            }
        }

        // Log the experience gain
        await client.query(
            `INSERT INTO guild_experience_log (guild_id, user_id, amount, source, details, timestamp)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [guildDbId, userDbId, amount, source, details, Date.now()]
        );

        // Update guild experience
        await client.query(
            'UPDATE guilds SET experience = $1 WHERE id = $2',
            [newExp, guildDbId]
        );

        // Update user statistics if applicable
        if (userDbId) {
            await client.query(
                `UPDATE user_statistics
                 SET guild_xp_contributed = guild_xp_contributed + $1
                 WHERE user_id = $2`,
                [amount, userDbId]
            );
        }

        await client.query('COMMIT');

        return {
            success: true,
            oldExp,
            newExp,
            oldLevel,
            amount,
            source
        };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error adding guild experience:', error);
        return { success: false, message: 'Failed to add experience' };
    } finally {
        client.release();
    }
}

// Update guild level (separate from XP to allow manual level calculation)
async function updateGuildLevel(guildId, newLevel) {
    try {
        const now = Date.now();
        const result = await query(
            `UPDATE guilds
             SET level = $1,
                 last_level_up = $2,
                 season_max_level = GREATEST(season_max_level, $1)
             WHERE guild_id = $3
             RETURNING level, season_max_level`,
            [newLevel, now, guildId]
        );

        return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
        console.error('Error updating guild level:', error);
        return null;
    }
}

// Get guild with full level information
async function getGuildWithLevel(guildId) {
    try {
        const result = await query(
            `SELECT g.id, g.guild_id, g.name, g.treasury, g.level, g.experience,
                    g.season_id, g.legacy_points, g.season_max_level, g.last_level_up,
                    g.created_at, g.max_members, u.discord_id as owner_discord_id,
                    COUNT(gm.user_id) as member_count
             FROM guilds g
             LEFT JOIN users u ON u.id = g.owner_id
             LEFT JOIN guild_members gm ON gm.guild_id = g.id
             WHERE g.guild_id = $1
             GROUP BY g.id, g.guild_id, g.name, g.treasury, g.level, g.experience,
                      g.season_id, g.legacy_points, g.season_max_level, g.last_level_up,
                      g.created_at, g.max_members, u.discord_id`,
            [guildId]
        );

        if (result.rows.length === 0) return null;

        const guild = result.rows[0];
        return convertKeysToCamelCase(guild);
    } catch (error) {
        console.error('Error getting guild with level:', error);
        return null;
    }
}

// Get guild by name with level info
async function getGuildByNameWithLevel(guildName) {
    try {
        const result = await query(
            `SELECT g.id, g.guild_id, g.name, g.treasury, g.level, g.experience,
                    g.season_id, g.legacy_points, g.season_max_level, g.created_at,
                    g.max_members, u.discord_id as owner_discord_id
             FROM guilds g
             LEFT JOIN users u ON u.id = g.owner_id
             WHERE LOWER(g.name) = LOWER($1)`,
            [guildName]
        );

        if (result.rows.length === 0) return null;

        return convertKeysToCamelCase(result.rows[0]);
    } catch (error) {
        console.error('Error getting guild by name with level:', error);
        return null;
    }
}

// ============ GUILD CHALLENGES ============

// Initialize weekly challenges for a guild
async function initializeGuildChallenges(guildId, weekStart, challenges) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Get guild's database ID
        const guildResult = await client.query(
            'SELECT id FROM guilds WHERE guild_id = $1',
            [guildId]
        );

        if (guildResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, message: 'Guild not found' };
        }

        const guildDbId = guildResult.rows[0].id;

        // Insert each challenge
        for (const challenge of challenges) {
            await client.query(
                `INSERT INTO guild_challenges
                 (guild_id, challenge_type, week_start, target, xp_reward, progress)
                 VALUES ($1, $2, $3, $4, $5, 0)
                 ON CONFLICT (guild_id, challenge_type, week_start) DO NOTHING`,
                [guildDbId, challenge.type, weekStart, challenge.target, challenge.xpReward]
            );
        }

        await client.query('COMMIT');
        return { success: true };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error initializing guild challenges:', error);
        return { success: false, message: 'Failed to initialize challenges' };
    } finally {
        client.release();
    }
}

// Get active challenges for a guild
async function getGuildChallenges(guildId, weekStart) {
    try {
        // Get guild's database ID
        const guildResult = await query(
            'SELECT id FROM guilds WHERE guild_id = $1',
            [guildId]
        );

        if (guildResult.rows.length === 0) return [];

        const guildDbId = guildResult.rows[0].id;

        const result = await query(
            `SELECT challenge_type, progress, target, completed, xp_reward, completed_at
             FROM guild_challenges
             WHERE guild_id = $1 AND week_start = $2
             ORDER BY challenge_type`,
            [guildDbId, weekStart]
        );

        return result.rows.map(row => convertKeysToCamelCase(row));
    } catch (error) {
        console.error('Error getting guild challenges:', error);
        return [];
    }
}

// Update guild challenge progress
async function updateGuildChallengeProgress(guildId, weekStart, challengeType, incrementAmount = 1) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Get guild's database ID
        const guildResult = await client.query(
            'SELECT id FROM guilds WHERE guild_id = $1',
            [guildId]
        );

        if (guildResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false };
        }

        const guildDbId = guildResult.rows[0].id;

        // Update progress
        const result = await client.query(
            `UPDATE guild_challenges
             SET progress = progress + $1
             WHERE guild_id = $2 AND week_start = $3 AND challenge_type = $4 AND completed = FALSE
             RETURNING progress, target, xp_reward`,
            [incrementAmount, guildDbId, weekStart, challengeType]
        );

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false };
        }

        const challenge = result.rows[0];
        const isCompleted = challenge.progress >= challenge.target;

        // If challenge is now completed, mark it and award XP
        if (isCompleted) {
            await client.query(
                `UPDATE guild_challenges
                 SET completed = TRUE, completed_at = $1
                 WHERE guild_id = $2 AND week_start = $3 AND challenge_type = $4`,
                [Date.now(), guildDbId, weekStart, challengeType]
            );

            await client.query('COMMIT');

            return {
                success: true,
                completed: true,
                xpReward: parseInt(challenge.xp_reward),
                progress: parseInt(challenge.progress),
                target: parseInt(challenge.target)
            };
        }

        await client.query('COMMIT');

        return {
            success: true,
            completed: false,
            progress: parseInt(challenge.progress),
            target: parseInt(challenge.target)
        };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating guild challenge progress:', error);
        return { success: false };
    } finally {
        client.release();
    }
}

// Delete old guild challenges (cleanup)
async function deleteOldGuildChallenges(beforeTimestamp) {
    try {
        const result = await query(
            'DELETE FROM guild_challenges WHERE week_start < $1',
            [beforeTimestamp]
        );
        return result.rowCount;
    } catch (error) {
        console.error('Error deleting old guild challenges:', error);
        return 0;
    }
}

// ============ GUILD SEASONS ============

// Get current active season
async function getCurrentSeason() {
    try {
        const result = await query(
            'SELECT * FROM guild_seasons WHERE is_active = TRUE ORDER BY season_number DESC LIMIT 1'
        );

        if (result.rows.length === 0) return null;

        return convertKeysToCamelCase(result.rows[0]);
    } catch (error) {
        console.error('Error getting current season:', error);
        return null;
    }
}

// End current season and start a new one
async function endSeasonAndStartNew() {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        const now = Date.now();

        // Get current season
        const currentSeasonResult = await client.query(
            'SELECT * FROM guild_seasons WHERE is_active = TRUE ORDER BY season_number DESC LIMIT 1'
        );

        if (currentSeasonResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, message: 'No active season found' };
        }

        const currentSeason = currentSeasonResult.rows[0];
        const nextSeasonNumber = currentSeason.season_number + 1;

        // Archive all guilds' current progress
        const guildsResult = await client.query(
            'SELECT id, level, experience FROM guilds WHERE level > 1'
        );

        for (const guild of guildsResult.rows) {
            const legacyPoints = Math.floor(guild.level / 10); // 1 point per 10 levels

            await client.query(
                `INSERT INTO guild_season_history
                 (guild_id, season_id, final_level, final_experience, legacy_points_earned, completed_at)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [guild.id, currentSeason.id, guild.level, guild.experience, legacyPoints, now]
            );

            // Update guild's legacy points
            await client.query(
                `UPDATE guilds
                 SET legacy_points = legacy_points + $1
                 WHERE id = $2`,
                [legacyPoints, guild.id]
            );
        }

        // End current season
        await client.query(
            'UPDATE guild_seasons SET is_active = FALSE, end_date = $1 WHERE id = $2',
            [now, currentSeason.id]
        );

        // Start new season
        const newSeasonResult = await client.query(
            `INSERT INTO guild_seasons (season_number, start_date, is_active)
             VALUES ($1, $2, TRUE)
             RETURNING *`,
            [nextSeasonNumber, now]
        );

        // Reset all guilds for new season
        await client.query(
            `UPDATE guilds
             SET level = 1,
                 experience = 0,
                 season_id = $1,
                 season_max_level = 1`,
            [nextSeasonNumber]
        );

        await client.query('COMMIT');

        return {
            success: true,
            oldSeason: currentSeason.season_number,
            newSeason: nextSeasonNumber,
            newSeasonData: convertKeysToCamelCase(newSeasonResult.rows[0])
        };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error ending season:', error);
        return { success: false, message: 'Failed to end season' };
    } finally {
        client.release();
    }
}

// Get guild season history
async function getGuildSeasonHistory(guildId) {
    try {
        const guildResult = await query(
            'SELECT id FROM guilds WHERE guild_id = $1',
            [guildId]
        );

        if (guildResult.rows.length === 0) return [];

        const guildDbId = guildResult.rows[0].id;

        const result = await query(
            `SELECT gsh.*, gs.season_number, gs.start_date, gs.end_date
             FROM guild_season_history gsh
             JOIN guild_seasons gs ON gs.id = gsh.season_id
             WHERE gsh.guild_id = $1
             ORDER BY gs.season_number DESC`,
            [guildDbId]
        );

        return result.rows.map(row => convertKeysToCamelCase(row));
    } catch (error) {
        console.error('Error getting guild season history:', error);
        return [];
    }
}

// Get top guilds for current season (leaderboard)
async function getGuildLeaderboard(limit = 10) {
    try {
        const result = await query(
            `SELECT g.guild_id, g.name, g.level, g.experience, g.legacy_points,
                    COUNT(gm.user_id) as member_count
             FROM guilds g
             LEFT JOIN guild_members gm ON gm.guild_id = g.id
             GROUP BY g.id, g.guild_id, g.name, g.level, g.experience, g.legacy_points
             ORDER BY g.level DESC, g.experience DESC
             LIMIT $1`,
            [limit]
        );

        return result.rows.map(row => convertKeysToCamelCase(row));
    } catch (error) {
        console.error('Error getting guild leaderboard:', error);
        return [];
    }
}

// ============================================================================
// GUILD RANKS FUNCTIONS
// ============================================================================

async function createGuildRank(guildId, rankName, rankOrder, permissions = {}) {
    const client = await query(
        `INSERT INTO guild_ranks (guild_id, rank_name, rank_order, permissions)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [guildId, rankName, rankOrder, JSON.stringify(permissions)]
    );
    return toCamelCase(client.rows[0]);
}

async function deleteGuildRank(guildId, rankName) {
    const result = await query(
        `DELETE FROM guild_ranks WHERE guild_id = $1 AND rank_name = $2 RETURNING id`,
        [guildId, rankName]
    );
    return result.rowCount > 0;
}

async function updateGuildRankPermissions(guildId, rankName, permissions) {
    const result = await query(
        `UPDATE guild_ranks SET permissions = $3 WHERE guild_id = $1 AND rank_name = $2 RETURNING *`,
        [guildId, rankName, JSON.stringify(permissions)]
    );
    return result.rows[0] ? toCamelCase(result.rows[0]) : null;
}

async function getGuildRanks(guildId) {
    const result = await query(
        `SELECT * FROM guild_ranks WHERE guild_id = $1 ORDER BY rank_order ASC`,
        [guildId]
    );
    return result.rows.map(toCamelCase);
}

async function getGuildRankById(rankId) {
    const result = await query(`SELECT * FROM guild_ranks WHERE id = $1`, [rankId]);
    return result.rows[0] ? toCamelCase(result.rows[0]) : null;
}

async function assignMemberRank(guildId, userId, rankId, changedBy) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Get old rank
        const oldRankResult = await client.query(
            `SELECT r.rank_name FROM guild_members gm
             LEFT JOIN guild_ranks r ON gm.rank_id = r.id
             WHERE gm.guild_id = $1 AND gm.user_id = $2`,
            [guildId, userId]
        );
        const oldRank = oldRankResult.rows[0]?.rank_name || null;

        // Get new rank name
        const newRankResult = await client.query(
            `SELECT rank_name FROM guild_ranks WHERE id = $1`,
            [rankId]
        );
        const newRank = newRankResult.rows[0]?.rank_name;

        // Update member rank
        await client.query(
            `UPDATE guild_members SET rank_id = $3 WHERE guild_id = $1 AND user_id = $2`,
            [guildId, userId, rankId]
        );

        // Log the change
        const action = !oldRank ? 'rank_assigned' :
                      (oldRank && !newRank) ? 'rank_removed' :
                      'rank_changed';
        await client.query(
            `INSERT INTO guild_rank_log (guild_id, user_id, action, old_rank, new_rank, changed_by)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [guildId, userId, action, oldRank, newRank, changedBy]
        );

        await client.query('COMMIT');
        return { success: true, oldRank, newRank };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error assigning member rank:', error);
        return { success: false, error: error.message };
    } finally {
        client.release();
    }
}

async function getMemberRank(guildId, userId) {
    const result = await query(
        `SELECT r.* FROM guild_members gm
         JOIN guild_ranks r ON gm.rank_id = r.id
         WHERE gm.guild_id = $1 AND gm.user_id = $2`,
        [guildId, userId]
    );
    return result.rows[0] ? toCamelCase(result.rows[0]) : null;
}

async function logRankChange(guildId, userId, action, oldRank, newRank, changedBy, details = {}) {
    await query(
        `INSERT INTO guild_rank_log (guild_id, user_id, action, old_rank, new_rank, changed_by, details)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [guildId, userId, action, oldRank, newRank, changedBy, JSON.stringify(details)]
    );
}

async function getGuildRankLogs(guildId, limit = 50) {
    const result = await query(
        `SELECT * FROM guild_rank_log WHERE guild_id = $1 ORDER BY timestamp DESC LIMIT $2`,
        [guildId, limit]
    );
    return result.rows.map(toCamelCase);
}

// ============================================================================
// GUILD VAULT FUNCTIONS
// ============================================================================

async function getGuildVaultBalance(guildId) {
    const result = await query(
        `SELECT vault_balance FROM guilds WHERE id = $1`,
        [guildId]
    );
    return result.rows[0]?.vault_balance || 0;
}

async function depositToVault(guildId, userId, amount, reason = null) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Get current balance
        const balanceResult = await client.query(
            `SELECT vault_balance FROM guilds WHERE id = $1`,
            [guildId]
        );
        const balanceBefore = balanceResult.rows[0]?.vault_balance || 0;
        const balanceAfter = balanceBefore + amount;

        // Update vault balance
        await client.query(
            `UPDATE guilds SET vault_balance = $2 WHERE id = $1`,
            [guildId, balanceAfter]
        );

        // Log transaction
        await client.query(
            `INSERT INTO guild_vault_log (guild_id, user_id, action, amount, balance_before, balance_after, reason)
             VALUES ($1, $2, 'deposit', $3, $4, $5, $6)`,
            [guildId, userId, amount, balanceBefore, balanceAfter, reason]
        );

        await client.query('COMMIT');
        return { success: true, balanceBefore, balanceAfter };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error depositing to vault:', error);
        return { success: false, error: error.message };
    } finally {
        client.release();
    }
}

async function withdrawFromVault(guildId, userId, amount, reason = null) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Get current balance
        const balanceResult = await client.query(
            `SELECT vault_balance FROM guilds WHERE id = $1`,
            [guildId]
        );
        const balanceBefore = balanceResult.rows[0]?.vault_balance || 0;

        if (balanceBefore < amount) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Insufficient vault balance' };
        }

        const balanceAfter = balanceBefore - amount;

        // Update vault balance
        await client.query(
            `UPDATE guilds SET vault_balance = $2 WHERE id = $1`,
            [guildId, balanceAfter]
        );

        // Log transaction
        await client.query(
            `INSERT INTO guild_vault_log (guild_id, user_id, action, amount, balance_before, balance_after, reason)
             VALUES ($1, $2, 'withdraw', $3, $4, $5, $6)`,
            [guildId, userId, amount, balanceBefore, balanceAfter, reason]
        );

        // Update daily withdrawal tracking
        const dateKey = new Date().toISOString().split('T')[0];
        await client.query(
            `INSERT INTO guild_vault_daily_withdrawals (guild_id, user_id, date_key, total_withdrawn)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (guild_id, user_id, date_key)
             DO UPDATE SET total_withdrawn = guild_vault_daily_withdrawals.total_withdrawn + $4`,
            [guildId, userId, dateKey, amount]
        );

        await client.query('COMMIT');
        return { success: true, balanceBefore, balanceAfter };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error withdrawing from vault:', error);
        return { success: false, error: error.message };
    } finally {
        client.release();
    }
}

async function getVaultLogs(guildId, limit = 50, userId = null) {
    let sql = `SELECT * FROM guild_vault_log WHERE guild_id = $1`;
    const params = [guildId];

    if (userId) {
        sql += ` AND user_id = $2`;
        params.push(userId);
    }

    sql += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await query(sql, params);
    return result.rows.map(toCamelCase);
}

async function getVaultSettings(guildId) {
    let result = await query(
        `SELECT * FROM guild_vault_settings WHERE guild_id = $1`,
        [guildId]
    );

    if (result.rows.length === 0) {
        // Create default settings
        result = await query(
            `INSERT INTO guild_vault_settings (guild_id) VALUES ($1) RETURNING *`,
            [guildId]
        );
    }

    return toCamelCase(result.rows[0]);
}

async function updateVaultSettings(guildId, settings) {
    const { minRankToWithdraw, dailyWithdrawLimit, requiresApproval } = settings;
    const result = await query(
        `INSERT INTO guild_vault_settings (guild_id, min_rank_to_withdraw, daily_withdraw_limit, requires_approval, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (guild_id)
         DO UPDATE SET
            min_rank_to_withdraw = COALESCE($2, guild_vault_settings.min_rank_to_withdraw),
            daily_withdraw_limit = COALESCE($3, guild_vault_settings.daily_withdraw_limit),
            requires_approval = COALESCE($4, guild_vault_settings.requires_approval),
            updated_at = $5
         RETURNING *`,
        [guildId, minRankToWithdraw, dailyWithdrawLimit, requiresApproval, Date.now()]
    );
    return toCamelCase(result.rows[0]);
}

async function getDailyWithdrawalAmount(guildId, userId) {
    const dateKey = new Date().toISOString().split('T')[0];
    const result = await query(
        `SELECT total_withdrawn FROM guild_vault_daily_withdrawals
         WHERE guild_id = $1 AND user_id = $2 AND date_key = $3`,
        [guildId, userId, dateKey]
    );
    return result.rows[0]?.total_withdrawn || 0;
}

// ============================================================================
// GUILD SHOP & CONTRIBUTIONS FUNCTIONS
// ============================================================================

async function addContributionPoints(guildId, userId, amount, source, details = {}) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Convert guild_id string to database guild ID
        const guildResult = await client.query(
            'SELECT id FROM guilds WHERE guild_id = $1',
            [guildId]
        );

        if (guildResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Guild not found' };
        }

        const guildDbId = guildResult.rows[0].id;

        // Convert Discord ID to database user ID
        const userResult = await client.query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, error: 'User not found' };
        }

        const dbUserId = userResult.rows[0].id;

        // Update member contribution points (guild_members.guild_id is integer FK to guilds.id)
        await client.query(
            `UPDATE guild_members SET contribution_points = contribution_points + $3
             WHERE guild_id = $1 AND user_id = $2`,
            [guildDbId, dbUserId, amount]
        );

        // Log the contribution
        await client.query(
            `INSERT INTO guild_contribution_log (guild_id, user_id, amount, source, details)
             VALUES ($1, $2, $3, $4, $5)`,
            [guildDbId, dbUserId, amount, source, JSON.stringify(details)]
        );

        await client.query('COMMIT');
        return { success: true };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error adding contribution points:', error);
        return { success: false, error: error.message };
    } finally {
        client.release();
    }
}

async function getContributionPoints(guildId, userId) {
    const result = await query(
        `SELECT contribution_points FROM guild_members WHERE guild_id = $1 AND user_id = $2`,
        [guildId, userId]
    );
    return result.rows[0]?.contribution_points || 0;
}

async function getContributionLogs(guildId, userId = null, limit = 50) {
    let sql = `SELECT * FROM guild_contribution_log WHERE guild_id = $1`;
    const params = [guildId];

    if (userId) {
        sql += ` AND user_id = $2`;
        params.push(userId);
    }

    sql += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await query(sql, params);
    return result.rows.map(toCamelCase);
}

async function getShopItems(minLevel = 1, includeInactive = false) {
    let sql = `SELECT * FROM guild_shop_items WHERE required_level <= $1`;
    const params = [minLevel];

    if (!includeInactive) {
        sql += ` AND is_active = true`;
    }

    sql += ` ORDER BY cost ASC`;

    const result = await query(sql, params);
    return result.rows.map(toCamelCase);
}

async function purchaseShopItem(guildId, userId, itemKey, costPaid) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Get item details
        const itemResult = await client.query(
            `SELECT * FROM guild_shop_items WHERE item_key = $1`,
            [itemKey]
        );
        const item = itemResult.rows[0];

        if (!item) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Item not found' };
        }

        // Check if user has enough points
        const pointsResult = await client.query(
            `SELECT contribution_points FROM guild_members WHERE guild_id = $1 AND user_id = $2`,
            [guildId, userId]
        );
        const currentPoints = pointsResult.rows[0]?.contribution_points || 0;

        if (currentPoints < costPaid) {
            await client.query('ROLLBACK');
            return { success: false, error: 'Insufficient contribution points' };
        }

        // Deduct points
        await client.query(
            `UPDATE guild_members SET contribution_points = contribution_points - $3
             WHERE guild_id = $1 AND user_id = $2`,
            [guildId, userId, costPaid]
        );

        // Log the purchase
        await client.query(
            `INSERT INTO guild_contribution_log (guild_id, user_id, amount, source, details)
             VALUES ($1, $2, $3, 'shop_purchase', $4)`,
            [guildId, userId, -costPaid, JSON.stringify({ item_key: itemKey, item_name: item.item_name })]
        );

        // Calculate expiry for temporary items
        let expiresAt = null;
        if (item.duration_hours) {
            expiresAt = Date.now() + (item.duration_hours * 60 * 60 * 1000);
        }

        // Get max uses from effect if consumable
        let maxUses = null;
        if (item.item_type === 'consumable' && item.effect?.uses) {
            maxUses = item.effect.uses;
        }

        // Add item to purchases
        const purchaseResult = await client.query(
            `INSERT INTO guild_shop_purchases (guild_id, user_id, item_key, cost_paid, expires_at, max_uses)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [guildId, userId, itemKey, costPaid, expiresAt, maxUses]
        );

        await client.query('COMMIT');
        return { success: true, purchase: toCamelCase(purchaseResult.rows[0]), item: toCamelCase(item) };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error purchasing shop item:', error);
        return { success: false, error: error.message };
    } finally {
        client.release();
    }
}

async function getUserPurchases(userId, guildId = null, includeExpired = false) {
    let sql = `
        SELECT p.*, i.item_name, i.description, i.item_type, i.effect, i.duration_hours
        FROM guild_shop_purchases p
        JOIN guild_shop_items i ON p.item_key = i.item_key
        WHERE p.user_id = $1`;
    const params = [userId];

    if (guildId) {
        sql += ` AND p.guild_id = $2`;
        params.push(guildId);
    }

    if (!includeExpired) {
        sql += ` AND p.is_active = true`;
        sql += ` AND (p.expires_at IS NULL OR p.expires_at > $${params.length + 1})`;
        params.push(Date.now());
    }

    sql += ` ORDER BY p.purchased_at DESC`;

    const result = await query(sql, params);
    return result.rows.map(toCamelCase);
}

async function getActivePurchases(userId, itemType = null) {
    let sql = `
        SELECT p.*, i.item_name, i.item_type, i.effect
        FROM guild_shop_purchases p
        JOIN guild_shop_items i ON p.item_key = i.item_key
        WHERE p.user_id = $1 AND p.is_active = true
        AND (p.expires_at IS NULL OR p.expires_at > $2)`;
    const params = [userId, Date.now()];

    if (itemType) {
        sql += ` AND i.item_type = $3`;
        params.push(itemType);
    }

    const result = await query(sql, params);
    return result.rows.map(toCamelCase);
}

async function useConsumableItem(purchaseId) {
    const result = await query(
        `UPDATE guild_shop_purchases
         SET times_used = times_used + 1,
             is_active = CASE
                 WHEN max_uses IS NOT NULL AND times_used + 1 >= max_uses THEN false
                 ELSE is_active
             END
         WHERE id = $1 AND is_active = true
         RETURNING *`,
        [purchaseId]
    );
    return result.rows[0] ? toCamelCase(result.rows[0]) : null;
}

async function deactivateExpiredItems() {
    const result = await query(
        `UPDATE guild_shop_purchases
         SET is_active = false
         WHERE is_active = true AND expires_at IS NOT NULL AND expires_at <= $1
         RETURNING id`,
        [Date.now()]
    );
    return result.rowCount;
}

// ============================================================================
// GUILD EVENTS FUNCTIONS
// ============================================================================

async function createGuildEvent(eventData) {
    const { eventType, eventName, description, startTime, endTime, minGuildLevel, requirements, rewards } = eventData;
    const result = await query(
        `INSERT INTO guild_events (event_type, event_name, description, start_time, end_time, min_guild_level, requirements, rewards)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [eventType, eventName, description, startTime, endTime, minGuildLevel, JSON.stringify(requirements), JSON.stringify(rewards)]
    );
    return toCamelCase(result.rows[0]);
}

async function getActiveGuildEvents(minGuildLevel = 1) {
    const now = Date.now();
    const result = await query(
        `SELECT * FROM guild_events
         WHERE is_active = true
         AND start_time <= $1
         AND end_time > $1
         AND min_guild_level <= $2
         ORDER BY end_time ASC`,
        [now, minGuildLevel]
    );
    return result.rows.map(toCamelCase);
}

async function joinGuildEvent(eventId, guildId) {
    try {
        const result = await query(
            `INSERT INTO guild_event_participation (event_id, guild_id)
             VALUES ($1, $2)
             ON CONFLICT (event_id, guild_id) DO NOTHING
             RETURNING *`,
            [eventId, guildId]
        );
        return result.rows[0] ? toCamelCase(result.rows[0]) : null;
    } catch (error) {
        console.error('Error joining guild event:', error);
        return null;
    }
}

async function getEventParticipation(eventId, guildId) {
    const result = await query(
        `SELECT * FROM guild_event_participation WHERE event_id = $1 AND guild_id = $2`,
        [eventId, guildId]
    );
    return result.rows[0] ? toCamelCase(result.rows[0]) : null;
}

async function addEventContribution(eventId, guildId, userId, contributionType, contributionValue) {
    await query(
        `INSERT INTO guild_event_contributions (event_id, guild_id, user_id, contribution_type, contribution_value)
         VALUES ($1, $2, $3, $4, $5)`,
        [eventId, guildId, userId, contributionType, contributionValue]
    );
}

async function updateEventProgress(eventId, guildId, progress, finalScore = null) {
    const result = await query(
        `UPDATE guild_event_participation
         SET progress = $3, final_score = COALESCE($4, final_score)
         WHERE event_id = $1 AND guild_id = $2
         RETURNING *`,
        [eventId, guildId, JSON.stringify(progress), finalScore]
    );
    return result.rows[0] ? toCamelCase(result.rows[0]) : null;
}

async function completeGuildEvent(eventId, guildId) {
    const result = await query(
        `UPDATE guild_event_participation
         SET completed = true, completed_at = $3
         WHERE event_id = $1 AND guild_id = $2
         RETURNING *`,
        [eventId, guildId, Date.now()]
    );
    return result.rows[0] ? toCamelCase(result.rows[0]) : null;
}

async function claimEventRewards(eventId, guildId) {
    const result = await query(
        `UPDATE guild_event_participation
         SET rewards_claimed = true
         WHERE event_id = $1 AND guild_id = $2 AND completed = true
         RETURNING *`,
        [eventId, guildId]
    );
    return result.rows[0] ? toCamelCase(result.rows[0]) : null;
}

async function getEventLeaderboard(eventId, limit = 25) {
    const result = await query(
        `SELECT
            p.*,
            g.name as guild_name,
            g.tag as guild_tag
         FROM guild_event_participation p
         JOIN guilds g ON p.guild_id = g.id
         WHERE p.event_id = $1
         ORDER BY p.final_score DESC, p.completed_at ASC
         LIMIT $2`,
        [eventId, limit]
    );
    return result.rows.map(toCamelCase);
}

// ============================================================================
// LEADERBOARD REWARDS FUNCTIONS
// ============================================================================

async function getLeaderboardRewards(leaderboardType) {
    const result = await query(
        `SELECT * FROM guild_leaderboard_rewards
         WHERE leaderboard_type = $1 AND is_active = true
         ORDER BY rank_min ASC`,
        [leaderboardType]
    );
    return result.rows.map(toCamelCase);
}

async function distributeSeasonRewards(seasonId) {
    // This would be called at season end
    // Gets top guilds and distributes rewards based on rank
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Get season leaderboard
        const leaderboard = await getGuildLeaderboard(seasonId, 100);
        const rewards = await getLeaderboardRewards('season');

        const distributed = [];

        for (let i = 0; i < leaderboard.length; i++) {
            const guild = leaderboard[i];
            const rank = i + 1;

            // Find applicable reward tier
            const rewardTier = rewards.find(r => rank >= r.rankMin && rank <= r.rankMax);
            if (!rewardTier) continue;

            // Record reward claim
            await client.query(
                `INSERT INTO guild_reward_claims (guild_id, leaderboard_type, period_identifier, final_rank, rewards_given)
                 VALUES ($1, 'season', $2, $3, $4)
                 ON CONFLICT (guild_id, leaderboard_type, period_identifier) DO NOTHING`,
                [guild.guildId, `season_${seasonId}`, rank, rewardTier.rewardValue]
            );

            distributed.push({ guildId: guild.guildId, rank, rewards: rewardTier.rewardValue });
        }

        await client.query('COMMIT');
        return { success: true, distributed };
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error distributing season rewards:', error);
        return { success: false, error: error.message };
    } finally {
        client.release();
    }
}

async function distributeWeeklyRewards() {
    // Similar to season rewards but for weekly leaderboard
    const weekIdentifier = `week_${new Date().toISOString().split('T')[0]}`;

    // Implementation similar to distributeSeasonRewards
    // This is a placeholder - would need actual weekly leaderboard logic
    return { success: true, weekIdentifier };
}

async function getRewardClaimHistory(guildId, limit = 10) {
    const result = await query(
        `SELECT * FROM guild_reward_claims
         WHERE guild_id = $1
         ORDER BY claimed_at DESC
         LIMIT $2`,
        [guildId, limit]
    );
    return result.rows.map(toCamelCase);
}

module.exports = {
    // Core guild functions
    getGuildByName,
    getUserGuildDB,
    createGuildDB,
    joinGuildDB,
    leaveGuildDB,
    donateToGuildTreasury,
    getGuildMembers,
    // Guild Levels
    addGuildExperience,
    updateGuildLevel,
    getGuildWithLevel,
    getGuildByNameWithLevel,
    // Guild Challenges
    initializeGuildChallenges,
    getGuildChallenges,
    updateGuildChallengeProgress,
    deleteOldGuildChallenges,
    // Guild Seasons
    getCurrentSeason,
    endSeasonAndStartNew,
    getGuildSeasonHistory,
    getGuildLeaderboard,
    // Guild Ranks
    createGuildRank,
    deleteGuildRank,
    updateGuildRankPermissions,
    getGuildRanks,
    getGuildRankById,
    assignMemberRank,
    getMemberRank,
    logRankChange,
    getGuildRankLogs,
    // Guild Vault
    getGuildVaultBalance,
    depositToVault,
    withdrawFromVault,
    getVaultLogs,
    getVaultSettings,
    updateVaultSettings,
    getDailyWithdrawalAmount,
    // Guild Shop & Contributions
    addContributionPoints,
    getContributionPoints,
    getContributionLogs,
    getShopItems,
    purchaseShopItem,
    getUserPurchases,
    getActivePurchases,
    useConsumableItem,
    deactivateExpiredItems,
    // Guild Events
    createGuildEvent,
    getActiveGuildEvents,
    joinGuildEvent,
    getEventParticipation,
    addEventContribution,
    updateEventProgress,
    completeGuildEvent,
    claimEventRewards,
    getEventLeaderboard,
    // Leaderboard Rewards
    getLeaderboardRewards,
    distributeSeasonRewards,
    distributeWeeklyRewards,
    getRewardClaimHistory
};
