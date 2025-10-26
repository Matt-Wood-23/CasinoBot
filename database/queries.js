const { query, getClient } = require('./connection');

// In-memory storage for pending notifications (cleared on retrieval)
// This mimics the old JSON behavior where notifications were stored temporarily
const pendingNotifications = new Map();

// Initialize database - called on bot startup
async function loadUserData() {
    try {
        const result = await query('SELECT COUNT(*) FROM users');
        console.log(`Database loaded successfully with ${result.rows[0].count} users`);
    } catch (error) {
        console.error('Error loading user data:', error);
        throw error;
    }
}

// No longer needed with database (auto-saves), but keeping for compatibility
async function saveUserData() {
    // Database auto-saves, so this is a no-op
    console.log('Database auto-save (no action needed)');
}

// Get or create user and return money
async function getUserMoney(userId) {
    try {
        // Try to get existing user
        let result = await query(
            'SELECT money FROM users WHERE discord_id = $1',
            [userId]
        );

        if (result.rows.length === 0) {
            // User doesn't exist, create new user
            const client = await getClient();
            try {
                await client.query('BEGIN');

                // Insert user
                const userResult = await client.query(
                    `INSERT INTO users (discord_id, money, last_daily, last_work, credit_score)
                     VALUES ($1, 500, 0, 0, 500)
                     RETURNING id, money`,
                    [userId]
                );

                const newUserId = userResult.rows[0].id;

                // Insert default statistics
                await client.query(
                    `INSERT INTO user_statistics (user_id)
                     VALUES ($1)`,
                    [newUserId]
                );

                await client.query('COMMIT');
                console.log(`Created new user: ${userId}`);

                return 500; // Default starting money
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
        }

        return parseInt(result.rows[0].money);
    } catch (error) {
        console.error('Error getting user money:', error);
        throw error;
    }
}

// Set user money
async function setUserMoney(userId, amount) {
    try {
        await getUserMoney(userId); // Ensure user exists

        const oldMoneyResult = await query(
            'SELECT money FROM users WHERE discord_id = $1',
            [userId]
        );
        const oldMoney = parseInt(oldMoneyResult.rows[0].money);
        const newMoney = Math.max(0, Math.floor(amount));

        // If money increased (winnings), check for loan deduction
        if (newMoney > oldMoney) {
            // Check for active loan
            const loanResult = await query(
                `SELECT l.id, l.amount_owed FROM loans l
                 JOIN users u ON u.id = l.user_id
                 WHERE u.discord_id = $1 AND l.is_active = TRUE
                 ORDER BY l.id DESC LIMIT 1`,
                [userId]
            );

            if (loanResult.rows.length > 0) {
                const { deductFromWinnings } = require('../utils/loanSystem');
                const winnings = newMoney - oldMoney;

                const { deducted, remaining } = await deductFromWinnings(userId, winnings);

                if (deducted > 0) {
                    const finalMoney = Math.max(0, Math.floor(oldMoney + remaining));
                    await query(
                        'UPDATE users SET money = $1 WHERE discord_id = $2',
                        [finalMoney, userId]
                    );
                    console.log(`Auto-deducted ${deducted} from ${userId}'s winnings for loan payment`);
                    return;
                }
            }
        }

        // Normal money update (no loan deduction)
        await query(
            'UPDATE users SET money = $1 WHERE discord_id = $2',
            [newMoney, userId]
        );
    } catch (error) {
        console.error('Error setting user money:', error);
        throw error;
    }
}

// Record game result
async function recordGameResult(userId, gameType, bet, winnings, result, details = {}, additionalData = {}) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Ensure user exists
        await getUserMoney(userId);

        // Get user ID
        const userResult = await client.query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );
        const dbUserId = userResult.rows[0].id;

        const timestamp = Date.now();
        const recordId = timestamp + Math.random();

        // Apply active boost effects
        const { hasActiveBoost, getActiveBoost, consumeBoost } = require('../utils/shop');
        const boostsApplied = [];
        let modifiedWinnings = Math.floor(winnings);

        // Check for Win Multiplier boost (25% bonus on wins)
        if ((result === 'win' || result === 'blackjack') && hasActiveBoost(userId, 'win_multiplier')) {
            const boost = getActiveBoost(userId, 'win_multiplier');
            const bonusAmount = Math.floor(winnings * (boost.value / 100));
            modifiedWinnings += bonusAmount;

            // Add money for the bonus
            const currentMoney = await getUserMoney(userId);
            await setUserMoney(userId, currentMoney + bonusAmount);

            await consumeBoost(userId, 'win_multiplier');
            boostsApplied.push({ type: 'win_multiplier', bonus: bonusAmount });
        }

        // Check for Insurance boost (50% refund on loss)
        if (result === 'lose' && hasActiveBoost(userId, 'insurance')) {
            const boost = getActiveBoost(userId, 'insurance');
            const refundAmount = Math.floor(bet * (boost.value / 100));

            // Refund money
            const currentMoney = await getUserMoney(userId);
            await setUserMoney(userId, currentMoney + refundAmount);

            modifiedWinnings += refundAmount;
            await consumeBoost(userId, 'insurance');
            boostsApplied.push({ type: 'insurance', refund: refundAmount });
        }

        // Insert game history
        await client.query(
            `INSERT INTO game_history
             (user_id, game_type, bet, winnings, result, details, boosts_applied, original_winnings, timestamp, record_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
                dbUserId,
                gameType,
                Math.floor(bet),
                modifiedWinnings,
                result,
                JSON.stringify(details),
                boostsApplied.length > 0 ? JSON.stringify(boostsApplied) : null,
                boostsApplied.length > 0 ? Math.floor(winnings) : null,
                timestamp,
                recordId
            ]
        );

        // Keep only last 50 games per user
        await client.query(
            `DELETE FROM game_history
             WHERE id IN (
                 SELECT id FROM game_history
                 WHERE user_id = $1
                 ORDER BY timestamp DESC
                 OFFSET 50
             )`,
            [dbUserId]
        );

        // Update statistics
        const statUpdates = {
            games_played: 1,
            total_wagered: Math.floor(bet),
            total_winnings: modifiedWinnings + Math.floor(bet)
        };

        if (result === 'win' || result === 'blackjack') {
            statUpdates.games_won = 1;
        }

        if (result === 'blackjack') {
            statUpdates.blackjacks = 1;
        }

        if (details.handsPlayed) {
            statUpdates.hands_played = details.handsPlayed;
        }

        // Game-specific stats
        const gameStatMapping = {
            slots: { spins: 'slots_spins', wins: 'slots_wins' },
            three_card_poker: { games: 'three_card_poker_games', wins: 'three_card_poker_wins' },
            roulette: { spins: 'roulette_spins', wins: 'roulette_wins' },
            craps: { games: 'craps_games', wins: 'craps_wins' },
            war: { games: 'war_games', wins: 'war_wins' },
            coinflip: { games: 'coinflip_games', wins: 'coinflip_wins' },
            horserace: { games: 'horserace_games', wins: 'horserace_wins' },
            crash: { games: 'crash_games', wins: 'crash_wins' },
            hilo: { games: 'hilo_games', wins: 'hilo_wins' },
            bingo: { games: 'bingo_games', wins: 'bingo_wins' }
        };

        if (gameStatMapping[gameType]) {
            const mapping = gameStatMapping[gameType];
            if (mapping.spins) statUpdates[mapping.spins] = 1;
            if (mapping.games) statUpdates[mapping.games] = 1;

            if (result === 'win' && mapping.wins) {
                statUpdates[mapping.wins] = 1;
            }
        }

        // Build dynamic UPDATE query
        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;

        for (const [field, increment] of Object.entries(statUpdates)) {
            updateFields.push(`${field} = ${field} + $${paramIndex}`);
            updateValues.push(increment);
            paramIndex++;
        }

        // Update biggest win
        if ((result === 'win' || result === 'blackjack') && modifiedWinnings > 0) {
            updateFields.push(`biggest_win = GREATEST(biggest_win, $${paramIndex})`);
            updateValues.push(modifiedWinnings);
            paramIndex++;
        }

        // Update biggest loss
        if (winnings < 0 && Math.abs(winnings) > 0) {
            updateFields.push(`biggest_loss = GREATEST(biggest_loss, $${paramIndex})`);
            updateValues.push(Math.abs(winnings));
            paramIndex++;
        }

        // Hi-Lo max streak
        if (gameType === 'hilo' && details.maxStreak) {
            updateFields.push(`hilo_max_streak = GREATEST(hilo_max_streak, $${paramIndex})`);
            updateValues.push(details.maxStreak);
            paramIndex++;
        }

        // Roulette additional data
        if (gameType === 'roulette' && additionalData) {
            if (additionalData.betsPlaced) {
                updateFields.push(`roulette_bets_placed = roulette_bets_placed + $${paramIndex}`);
                updateValues.push(additionalData.betsPlaced);
                paramIndex++;
            }
        }

        updateValues.push(dbUserId);

        await client.query(
            `UPDATE user_statistics SET ${updateFields.join(', ')}
             WHERE user_id = $${paramIndex}`,
            updateValues
        );

        // Check achievements and update challenges
        const { checkAchievements } = require('../utils/achievements');
        const { updateChallengeProgress } = require('../utils/challenges');

        const newAchievements = await checkAchievements(userId, {
            gameType,
            bet: Math.floor(bet),
            winnings: Math.floor(winnings),
            result,
            details
        });

        const completedChallenges = await updateChallengeProgress(userId, {
            gameType,
            bet: Math.floor(bet),
            winnings: Math.floor(winnings),
            result,
            handsPlayed: details.handsPlayed
        });

        // Store notifications in memory
        if (!pendingNotifications.has(userId)) {
            pendingNotifications.set(userId, { achievements: [], challenges: [] });
        }

        const notifications = pendingNotifications.get(userId);
        if (newAchievements.length > 0) {
            notifications.achievements.push(...newAchievements);
        }
        if (completedChallenges.length > 0) {
            notifications.challenges.push(...completedChallenges);
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error recording game result:', error);
        throw error;
    } finally {
        client.release();
    }
}

// Check if user can claim daily
async function canClaimDaily(userId) {
    await getUserMoney(userId); // Ensure user exists

    const result = await query(
        'SELECT last_daily FROM users WHERE discord_id = $1',
        [userId]
    );

    const lastDaily = parseInt(result.rows[0].last_daily) || 0;
    const now = Date.now();
    const timeSinceLastDaily = now - lastDaily;
    const oneDayInMs = 24 * 60 * 60 * 1000;

    return timeSinceLastDaily >= oneDayInMs;
}

// Set last daily timestamp
async function setLastDaily(userId) {
    await getUserMoney(userId); // Ensure user exists

    await query(
        'UPDATE users SET last_daily = $1 WHERE discord_id = $2',
        [Date.now(), userId]
    );
}

// Set last work timestamp
async function setLastWork(userId) {
    await getUserMoney(userId); // Ensure user exists

    await query(
        'UPDATE users SET last_work = $1 WHERE discord_id = $2',
        [Date.now(), userId]
    );
}

// Get time until next daily
async function getTimeUntilNextDaily(userId) {
    const result = await query(
        'SELECT last_daily FROM users WHERE discord_id = $1',
        [userId]
    );

    if (result.rows.length === 0) return 0;

    const lastDaily = parseInt(result.rows[0].last_daily) || 0;
    const now = Date.now();
    const oneDayInMs = 24 * 60 * 60 * 1000;
    const timeUntilNext = oneDayInMs - (now - lastDaily);

    return Math.max(0, timeUntilNext);
}

// Get all user data (for leaderboards, etc.)
async function getAllUserData() {
    try {
        const result = await query(
            `SELECT
                u.discord_id,
                u.money,
                u.last_daily,
                u.last_work,
                u.credit_score,
                u.gifts_received,
                u.gifts_sent,
                u.total_gifts_received,
                u.total_gifts_sent,
                row_to_json(s.*) as statistics
             FROM users u
             LEFT JOIN user_statistics s ON s.user_id = u.id`
        );

        // Convert to old format: { discordId: userData }
        const userData = {};
        for (const row of result.rows) {
            userData[row.discord_id] = {
                money: parseInt(row.money),
                lastDaily: parseInt(row.last_daily),
                lastWork: parseInt(row.last_work),
                creditScore: parseInt(row.credit_score),
                giftsReceived: parseInt(row.gifts_received),
                giftsSent: parseInt(row.gifts_sent),
                totalGiftsReceived: parseInt(row.total_gifts_received),
                totalGiftsSent: parseInt(row.total_gifts_sent),
                statistics: row.statistics || {}
            };
        }

        return userData;
    } catch (error) {
        console.error('Error getting all user data:', error);
        throw error;
    }
}

// Get single user data
async function getUserData(userId) {
    try {
        const result = await query(
            `SELECT
                u.*,
                row_to_json(s.*) as statistics,
                (SELECT json_agg(gh.* ORDER BY gh.timestamp DESC)
                 FROM game_history gh
                 WHERE gh.user_id = u.id) as game_history,
                (SELECT row_to_json(l.*)
                 FROM loans l
                 WHERE l.user_id = u.id AND l.is_active = TRUE
                 ORDER BY l.id DESC LIMIT 1) as active_loan,
                (SELECT json_agg(l.* ORDER BY l.taken_at DESC)
                 FROM loans l
                 WHERE l.user_id = u.id) as loan_history
             FROM users u
             LEFT JOIN user_statistics s ON s.user_id = u.id
             WHERE u.discord_id = $1`,
            [userId]
        );

        if (result.rows.length === 0) return null;

        const row = result.rows[0];

        return {
            money: parseInt(row.money),
            lastDaily: parseInt(row.last_daily),
            lastWork: parseInt(row.last_work),
            creditScore: parseInt(row.credit_score),
            giftsReceived: parseInt(row.gifts_received),
            giftsSent: parseInt(row.gifts_sent),
            totalGiftsReceived: parseInt(row.total_gifts_received),
            totalGiftsSent: parseInt(row.total_gifts_sent),
            statistics: row.statistics || {},
            gameHistory: row.game_history || [],
            activeLoan: row.active_loan || null,
            loanHistory: row.loan_history || []
        };
    } catch (error) {
        console.error('Error getting user data:', error);
        throw error;
    }
}

// Update user gifts
async function updateUserGifts(senderId, receiverId, amount) {
    await getUserMoney(senderId); // Ensure both users exist
    await getUserMoney(receiverId);

    await query(
        'UPDATE users SET gifts_sent = gifts_sent + 1, total_gifts_sent = total_gifts_sent + $1 WHERE discord_id = $2',
        [amount, senderId]
    );

    await query(
        'UPDATE users SET gifts_received = gifts_received + 1, total_gifts_received = total_gifts_received + $1 WHERE discord_id = $2',
        [amount, receiverId]
    );
}

// Clean user data (not needed with database, but keeping for compatibility)
function cleanUserData() {
    console.log('cleanUserData() called - not needed with database (data integrity ensured by schema)');
}

// Get and clear pending notifications
function getPendingNotifications(userId) {
    if (!pendingNotifications.has(userId)) {
        return { achievements: [], challenges: [] };
    }

    const notifications = pendingNotifications.get(userId);
    pendingNotifications.delete(userId);

    return notifications;
}

// ============ INVENTORY & SHOP FUNCTIONS ============

// Add item to user's inventory
async function addToInventory(userId, itemId) {
    try {
        await getUserMoney(userId); // Ensure user exists

        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );
        const dbUserId = userResult.rows[0].id;

        // Check if item already exists
        const existingItem = await query(
            'SELECT id, quantity FROM user_inventory WHERE user_id = $1 AND item_id = $2',
            [dbUserId, itemId]
        );

        if (existingItem.rows.length > 0) {
            // Update quantity
            await query(
                'UPDATE user_inventory SET quantity = quantity + 1 WHERE id = $1',
                [existingItem.rows[0].id]
            );
        } else {
            // Insert new item
            await query(
                `INSERT INTO user_inventory (user_id, item_id, quantity, acquired_at)
                 VALUES ($1, $2, 1, $3)`,
                [dbUserId, itemId, Date.now()]
            );
        }
    } catch (error) {
        console.error('Error adding to inventory:', error);
        throw error;
    }
}

// Remove item from user's inventory
async function removeFromInventory(userId, itemId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const dbUserId = userResult.rows[0].id;

        // Decrease quantity or remove if quantity = 1
        const result = await query(
            `UPDATE user_inventory
             SET quantity = quantity - 1
             WHERE user_id = $1 AND item_id = $2 AND quantity > 0
             RETURNING quantity`,
            [dbUserId, itemId]
        );

        if (result.rows.length === 0) return false;

        // If quantity is now 0, delete the row
        if (result.rows[0].quantity === 0) {
            await query(
                'DELETE FROM user_inventory WHERE user_id = $1 AND item_id = $2',
                [dbUserId, itemId]
            );
        }

        return true;
    } catch (error) {
        console.error('Error removing from inventory:', error);
        throw error;
    }
}

// Get user's inventory
async function getUserInventory(userId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return [];

        const dbUserId = userResult.rows[0].id;

        const result = await query(
            `SELECT item_id, quantity, acquired_at
             FROM user_inventory
             WHERE user_id = $1 AND quantity > 0
             ORDER BY acquired_at DESC`,
            [dbUserId]
        );

        return result.rows.map(row => ({
            itemId: row.item_id,
            quantity: parseInt(row.quantity),
            acquiredAt: parseInt(row.acquired_at)
        }));
    } catch (error) {
        console.error('Error getting user inventory:', error);
        throw error;
    }
}

// Add boost to user's active boosts
async function addBoost(userId, boostType, value, uses = 1) {
    try {
        await getUserMoney(userId); // Ensure user exists

        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );
        const dbUserId = userResult.rows[0].id;

        await query(
            `INSERT INTO user_boosts (user_id, boost_type, boost_value, uses_remaining, acquired_at)
             VALUES ($1, $2, $3, $4, $5)`,
            [dbUserId, boostType, value, uses, Date.now()]
        );
    } catch (error) {
        console.error('Error adding boost:', error);
        throw error;
    }
}

// Check if user has an active boost
async function hasActiveBoost(userId, boostType) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const dbUserId = userResult.rows[0].id;

        const result = await query(
            `SELECT COUNT(*) as count
             FROM user_boosts
             WHERE user_id = $1 AND boost_type = $2 AND uses_remaining > 0`,
            [dbUserId, boostType]
        );

        return parseInt(result.rows[0].count) > 0;
    } catch (error) {
        console.error('Error checking active boost:', error);
        return false;
    }
}

// Get active boost of a specific type
async function getActiveBoost(userId, boostType) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return null;

        const dbUserId = userResult.rows[0].id;

        const result = await query(
            `SELECT id, boost_type, boost_value, uses_remaining, acquired_at
             FROM user_boosts
             WHERE user_id = $1 AND boost_type = $2 AND uses_remaining > 0
             ORDER BY acquired_at ASC
             LIMIT 1`,
            [dbUserId, boostType]
        );

        if (result.rows.length === 0) return null;

        return {
            id: result.rows[0].id,
            type: result.rows[0].boost_type,
            value: parseInt(result.rows[0].boost_value),
            usesRemaining: parseInt(result.rows[0].uses_remaining),
            acquiredAt: parseInt(result.rows[0].acquired_at)
        };
    } catch (error) {
        console.error('Error getting active boost:', error);
        return null;
    }
}

// Consume/use a boost (decrement uses or remove)
async function consumeBoost(userId, boostType) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const dbUserId = userResult.rows[0].id;

        // Get the oldest boost of this type
        const boostResult = await query(
            `SELECT id, uses_remaining
             FROM user_boosts
             WHERE user_id = $1 AND boost_type = $2 AND uses_remaining > 0
             ORDER BY acquired_at ASC
             LIMIT 1`,
            [dbUserId, boostType]
        );

        if (boostResult.rows.length === 0) return false;

        const boost = boostResult.rows[0];

        // Decrement uses
        const newUses = boost.uses_remaining - 1;

        if (newUses <= 0) {
            // Remove boost if no uses left
            await query(
                'DELETE FROM user_boosts WHERE id = $1',
                [boost.id]
            );
        } else {
            // Update uses remaining
            await query(
                'UPDATE user_boosts SET uses_remaining = $1 WHERE id = $2',
                [newUses, boost.id]
            );
        }

        return true;
    } catch (error) {
        console.error('Error consuming boost:', error);
        return false;
    }
}

// Get all active boosts for a user
async function getUserBoosts(userId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return [];

        const dbUserId = userResult.rows[0].id;

        const result = await query(
            `SELECT id, boost_type, boost_value, uses_remaining, acquired_at
             FROM user_boosts
             WHERE user_id = $1 AND uses_remaining > 0
             ORDER BY acquired_at DESC`,
            [dbUserId]
        );

        return result.rows.map(row => ({
            id: row.id,
            type: row.boost_type,
            value: parseInt(row.boost_value),
            usesRemaining: parseInt(row.uses_remaining),
            acquiredAt: parseInt(row.acquired_at)
        }));
    } catch (error) {
        console.error('Error getting user boosts:', error);
        return [];
    }
}

// ============ PROPERTIES FUNCTIONS ============

// Purchase a property
async function purchasePropertyDB(userId, propertyId) {
    try {
        await getUserMoney(userId); // Ensure user exists

        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );
        const dbUserId = userResult.rows[0].id;

        await query(
            `INSERT INTO user_properties (user_id, property_id, upgrade_level, last_collected, purchased_at)
             VALUES ($1, $2, 0, 0, $3)`,
            [dbUserId, propertyId, Date.now()]
        );

        return true;
    } catch (error) {
        console.error('Error purchasing property:', error);
        return false;
    }
}

// Get user's properties
async function getUserPropertiesDB(userId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return [];

        const dbUserId = userResult.rows[0].id;

        const result = await query(
            `SELECT property_id, upgrade_level, last_collected, purchased_at
             FROM user_properties
             WHERE user_id = $1
             ORDER BY purchased_at DESC`,
            [dbUserId]
        );

        return result.rows.map(row => ({
            propertyId: row.property_id,
            upgradeLevel: parseInt(row.upgrade_level),
            lastCollected: parseInt(row.last_collected),
            purchasedAt: parseInt(row.purchased_at)
        }));
    } catch (error) {
        console.error('Error getting user properties:', error);
        return [];
    }
}

// Upgrade a property
async function upgradePropertyDB(userId, propertyId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const dbUserId = userResult.rows[0].id;

        const result = await query(
            `UPDATE user_properties
             SET upgrade_level = upgrade_level + 1
             WHERE user_id = $1 AND property_id = $2
             RETURNING upgrade_level`,
            [dbUserId, propertyId]
        );

        return result.rows.length > 0 ? parseInt(result.rows[0].upgrade_level) : false;
    } catch (error) {
        console.error('Error upgrading property:', error);
        return false;
    }
}

// Update property last collected time
async function updatePropertyCollectionTime(userId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const dbUserId = userResult.rows[0].id;
        const now = Date.now();

        await query(
            `UPDATE user_properties
             SET last_collected = $1
             WHERE user_id = $2`,
            [now, dbUserId]
        );

        return true;
    } catch (error) {
        console.error('Error updating property collection time:', error);
        return false;
    }
}

// Get property last collected time (for any property, they all share the same cooldown)
async function getPropertyLastCollected(userId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return 0;

        const dbUserId = userResult.rows[0].id;

        const result = await query(
            `SELECT MAX(last_collected) as last_collected
             FROM user_properties
             WHERE user_id = $1`,
            [dbUserId]
        );

        if (result.rows.length === 0 || result.rows[0].last_collected === null) {
            return 0;
        }

        return parseInt(result.rows[0].last_collected);
    } catch (error) {
        console.error('Error getting property last collected:', error);
        return 0;
    }
}

// ============ VIP FUNCTIONS ============

// Purchase or renew VIP
async function purchaseVIPDB(userId, tier, expiresAt, isRenewal = false) {
    try {
        await getUserMoney(userId); // Ensure user exists

        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );
        const dbUserId = userResult.rows[0].id;

        // Check if user already has VIP
        const existing = await query(
            'SELECT tier, renewal_count FROM user_vip WHERE user_id = $1',
            [dbUserId]
        );

        if (existing.rows.length > 0) {
            // Update existing VIP
            const renewalCount = isRenewal ? (existing.rows[0].renewal_count + 1) : 0;
            await query(
                `UPDATE user_vip
                 SET tier = $1, expires_at = $2, activated_at = $3, renewal_count = $4, is_active = TRUE
                 WHERE user_id = $5`,
                [tier, expiresAt, Date.now(), renewalCount, dbUserId]
            );
        } else {
            // Insert new VIP
            await query(
                `INSERT INTO user_vip (user_id, tier, activated_at, expires_at, renewal_count, last_weekly_bonus, is_active)
                 VALUES ($1, $2, $3, $4, 0, 0, TRUE)`,
                [dbUserId, tier, Date.now(), expiresAt]
            );
        }

        return true;
    } catch (error) {
        console.error('Error purchasing VIP:', error);
        return false;
    }
}

// Get user's VIP status
async function getUserVIPDB(userId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return null;

        const dbUserId = userResult.rows[0].id;

        const result = await query(
            `SELECT tier, activated_at, expires_at, renewal_count, last_weekly_bonus, is_active
             FROM user_vip
             WHERE user_id = $1`,
            [dbUserId]
        );

        if (result.rows.length === 0) return null;

        const row = result.rows[0];

        return {
            tier: row.tier,
            activatedAt: parseInt(row.activated_at),
            expiresAt: parseInt(row.expires_at),
            renewalCount: parseInt(row.renewal_count),
            lastWeeklyBonus: parseInt(row.last_weekly_bonus),
            isActive: row.is_active
        };
    } catch (error) {
        console.error('Error getting user VIP:', error);
        return null;
    }
}

// Update weekly bonus claim time
async function claimVIPWeeklyBonusDB(userId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const dbUserId = userResult.rows[0].id;

        await query(
            'UPDATE user_vip SET last_weekly_bonus = $1 WHERE user_id = $2',
            [Date.now(), dbUserId]
        );

        return true;
    } catch (error) {
        console.error('Error claiming VIP weekly bonus:', error);
        return false;
    }
}

// Expire VIP for all users (run as a cron job)
async function expireVIPsDB() {
    try {
        const now = Date.now();

        const result = await query(
            `UPDATE user_vip
             SET is_active = FALSE
             WHERE expires_at <= $1 AND is_active = TRUE
             RETURNING (SELECT discord_id FROM users WHERE id = user_vip.user_id) as discord_id, tier`,
            [now]
        );

        return result.rows.map(row => ({
            userId: row.discord_id,
            tier: row.tier
        }));
    } catch (error) {
        console.error('Error expiring VIPs:', error);
        return [];
    }
}

// ============ ACHIEVEMENTS FUNCTIONS ============

// Unlock an achievement
async function unlockAchievementDB(userId, achievementId) {
    try {
        await getUserMoney(userId); // Ensure user exists

        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );
        const dbUserId = userResult.rows[0].id;

        // Check if already unlocked
        const existing = await query(
            'SELECT achievement_id FROM user_achievements WHERE user_id = $1 AND achievement_id = $2',
            [dbUserId, achievementId]
        );

        if (existing.rows.length > 0) {
            return false; // Already unlocked
        }

        await query(
            'INSERT INTO user_achievements (user_id, achievement_id, unlocked_at) VALUES ($1, $2, $3)',
            [dbUserId, achievementId, Date.now()]
        );

        return true;
    } catch (error) {
        console.error('Error unlocking achievement:', error);
        return false;
    }
}

// Check if user has achievement
async function hasAchievementDB(userId, achievementId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const dbUserId = userResult.rows[0].id;

        const result = await query(
            'SELECT COUNT(*) as count FROM user_achievements WHERE user_id = $1 AND achievement_id = $2',
            [dbUserId, achievementId]
        );

        return parseInt(result.rows[0].count) > 0;
    } catch (error) {
        console.error('Error checking achievement:', error);
        return false;
    }
}

// Get all user achievements
async function getUserAchievementsDB(userId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return [];

        const dbUserId = userResult.rows[0].id;

        const result = await query(
            'SELECT achievement_id, unlocked_at FROM user_achievements WHERE user_id = $1 ORDER BY unlocked_at DESC',
            [dbUserId]
        );

        return result.rows.map(row => ({
            achievementId: row.achievement_id,
            unlockedAt: parseInt(row.unlocked_at)
        }));
    } catch (error) {
        console.error('Error getting user achievements:', error);
        return [];
    }
}

// Get achievement progress
async function getAchievementProgressDB(userId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return null;

        const dbUserId = userResult.rows[0].id;

        // Ensure progress row exists
        await query(
            `INSERT INTO user_achievement_progress (user_id)
             VALUES ($1)
             ON CONFLICT (user_id) DO NOTHING`,
            [dbUserId]
        );

        const result = await query(
            'SELECT * FROM user_achievement_progress WHERE user_id = $1',
            [dbUserId]
        );

        if (result.rows.length === 0) return null;

        const row = result.rows[0];
        return {
            currentWinStreak: parseInt(row.current_win_streak),
            bestWinStreak: parseInt(row.best_win_streak),
            loansRepaid: parseInt(row.loans_repaid),
            largestLoanRepaid: parseInt(row.largest_loan_repaid),
            workShifts: parseInt(row.work_shifts)
        };
    } catch (error) {
        console.error('Error getting achievement progress:', error);
        return null;
    }
}

// Update win streak
async function updateWinStreakDB(userId, isWin) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return null;

        const dbUserId = userResult.rows[0].id;

        // Ensure progress row exists
        await query(
            `INSERT INTO user_achievement_progress (user_id)
             VALUES ($1)
             ON CONFLICT (user_id) DO NOTHING`,
            [dbUserId]
        );

        if (isWin) {
            // Increment win streak
            const result = await query(
                `UPDATE user_achievement_progress
                 SET current_win_streak = current_win_streak + 1,
                     best_win_streak = GREATEST(best_win_streak, current_win_streak + 1)
                 WHERE user_id = $1
                 RETURNING current_win_streak, best_win_streak`,
                [dbUserId]
            );
            return {
                currentWinStreak: parseInt(result.rows[0].current_win_streak),
                bestWinStreak: parseInt(result.rows[0].best_win_streak)
            };
        } else {
            // Reset win streak
            await query(
                'UPDATE user_achievement_progress SET current_win_streak = 0 WHERE user_id = $1',
                [dbUserId]
            );
            return { currentWinStreak: 0 };
        }
    } catch (error) {
        console.error('Error updating win streak:', error);
        return null;
    }
}

// Increment work shifts
async function incrementWorkShiftsDB(userId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return 0;

        const dbUserId = userResult.rows[0].id;

        // Ensure progress row exists
        await query(
            `INSERT INTO user_achievement_progress (user_id)
             VALUES ($1)
             ON CONFLICT (user_id) DO NOTHING`,
            [dbUserId]
        );

        const result = await query(
            `UPDATE user_achievement_progress
             SET work_shifts = work_shifts + 1
             WHERE user_id = $1
             RETURNING work_shifts`,
            [dbUserId]
        );

        return parseInt(result.rows[0].work_shifts);
    } catch (error) {
        console.error('Error incrementing work shifts:', error);
        return 0;
    }
}

// Update loan progress
async function updateLoanProgressDB(userId, loanAmount) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return null;

        const dbUserId = userResult.rows[0].id;

        // Ensure progress row exists
        await query(
            `INSERT INTO user_achievement_progress (user_id)
             VALUES ($1)
             ON CONFLICT (user_id) DO NOTHING`,
            [dbUserId]
        );

        const result = await query(
            `UPDATE user_achievement_progress
             SET loans_repaid = loans_repaid + 1,
                 largest_loan_repaid = GREATEST(largest_loan_repaid, $2)
             WHERE user_id = $1
             RETURNING loans_repaid, largest_loan_repaid`,
            [dbUserId, loanAmount]
        );

        return {
            loansRepaid: parseInt(result.rows[0].loans_repaid),
            largestLoanRepaid: parseInt(result.rows[0].largest_loan_repaid)
        };
    } catch (error) {
        console.error('Error updating loan progress:', error);
        return null;
    }
}

// ============ CHALLENGES FUNCTIONS ============

// Get user's active challenges
async function getUserChallengesDB(userId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return { daily: [], weekly: [] };

        const dbUserId = userResult.rows[0].id;

        const result = await query(
            `SELECT id, challenge_id, challenge_type, challenge_name, description, progress, target, reward, period, is_completed, is_claimed, started_at, expires_at, completed_at
             FROM user_challenges
             WHERE user_id = $1 AND expires_at > $2
             ORDER BY period DESC, started_at ASC`,
            [dbUserId, Date.now()]
        );

        const challenges = {
            daily: [],
            weekly: []
        };

        for (const row of result.rows) {
            const challenge = {
                id: row.challenge_id,
                name: row.challenge_name,
                description: row.description,
                type: row.challenge_type,
                progress: parseInt(row.progress),
                target: parseInt(row.target),
                reward: parseInt(row.reward),
                completed: row.is_completed,
                claimed: row.is_claimed,
                expiresAt: parseInt(row.expires_at),
                startedAt: parseInt(row.started_at),
                emoji: '🎯', // Default emoji, challenges.js will override this
                uniqueGamesPlayed: [] // For tracking unique games
            };

            if (row.completed_at) {
                challenge.completedAt = parseInt(row.completed_at);
            }

            if (row.period === 'daily') {
                challenges.daily.push(challenge);
            } else if (row.period === 'weekly') {
                challenges.weekly.push(challenge);
            }
        }

        return challenges;
    } catch (error) {
        console.error('Error getting user challenges:', error);
        return { daily: [], weekly: [] };
    }
}

// Create a new challenge for a user
async function createChallengeDB(userId, challengeData) {
    try {
        await getUserMoney(userId); // Ensure user exists

        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );
        const dbUserId = userResult.rows[0].id;

        await query(
            `INSERT INTO user_challenges (user_id, challenge_id, challenge_type, challenge_name, description, progress, target, reward, period, is_completed, started_at, expires_at)
             VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, FALSE, $9, $10)`,
            [
                dbUserId,
                challengeData.id,
                challengeData.type,
                challengeData.name,
                challengeData.description,
                challengeData.target,
                challengeData.reward,
                challengeData.period, // 'daily' or 'weekly'
                challengeData.startedAt,
                challengeData.expiresAt
            ]
        );

        return true;
    } catch (error) {
        console.error('Error creating challenge:', error);
        return false;
    }
}

// Update challenge progress
async function updateChallengeProgressDB(userId, challengeId, progress) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const dbUserId = userResult.rows[0].id;

        await query(
            `UPDATE user_challenges
             SET progress = $1
             WHERE user_id = $2 AND challenge_id = $3 AND is_completed = FALSE`,
            [progress, dbUserId, challengeId]
        );

        return true;
    } catch (error) {
        console.error('Error updating challenge progress:', error);
        return false;
    }
}

// Mark challenge as completed
async function markChallengeCompletedDB(userId, challengeId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const dbUserId = userResult.rows[0].id;

        await query(
            `UPDATE user_challenges
             SET is_completed = TRUE, completed_at = $1
             WHERE user_id = $2 AND challenge_id = $3`,
            [Date.now(), dbUserId, challengeId]
        );

        return true;
    } catch (error) {
        console.error('Error marking challenge completed:', error);
        return false;
    }
}

// Mark challenge as claimed (for rewards)
async function markChallengeClaimedDB(userId, challengeId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const dbUserId = userResult.rows[0].id;

        await query(
            `UPDATE user_challenges
             SET is_claimed = TRUE
             WHERE user_id = $1 AND challenge_id = $2`,
            [dbUserId, challengeId]
        );

        return true;
    } catch (error) {
        console.error('Error marking challenge claimed:', error);
        return false;
    }
}

// Delete all challenges for a user (for resets)
async function deleteChallengesDB(userId, period) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const dbUserId = userResult.rows[0].id;

        await query(
            `DELETE FROM user_challenges
             WHERE user_id = $1 AND period = $2`,
            [dbUserId, period]
        );

        return true;
    } catch (error) {
        console.error('Error deleting challenges:', error);
        return false;
    }
}

// Check if user has active challenges for a period
async function hasActiveChallengesDB(userId, period) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const dbUserId = userResult.rows[0].id;

        const result = await query(
            `SELECT COUNT(*) as count
             FROM user_challenges
             WHERE user_id = $1 AND period = $2 AND expires_at > $3`,
            [dbUserId, period, Date.now()]
        );

        return parseInt(result.rows[0].count) > 0;
    } catch (error) {
        console.error('Error checking active challenges:', error);
        return false;
    }
}

// Get challenge reset times (stored in a metadata table or user table)
// For now, we'll track this in memory or via timestamps
async function getLastResetTimeDB(userId, period) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return 0;

        const dbUserId = userResult.rows[0].id;

        // Get the earliest started_at for active challenges of this period
        const result = await query(
            `SELECT MIN(started_at) as last_reset
             FROM user_challenges
             WHERE user_id = $1 AND period = $2`,
            [dbUserId, period]
        );

        if (result.rows.length === 0 || result.rows[0].last_reset === null) {
            return 0;
        }

        return parseInt(result.rows[0].last_reset);
    } catch (error) {
        console.error('Error getting last reset time:', error);
        return 0;
    }
}

// ============ LOAN FUNCTIONS ============

// Get active loan for user
async function getActiveLoan(userId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return null;

        const dbUserId = userResult.rows[0].id;

        const result = await query(
            `SELECT id, amount, interest_rate, amount_owed, original_amount, due_date, taken_at, repaid_amount
             FROM loans
             WHERE user_id = $1 AND is_active = TRUE
             ORDER BY id DESC LIMIT 1`,
            [dbUserId]
        );

        if (result.rows.length === 0) return null;

        const loan = result.rows[0];
        return {
            id: loan.id,
            principalAmount: parseInt(loan.amount),
            interestRate: parseFloat(loan.interest_rate),
            totalOwed: parseInt(loan.amount_owed),
            amountPaid: parseInt(loan.repaid_amount),
            dueDate: parseInt(loan.due_date),
            takenDate: parseInt(loan.taken_at),
            daysOverdue: 0 // Will be calculated
        };
    } catch (error) {
        console.error('Error getting active loan:', error);
        return null;
    }
}

// Create a new loan
async function createLoanDB(userId, amount, interestRate, totalOwed, dueDate) {
    try {
        await getUserMoney(userId); // Ensure user exists

        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );
        const dbUserId = userResult.rows[0].id;

        const result = await query(
            `INSERT INTO loans (user_id, amount, interest_rate, amount_owed, original_amount, due_date, taken_at, is_active, repaid_amount)
             VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, 0)
             RETURNING id`,
            [dbUserId, amount, interestRate, totalOwed, amount, dueDate, Date.now()]
        );

        return result.rows[0].id;
    } catch (error) {
        console.error('Error creating loan:', error);
        return null;
    }
}

// Update loan payment
async function updateLoanPayment(userId, paymentAmount) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return null;

        const dbUserId = userResult.rows[0].id;

        // Get current loan
        const loanResult = await query(
            `SELECT id, amount_owed, repaid_amount
             FROM loans
             WHERE user_id = $1 AND is_active = TRUE
             ORDER BY id DESC LIMIT 1`,
            [dbUserId]
        );

        if (loanResult.rows.length === 0) return null;

        const loan = loanResult.rows[0];
        const newPaidAmount = parseInt(loan.repaid_amount) + paymentAmount;
        const remaining = parseInt(loan.amount_owed) - newPaidAmount;

        await query(
            'UPDATE loans SET repaid_amount = $1 WHERE id = $2',
            [newPaidAmount, loan.id]
        );

        return {
            payment: paymentAmount,
            remaining: Math.max(0, remaining),
            paidOff: remaining <= 0
        };
    } catch (error) {
        console.error('Error updating loan payment:', error);
        return null;
    }
}

// Mark loan as repaid
async function markLoanRepaid(userId, wasOnTime) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const dbUserId = userResult.rows[0].id;

        await query(
            `UPDATE loans
             SET is_active = FALSE, repaid_at = $1, was_defaulted = $2
             WHERE user_id = $3 AND is_active = TRUE`,
            [Date.now(), !wasOnTime, dbUserId]
        );

        return true;
    } catch (error) {
        console.error('Error marking loan repaid:', error);
        return false;
    }
}

// Update credit score
async function updateCreditScore(userId, change) {
    try {
        await getUserMoney(userId); // Ensure user exists

        await query(
            `UPDATE users
             SET credit_score = GREATEST(0, LEAST(1000, credit_score + $1))
             WHERE discord_id = $2`,
            [change, userId]
        );

        return true;
    } catch (error) {
        console.error('Error updating credit score:', error);
        return false;
    }
}

// Get credit score
async function getCreditScore(userId) {
    try {
        const result = await query(
            'SELECT credit_score FROM users WHERE discord_id = $1',
            [userId]
        );

        if (result.rows.length === 0) return 500; // Default

        return parseInt(result.rows[0].credit_score);
    } catch (error) {
        console.error('Error getting credit score:', error);
        return 500;
    }
}

// Update overdue loan (add additional interest and fees)
async function updateOverdueLoan(userId, additionalAmount, daysOverdue) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const dbUserId = userResult.rows[0].id;

        await query(
            `UPDATE loans
             SET amount_owed = amount_owed + $1
             WHERE user_id = $2 AND is_active = TRUE`,
            [additionalAmount, dbUserId]
        );

        return true;
    } catch (error) {
        console.error('Error updating overdue loan:', error);
        return false;
    }
}

// Get all overdue loans
async function getOverdueLoans() {
    try {
        const result = await query(
            `SELECT u.discord_id, l.id, l.amount, l.amount_owed, l.due_date, l.repaid_amount, l.taken_at
             FROM loans l
             JOIN users u ON u.id = l.user_id
             WHERE l.is_active = TRUE AND l.due_date < $1`,
            [Date.now()]
        );

        return result.rows.map(row => ({
            userId: row.discord_id,
            loanId: row.id,
            principalAmount: parseInt(row.amount),
            totalOwed: parseInt(row.amount_owed),
            dueDate: parseInt(row.due_date),
            amountPaid: parseInt(row.repaid_amount),
            takenDate: parseInt(row.taken_at),
            daysOverdue: Math.floor((Date.now() - parseInt(row.due_date)) / (24 * 60 * 60 * 1000))
        }));
    } catch (error) {
        console.error('Error getting overdue loans:', error);
        return [];
    }
}

// ============ GUILD FUNCTIONS ============

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
            guildId: row.guild_id,
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

        // Add member
        const now = Date.now();
        await client.query(
            `INSERT INTO guild_members (guild_id, user_id, joined_at, contributed_total)
             VALUES ($1, $2, $3, 0)`,
            [guild.id, dbUserId, now]
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

// ============ HEIST FUNCTIONS ============

// Get user heist stats
async function getUserHeistStats(userId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return null;

        const dbUserId = userResult.rows[0].id;

        // Ensure heist stats row exists
        await query(
            `INSERT INTO user_heist_stats (user_id)
             VALUES ($1)
             ON CONFLICT (user_id) DO NOTHING`,
            [dbUserId]
        );

        const result = await query(
            `SELECT last_heist, cooldown_until, total_heists, successful_heists, total_earned, total_lost, biggest_score
             FROM user_heist_stats
             WHERE user_id = $1`,
            [dbUserId]
        );

        if (result.rows.length === 0) return null;

        const row = result.rows[0];
        return {
            lastHeist: parseInt(row.last_heist) || 0,
            cooldownUntil: parseInt(row.cooldown_until) || 0,
            totalHeists: parseInt(row.total_heists) || 0,
            successfulHeists: parseInt(row.successful_heists) || 0,
            totalEarned: parseInt(row.total_earned) || 0,
            totalLost: parseInt(row.total_lost) || 0,
            biggestScore: parseInt(row.biggest_score) || 0
        };
    } catch (error) {
        console.error('Error getting user heist stats:', error);
        return null;
    }
}

// Update heist cooldown
async function updateHeistCooldown(userId, cooldownUntil) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const dbUserId = userResult.rows[0].id;

        // Ensure heist stats row exists
        await query(
            `INSERT INTO user_heist_stats (user_id)
             VALUES ($1)
             ON CONFLICT (user_id) DO NOTHING`,
            [dbUserId]
        );

        await query(
            `UPDATE user_heist_stats
             SET cooldown_until = $1, last_heist = $2
             WHERE user_id = $3`,
            [cooldownUntil, Date.now(), dbUserId]
        );

        return true;
    } catch (error) {
        console.error('Error updating heist cooldown:', error);
        return false;
    }
}

// Record heist attempt
async function recordHeistAttempt(userId, success, amount) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const dbUserId = userResult.rows[0].id;

        // Ensure heist stats row exists
        await query(
            `INSERT INTO user_heist_stats (user_id)
             VALUES ($1)
             ON CONFLICT (user_id) DO NOTHING`,
            [dbUserId]
        );

        if (success) {
            // Update successful heist stats
            await query(
                `UPDATE user_heist_stats
                 SET total_heists = total_heists + 1,
                     successful_heists = successful_heists + 1,
                     total_earned = total_earned + $1,
                     biggest_score = GREATEST(biggest_score, $1)
                 WHERE user_id = $2`,
                [amount, dbUserId]
            );
        } else {
            // Update failed heist stats
            await query(
                `UPDATE user_heist_stats
                 SET total_heists = total_heists + 1,
                     total_lost = total_lost + $1
                 WHERE user_id = $2`,
                [amount, dbUserId]
            );
        }

        return true;
    } catch (error) {
        console.error('Error recording heist attempt:', error);
        return false;
    }
}

// Get heist debt
async function getHeistDebt(userId) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return 0;

        const dbUserId = userResult.rows[0].id;

        // Ensure debt row exists
        await query(
            `INSERT INTO user_heist_debt (user_id)
             VALUES ($1)
             ON CONFLICT (user_id) DO NOTHING`,
            [dbUserId]
        );

        const result = await query(
            'SELECT debt_amount FROM user_heist_debt WHERE user_id = $1',
            [dbUserId]
        );

        if (result.rows.length === 0) return 0;

        return parseInt(result.rows[0].debt_amount) || 0;
    } catch (error) {
        console.error('Error getting heist debt:', error);
        return 0;
    }
}

// Add heist debt
async function addHeistDebt(userId, amount) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return false;

        const dbUserId = userResult.rows[0].id;

        // Ensure debt row exists
        await query(
            `INSERT INTO user_heist_debt (user_id)
             VALUES ($1)
             ON CONFLICT (user_id) DO NOTHING`,
            [dbUserId]
        );

        await query(
            `UPDATE user_heist_debt
             SET debt_amount = debt_amount + $1,
                 total_debt_incurred = total_debt_incurred + $1
             WHERE user_id = $2`,
            [amount, dbUserId]
        );

        return true;
    } catch (error) {
        console.error('Error adding heist debt:', error);
        return false;
    }
}

// Pay heist debt
async function payHeistDebt(userId, amount) {
    try {
        const userResult = await query(
            'SELECT id FROM users WHERE discord_id = $1',
            [userId]
        );

        if (userResult.rows.length === 0) return null;

        const dbUserId = userResult.rows[0].id;

        // Ensure debt row exists
        await query(
            `INSERT INTO user_heist_debt (user_id)
             VALUES ($1)
             ON CONFLICT (user_id) DO NOTHING`,
            [dbUserId]
        );

        // Get current debt
        const debtResult = await query(
            'SELECT debt_amount FROM user_heist_debt WHERE user_id = $1',
            [dbUserId]
        );

        const currentDebt = parseInt(debtResult.rows[0].debt_amount) || 0;

        if (currentDebt === 0) {
            return { success: false, message: "You don't have any heist debt!" };
        }

        const payment = Math.min(amount, currentDebt);

        // Update debt
        await query(
            `UPDATE user_heist_debt
             SET debt_amount = debt_amount - $1,
                 total_debt_repaid = total_debt_repaid + $1,
                 last_payment_date = $2
             WHERE user_id = $3`,
            [payment, Date.now(), dbUserId]
        );

        return {
            success: true,
            payment,
            remainingDebt: currentDebt - payment
        };
    } catch (error) {
        console.error('Error paying heist debt:', error);
        return null;
    }
}

// Get guild heist stats
async function getGuildHeistStats(guildId) {
    try {
        // Get the database guild ID from guild_id string
        const guildResult = await query(
            'SELECT id FROM guilds WHERE guild_id = $1',
            [guildId]
        );

        if (guildResult.rows.length === 0) return null;

        const dbGuildId = guildResult.rows[0].id;

        // Ensure guild heist stats row exists
        await query(
            `INSERT INTO guild_heist_stats (guild_id)
             VALUES ($1)
             ON CONFLICT (guild_id) DO NOTHING`,
            [dbGuildId]
        );

        const result = await query(
            `SELECT last_heist, cooldown_until, total_heists, successful_heists
             FROM guild_heist_stats
             WHERE guild_id = $1`,
            [dbGuildId]
        );

        if (result.rows.length === 0) return null;

        const row = result.rows[0];
        return {
            lastHeist: parseInt(row.last_heist) || 0,
            cooldownUntil: parseInt(row.cooldown_until) || 0,
            totalHeists: parseInt(row.total_heists) || 0,
            successfulHeists: parseInt(row.successful_heists) || 0
        };
    } catch (error) {
        console.error('Error getting guild heist stats:', error);
        return null;
    }
}

// Update guild heist cooldown
async function updateGuildHeistCooldown(guildId, cooldownUntil) {
    try {
        // Get the database guild ID from guild_id string
        const guildResult = await query(
            'SELECT id FROM guilds WHERE guild_id = $1',
            [guildId]
        );

        if (guildResult.rows.length === 0) return false;

        const dbGuildId = guildResult.rows[0].id;

        // Ensure guild heist stats row exists
        await query(
            `INSERT INTO guild_heist_stats (guild_id)
             VALUES ($1)
             ON CONFLICT (guild_id) DO NOTHING`,
            [dbGuildId]
        );

        await query(
            `UPDATE guild_heist_stats
             SET cooldown_until = $1, last_heist = $2
             WHERE guild_id = $3`,
            [cooldownUntil, Date.now(), dbGuildId]
        );

        return true;
    } catch (error) {
        console.error('Error updating guild heist cooldown:', error);
        return false;
    }
}

// Get all user heist stats (for leaderboards)
async function getAllUserHeistStats() {
    try {
        const result = await query(
            `SELECT u.discord_id, uhs.last_heist, uhs.cooldown_until, uhs.total_heists,
                    uhs.successful_heists, uhs.total_earned, uhs.total_lost, uhs.biggest_score
             FROM user_heist_stats uhs
             JOIN users u ON u.id = uhs.user_id
             WHERE uhs.total_heists > 0
             ORDER BY uhs.successful_heists DESC`
        );

        return result.rows.map(row => ({
            userId: row.discord_id,
            lastHeist: parseInt(row.last_heist) || 0,
            cooldownUntil: parseInt(row.cooldown_until) || 0,
            totalHeists: parseInt(row.total_heists) || 0,
            successfulHeists: parseInt(row.successful_heists) || 0,
            totalEarned: parseInt(row.total_earned) || 0,
            totalLost: parseInt(row.total_lost) || 0,
            biggestScore: parseInt(row.biggest_score) || 0,
            successRate: row.total_heists > 0
                ? ((parseInt(row.successful_heists) / parseInt(row.total_heists)) * 100)
                : 0
        }));
    } catch (error) {
        console.error('Error getting all user heist stats:', error);
        return [];
    }
}

// Record guild heist attempt
async function recordGuildHeistAttempt(guildId, participantIds, success) {
    const client = await getClient();
    try {
        await client.query('BEGIN');

        // Get the database guild ID from guild_id string
        const guildResult = await client.query(
            'SELECT id FROM guilds WHERE guild_id = $1',
            [guildId]
        );

        if (guildResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return false;
        }

        const dbGuildId = guildResult.rows[0].id;

        // Ensure guild heist stats row exists
        await client.query(
            `INSERT INTO guild_heist_stats (guild_id)
             VALUES ($1)
             ON CONFLICT (guild_id) DO NOTHING`,
            [dbGuildId]
        );

        // Update guild stats
        if (success) {
            await client.query(
                `UPDATE guild_heist_stats
                 SET total_heists = total_heists + 1,
                     successful_heists = successful_heists + 1
                 WHERE guild_id = $1`,
                [dbGuildId]
            );
        } else {
            await client.query(
                `UPDATE guild_heist_stats
                 SET total_heists = total_heists + 1
                 WHERE guild_id = $1`,
                [dbGuildId]
            );
        }

        // Update user statistics for guild heists
        for (const userId of participantIds) {
            const userResult = await client.query(
                'SELECT id FROM users WHERE discord_id = $1',
                [userId]
            );

            if (userResult.rows.length > 0) {
                const dbUserId = userResult.rows[0].id;

                if (success) {
                    await client.query(
                        `UPDATE user_statistics
                         SET guild_heists_participated = guild_heists_participated + 1,
                             guild_heists_won = guild_heists_won + 1
                         WHERE user_id = $1`,
                        [dbUserId]
                    );
                } else {
                    await client.query(
                        `UPDATE user_statistics
                         SET guild_heists_participated = guild_heists_participated + 1
                         WHERE user_id = $1`,
                        [dbUserId]
                    );
                }
            }
        }

        await client.query('COMMIT');
        return true;
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error recording guild heist attempt:', error);
        return false;
    } finally {
        client.release();
    }
}

// ============ GAMBLING BAN FUNCTIONS ============

// Check if user is gambling banned
async function isGamblingBanned(userId) {
    try {
        const result = await query(
            'SELECT gambling_ban_until FROM users WHERE discord_id = $1',
            [userId]
        );

        if (result.rows.length === 0) return false;

        const banUntil = parseInt(result.rows[0].gambling_ban_until) || 0;
        return banUntil > Date.now();
    } catch (error) {
        console.error('Error checking gambling ban:', error);
        return false;
    }
}

// Get gambling ban expiry time
async function getGamblingBanTime(userId) {
    try {
        const result = await query(
            'SELECT gambling_ban_until FROM users WHERE discord_id = $1',
            [userId]
        );

        if (result.rows.length === 0) return 0;

        return parseInt(result.rows[0].gambling_ban_until) || 0;
    } catch (error) {
        console.error('Error getting gambling ban time:', error);
        return 0;
    }
}

// Set gambling ban
async function setGamblingBan(userId, banUntilTimestamp) {
    try {
        await getUserMoney(userId); // Ensure user exists

        await query(
            'UPDATE users SET gambling_ban_until = $1 WHERE discord_id = $2',
            [banUntilTimestamp, userId]
        );

        return true;
    } catch (error) {
        console.error('Error setting gambling ban:', error);
        return false;
    }
}

// Clear gambling ban
async function clearGamblingBan(userId) {
    try {
        await getUserMoney(userId); // Ensure user exists

        await query(
            'UPDATE users SET gambling_ban_until = 0 WHERE discord_id = $1',
            [userId]
        );

        return true;
    } catch (error) {
        console.error('Error clearing gambling ban:', error);
        return false;
    }
}

module.exports = {
    loadUserData,
    saveUserData,
    getUserMoney,
    setUserMoney,
    recordGameResult,
    canClaimDaily,
    setLastDaily,
    setLastWork,
    getTimeUntilNextDaily,
    getAllUserData,
    getUserData,
    updateUserGifts,
    cleanUserData,
    getPendingNotifications,
    // Inventory & Shop
    addToInventory,
    removeFromInventory,
    getUserInventory,
    addBoost,
    hasActiveBoost,
    getActiveBoost,
    consumeBoost,
    getUserBoosts,
    // Properties
    purchasePropertyDB,
    getUserPropertiesDB,
    upgradePropertyDB,
    updatePropertyCollectionTime,
    getPropertyLastCollected,
    // VIP
    purchaseVIPDB,
    getUserVIPDB,
    claimVIPWeeklyBonusDB,
    expireVIPsDB,
    // Achievements
    unlockAchievementDB,
    hasAchievementDB,
    getUserAchievementsDB,
    getAchievementProgressDB,
    updateWinStreakDB,
    incrementWorkShiftsDB,
    updateLoanProgressDB,
    // Challenges
    getUserChallengesDB,
    createChallengeDB,
    updateChallengeProgressDB,
    markChallengeCompletedDB,
    markChallengeClaimedDB,
    deleteChallengesDB,
    hasActiveChallengesDB,
    getLastResetTimeDB,
    // Gambling Bans
    isGamblingBanned,
    getGamblingBanTime,
    setGamblingBan,
    clearGamblingBan,
    // Loans
    getActiveLoan,
    createLoanDB,
    updateLoanPayment,
    markLoanRepaid,
    updateCreditScore,
    getCreditScore,
    updateOverdueLoan,
    getOverdueLoans,
    // Guilds
    getGuildByName,
    getUserGuildDB,
    createGuildDB,
    joinGuildDB,
    leaveGuildDB,
    donateToGuildTreasury,
    getGuildMembers,
    // Heist
    getUserHeistStats,
    updateHeistCooldown,
    recordHeistAttempt,
    getHeistDebt,
    addHeistDebt,
    payHeistDebt,
    getGuildHeistStats,
    updateGuildHeistCooldown,
    recordGuildHeistAttempt,
    getAllUserHeistStats
};
