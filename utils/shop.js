const {
    getUserMoney,
    setUserMoney,
    addToInventory,
    removeFromInventory,
    getUserInventory,
    addBoost,
    hasActiveBoost,
    getActiveBoost,
    consumeBoost,
    getUserBoosts
} = require('./data');

// Shop item definitions
const SHOP_ITEMS = {
    luck_boost: {
        id: 'luck_boost',
        name: '🍀 Luck Boost',
        description: 'Increases your win chance by 5% for the next game',
        price: 5000,
        type: 'consumable',
        effect: 'luck',
        value: 5, // 5% boost
        category: 'boost'
    },
    insurance: {
        id: 'insurance',
        name: '🛡️ Bet Insurance',
        description: 'Get 50% of your bet back if you lose the next game',
        price: 7500,
        type: 'consumable',
        effect: 'insurance',
        value: 50, // 50% refund
        category: 'protection'
    },
    double_daily: {
        id: 'double_daily',
        name: '💎 Double Daily',
        description: 'Your next daily bonus will be doubled',
        price: 10000,
        type: 'consumable',
        effect: 'double_daily',
        value: 2, // 2x multiplier
        category: 'boost'
    },
    win_streak_protector: {
        id: 'win_streak_protector',
        name: '🔥 Win Streak Shield',
        description: 'Protect your win streak from breaking on your next loss',
        price: 15000,
        type: 'consumable',
        effect: 'streak_protection',
        value: 1, // Protects 1 loss
        category: 'protection'
    },
    big_spender_pass: {
        id: 'big_spender_pass',
        name: '💸 High Roller Pass',
        description: 'Increase your betting limit by 50% for the next game',
        price: 8000,
        type: 'consumable',
        effect: 'bet_limit',
        value: 50, // 50% increase
        category: 'boost'
    },
    xp_boost: {
        id: 'xp_boost',
        name: '⭐ Win Multiplier',
        description: 'Increase your winnings by 25% on your next win',
        price: 12000,
        type: 'consumable',
        effect: 'win_multiplier',
        value: 25, // 25% bonus
        category: 'boost'
    }
};

// Get all shop items
function getShopItems() {
    return Object.values(SHOP_ITEMS);
}

// Get shop items by category
function getShopItemsByCategory() {
    const categories = {};

    for (const item of Object.values(SHOP_ITEMS)) {
        if (!categories[item.category]) {
            categories[item.category] = [];
        }
        categories[item.category].push(item);
    }

    return categories;
}

// Get single item by ID
function getShopItem(itemId) {
    return SHOP_ITEMS[itemId] || null;
}

// Purchase an item (FIXED - now uses database)
async function purchaseItem(userId, itemId) {
    const item = getShopItem(itemId);
    if (!item) {
        return { success: false, message: 'Item not found!' };
    }

    const currentMoney = await getUserMoney(userId);

    if (currentMoney < item.price) {
        return {
            success: false,
            message: `You don't have enough money! Need $${item.price.toLocaleString()}, you have $${currentMoney.toLocaleString()}`
        };
    }

    try {
        // Deduct money
        await setUserMoney(userId, currentMoney - item.price);

        // Add to inventory using database
        await addToInventory(userId, itemId);

        return {
            success: true,
            message: `Successfully purchased **${item.name}** for $${item.price.toLocaleString()}!`,
            item: item
        };
    } catch (error) {
        console.error('Error purchasing item:', error);
        // Refund money if inventory addition failed
        await setUserMoney(userId, currentMoney);
        return {
            success: false,
            message: 'Purchase failed! Your money has been refunded.'
        };
    }
}

// Get user's inventory (FIXED - now uses database)
async function getInventory(userId) {
    const inventoryItems = await getUserInventory(userId);

    // Map to include full item details
    return inventoryItems.map(invItem => ({
        itemId: invItem.itemId,  // Preserve itemId field
        ...SHOP_ITEMS[invItem.itemId],
        quantity: invItem.quantity,
        acquiredAt: invItem.acquiredAt
    }));
}

// Use/activate an item (FIXED - now uses database)
async function useItem(userId, itemId) {
    const item = getShopItem(itemId);
    if (!item) {
        return { success: false, message: 'Item not found!' };
    }

    try {
        // Check if user has this item
        const inventory = await getUserInventory(userId);
        const hasItem = inventory.some(invItem => invItem.itemId === itemId && invItem.quantity > 0);

        if (!hasItem) {
            return { success: false, message: 'Item not found in your inventory!' };
        }

        // Check if user already has an active boost of this type
        const hasBoost = await hasActiveBoost(userId, item.effect);
        if (hasBoost) {
            return {
                success: false,
                message: `You already have an active **${item.name}** boost! Use it first before activating another.`
            };
        }

        // Remove from inventory
        const removed = await removeFromInventory(userId, itemId);
        if (!removed) {
            return { success: false, message: 'Failed to remove item from inventory!' };
        }

        // Add to active boosts
        await addBoost(userId, item.effect, item.value, 1);

        return {
            success: true,
            message: `Activated **${item.name}**! It will be used on your next applicable action.`
        };
    } catch (error) {
        console.error('Error using item:', error);
        return { success: false, message: 'Failed to use item!' };
    }
}

// Get inventory count by item type
async function getInventoryCount(userId) {
    const inventory = await getUserInventory(userId);
    const counts = {};

    for (const item of inventory) {
        counts[item.itemId] = item.quantity;
    }

    return counts;
}

// Export both old function name and new for compatibility
module.exports = {
    SHOP_ITEMS,
    getShopItems,
    getShopItemsByCategory,
    getShopItem,
    purchaseItem,
    getUserInventory: getInventory, // Use database version
    getInventory, // New name
    useItem,
    hasActiveBoost, // Export from data layer
    getActiveBoost, // Export from data layer
    consumeBoost, // Export from data layer
    getActiveBoosts: getUserBoosts, // Map old name to new
    cleanupBoosts: async () => {}, // No longer needed - database handles cleanup
    getInventoryCount
};
