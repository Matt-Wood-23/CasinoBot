const { query } = require('../connection');
const { getUserMoney } = require('./users');

// ============ INVENTORY FUNCTIONS ============

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

// ============ BOOSTS FUNCTIONS ============

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

module.exports = {
    addToInventory,
    removeFromInventory,
    getUserInventory,
    addBoost,
    hasActiveBoost,
    getActiveBoost,
    consumeBoost,
    getUserBoosts,
    purchasePropertyDB,
    getUserPropertiesDB,
    upgradePropertyDB,
    updatePropertyCollectionTime,
    getPropertyLastCollected
};
