const { getUserData, saveUserData } = require('./data');

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

// Initialize inventory for a user
function initializeInventory(userId) {
    const userData = getUserData(userId);
    if (!userData) return null;

    if (!userData.inventory) {
        userData.inventory = [];
    }

    if (!userData.activeBoosts) {
        userData.activeBoosts = [];
    }

    return userData;
}

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

// Purchase an item
async function purchaseItem(userId, itemId) {
    const item = getShopItem(itemId);
    if (!item) {
        return { success: false, message: 'Item not found!' };
    }

    const { getUserMoney, setUserMoney } = require('./data');
    const currentMoney = await getUserMoney(userId);

    if (currentMoney < item.price) {
        return {
            success: false,
            message: `You don't have enough money! Need $${item.price.toLocaleString()}, you have $${currentMoney.toLocaleString()}`
        };
    }

    const userData = initializeInventory(userId);
    if (!userData) {
        return { success: false, message: 'User data not found!' };
    }

    // Deduct money
    await setUserMoney(userId, currentMoney - item.price);

    // Add to inventory
    const inventoryItem = {
        ...item,
        purchasedAt: Date.now(),
        id: `${itemId}_${Date.now()}_${Math.random()}`
    };

    userData.inventory.push(inventoryItem);
    await saveUserData();

    return {
        success: true,
        message: `Successfully purchased **${item.name}** for $${item.price.toLocaleString()}!`,
        item: inventoryItem
    };
}

// Get user's inventory
function getUserInventory(userId) {
    const userData = initializeInventory(userId);
    if (!userData) return [];

    return userData.inventory;
}

// Use/activate an item
async function useItem(userId, itemId) {
    const userData = initializeInventory(userId);
    if (!userData) {
        return { success: false, message: 'User data not found!' };
    }

    // Find item in inventory
    const itemIndex = userData.inventory.findIndex(item => item.id === itemId);
    if (itemIndex === -1) {
        return { success: false, message: 'Item not found in your inventory!' };
    }

    const item = userData.inventory[itemIndex];

    // Check if user already has an active boost
    if (userData.activeBoosts.length > 0) {
        const activeBoost = userData.activeBoosts[0];
        const boostItem = SHOP_ITEMS[activeBoost.itemType];
        return {
            success: false,
            message: `You already have an active boost: **${boostItem.name}**! Use it first before activating another.`
        };
    }

    // Remove from inventory
    userData.inventory.splice(itemIndex, 1);

    // Add to active boosts
    const activeBoost = {
        itemType: item.id.split('_')[0] + '_' + item.id.split('_')[1], // Get original item type
        effect: item.effect,
        value: item.value,
        activatedAt: Date.now(),
        used: false
    };

    userData.activeBoosts.push(activeBoost);
    await saveUserData();

    return {
        success: true,
        message: `Activated **${item.name}**! It will be used on your next applicable action.`,
        boost: activeBoost
    };
}

// Check if user has an active boost of a specific type
function hasActiveBoost(userId, boostType) {
    const userData = getUserData(userId);
    if (!userData || !userData.activeBoosts) return false;

    return userData.activeBoosts.some(boost => boost.effect === boostType && !boost.used);
}

// Get active boost of a specific type
function getActiveBoost(userId, boostType) {
    const userData = getUserData(userId);
    if (!userData || !userData.activeBoosts) return null;

    return userData.activeBoosts.find(boost => boost.effect === boostType && !boost.used) || null;
}

// Consume/use an active boost
async function consumeBoost(userId, boostType) {
    const userData = getUserData(userId);
    if (!userData || !userData.activeBoosts) return false;

    const boostIndex = userData.activeBoosts.findIndex(
        boost => boost.effect === boostType && !boost.used
    );

    if (boostIndex === -1) return false;

    // Mark as used and remove
    userData.activeBoosts.splice(boostIndex, 1);
    await saveUserData();

    return true;
}

// Get all active boosts for a user
function getActiveBoosts(userId) {
    const userData = getUserData(userId);
    if (!userData || !userData.activeBoosts) return [];

    return userData.activeBoosts.filter(boost => !boost.used);
}

// Clear expired or used boosts
async function cleanupBoosts(userId) {
    const userData = getUserData(userId);
    if (!userData || !userData.activeBoosts) return;

    // Remove used boosts
    const activeBefore = userData.activeBoosts.length;
    userData.activeBoosts = userData.activeBoosts.filter(boost => !boost.used);

    if (userData.activeBoosts.length !== activeBefore) {
        await saveUserData();
    }
}

// Get inventory count by item type
function getInventoryCount(userId) {
    const inventory = getUserInventory(userId);
    const counts = {};

    for (const item of inventory) {
        const itemType = item.id.split('_')[0] + '_' + item.id.split('_')[1];
        counts[itemType] = (counts[itemType] || 0) + 1;
    }

    return counts;
}

module.exports = {
    SHOP_ITEMS,
    initializeInventory,
    getShopItems,
    getShopItemsByCategory,
    getShopItem,
    purchaseItem,
    getUserInventory,
    useItem,
    hasActiveBoost,
    getActiveBoost,
    consumeBoost,
    getActiveBoosts,
    cleanupBoosts,
    getInventoryCount
};
