const {
    getUserMoney,
    setUserMoney,
    purchasePropertyDB,
    getUserPropertiesDB,
    upgradePropertyDB,
    updatePropertyCollectionTime,
    getPropertyLastCollected
} = require('./data');
const { getUserVIPTier } = require('./vip');

// Property Definitions (tiered by VIP level)
const PROPERTIES = {
    // No VIP Required
    slot_machine_room: {
        id: 'slot_machine_room',
        name: '🎰 Slot Machine Room',
        description: 'A small room with 3 slot machines',
        purchasePrice: 10000,
        vipRequired: null,
        vipLevel: 0,
        baseIncome: 500,
        baseMaintenance: 100,
        upgrades: [
            { level: 1, cost: 5000, incomeBoost: 250, maintenanceIncrease: 50 },
            { level: 2, cost: 10000, incomeBoost: 500, maintenanceIncrease: 100 },
            { level: 3, cost: 20000, incomeBoost: 1000, maintenanceIncrease: 150 }
        ],
        category: 'starter',
        emoji: '🎰'
    },

    // Bronze VIP
    poker_lounge: {
        id: 'poker_lounge',
        name: '♠️ Poker Lounge',
        description: 'An upscale poker room with 5 tables',
        purchasePrice: 25000,
        vipRequired: 'bronze',
        vipLevel: 1,
        baseIncome: 1200,
        baseMaintenance: 250,
        upgrades: [
            { level: 1, cost: 12000, incomeBoost: 600, maintenanceIncrease: 125 },
            { level: 2, cost: 25000, incomeBoost: 1200, maintenanceIncrease: 250 },
            { level: 3, cost: 50000, incomeBoost: 2400, maintenanceIncrease: 375 }
        ],
        category: 'bronze',
        emoji: '♠️'
    },

    // Silver VIP
    roulette_hall: {
        id: 'roulette_hall',
        name: '🎲 Roulette Hall',
        description: 'A luxurious hall with 10 roulette tables',
        purchasePrice: 50000,
        vipRequired: 'silver',
        vipLevel: 2,
        baseIncome: 2500,
        baseMaintenance: 500,
        upgrades: [
            { level: 1, cost: 25000, incomeBoost: 1250, maintenanceIncrease: 250 },
            { level: 2, cost: 50000, incomeBoost: 2500, maintenanceIncrease: 500 },
            { level: 3, cost: 100000, incomeBoost: 5000, maintenanceIncrease: 750 }
        ],
        category: 'silver',
        emoji: '🎲'
    },

    private_suite: {
        id: 'private_suite',
        name: '🏨 Private VIP Suite',
        description: 'Exclusive suite for high rollers',
        purchasePrice: 75000,
        vipRequired: 'silver',
        vipLevel: 2,
        baseIncome: 3000,
        baseMaintenance: 600,
        upgrades: [
            { level: 1, cost: 37500, incomeBoost: 1500, maintenanceIncrease: 300 },
            { level: 2, cost: 75000, incomeBoost: 3000, maintenanceIncrease: 600 },
            { level: 3, cost: 150000, incomeBoost: 6000, maintenanceIncrease: 900 }
        ],
        category: 'silver',
        emoji: '🏨'
    },

    // Gold VIP
    high_roller_floor: {
        id: 'high_roller_floor',
        name: '💎 High Roller Floor',
        description: 'Entire floor dedicated to high stakes gambling',
        purchasePrice: 150000,
        vipRequired: 'gold',
        vipLevel: 3,
        baseIncome: 6000,
        baseMaintenance: 1000,
        upgrades: [
            { level: 1, cost: 75000, incomeBoost: 3000, maintenanceIncrease: 500 },
            { level: 2, cost: 150000, incomeBoost: 6000, maintenanceIncrease: 1000 },
            { level: 3, cost: 300000, incomeBoost: 12000, maintenanceIncrease: 1500 }
        ],
        category: 'gold',
        emoji: '💎'
    },

    // Platinum VIP
    casino_empire: {
        id: 'casino_empire',
        name: '🏰 Casino Empire',
        description: 'Your own casino empire with multiple locations',
        purchasePrice: 500000,
        vipRequired: 'platinum',
        vipLevel: 4,
        baseIncome: 20000,
        baseMaintenance: 3000,
        upgrades: [
            { level: 1, cost: 250000, incomeBoost: 10000, maintenanceIncrease: 1500 },
            { level: 2, cost: 500000, incomeBoost: 20000, maintenanceIncrease: 3000 },
            { level: 3, cost: 1000000, incomeBoost: 40000, maintenanceIncrease: 4500 }
        ],
        category: 'platinum',
        emoji: '🏰'
    }
};

// Get all properties (optionally filter by VIP level)
function getAllProperties(userVipLevel = 0) {
    const allProps = Object.values(PROPERTIES);

    if (userVipLevel === null || userVipLevel === undefined) {
        return allProps;
    }

    return allProps.filter(prop => prop.vipLevel <= userVipLevel);
}

// Get property by ID
function getPropertyById(propertyId) {
    return PROPERTIES[propertyId] || null;
}

// Check if user can purchase property (FIXED - now async with database)
async function canPurchaseProperty(userId, propertyId) {
    const property = getPropertyById(propertyId);
    if (!property) {
        return { canPurchase: false, reason: 'Property not found!' };
    }

    const vipTier = await getUserVIPTier(userId);
    const userVipLevel = vipTier ? vipTier.level : 0;

    if (property.vipLevel > userVipLevel) {
        return {
            canPurchase: false,
            reason: `Requires ${property.vipRequired} VIP or higher!`
        };
    }

    const userProperties = await getUserPropertiesDB(userId);
    const alreadyOwned = userProperties.some(p => p.propertyId === propertyId);

    if (alreadyOwned) {
        return { canPurchase: false, reason: 'You already own this property!' };
    }

    return { canPurchase: true };
}

// Purchase a property (FIXED - now uses database)
async function purchaseProperty(userId, propertyId) {
    const property = getPropertyById(propertyId);
    if (!property) {
        return { success: false, message: 'Property not found!' };
    }

    const canPurchase = await canPurchaseProperty(userId, propertyId);
    if (!canPurchase.canPurchase) {
        return { success: false, message: canPurchase.reason };
    }

    const currentMoney = await getUserMoney(userId);

    if (currentMoney < property.purchasePrice) {
        return {
            success: false,
            message: `You don't have enough money! Need $${property.purchasePrice.toLocaleString()}, you have $${currentMoney.toLocaleString()}`
        };
    }

    try {
        // Deduct money
        await setUserMoney(userId, currentMoney - property.purchasePrice);

        // Add property to database
        const success = await purchasePropertyDB(userId, propertyId);

        if (!success) {
            // Refund if database operation failed
            await setUserMoney(userId, currentMoney);
            return { success: false, message: 'Failed to purchase property!' };
        }

        return {
            success: true,
            property: property
        };
    } catch (error) {
        console.error('Error in purchaseProperty:', error);
        // Refund on error
        await setUserMoney(userId, currentMoney);
        return { success: false, message: 'Purchase failed!' };
    }
}

// Upgrade a property (FIXED - now uses database)
async function upgradeProperty(userId, propertyId) {
    const property = getPropertyById(propertyId);
    if (!property) {
        return { success: false, message: 'Property not found!' };
    }

    const userProperties = await getUserPropertiesDB(userId);
    const ownedProperty = userProperties.find(p => p.propertyId === propertyId);

    if (!ownedProperty) {
        return { success: false, message: 'You don\'t own this property!' };
    }

    const currentLevel = ownedProperty.upgradeLevel || 0;

    if (currentLevel >= property.upgrades.length) {
        return { success: false, message: 'This property is already fully upgraded!' };
    }

    const upgrade = property.upgrades[currentLevel];
    const currentMoney = await getUserMoney(userId);

    if (currentMoney < upgrade.cost) {
        return {
            success: false,
            message: `You don't have enough money! Need $${upgrade.cost.toLocaleString()}, you have $${currentMoney.toLocaleString()}`
        };
    }

    try {
        // Deduct money
        await setUserMoney(userId, currentMoney - upgrade.cost);

        // Upgrade in database
        const newLevel = await upgradePropertyDB(userId, propertyId);

        if (newLevel === false) {
            // Refund if database operation failed
            await setUserMoney(userId, currentMoney);
            return { success: false, message: 'Failed to upgrade property!' };
        }

        return {
            success: true,
            property: property,
            newLevel: newLevel,
            upgrade: upgrade
        };
    } catch (error) {
        console.error('Error in upgradeProperty:', error);
        // Refund on error
        await setUserMoney(userId, currentMoney);
        return { success: false, message: 'Upgrade failed!' };
    }
}

// Calculate property income and maintenance
function calculatePropertyStats(property, upgradeLevel) {
    let totalIncome = property.baseIncome;
    let totalMaintenance = property.baseMaintenance;

    for (let i = 0; i < upgradeLevel; i++) {
        if (property.upgrades[i]) {
            totalIncome += property.upgrades[i].incomeBoost;
            totalMaintenance += property.upgrades[i].maintenanceIncrease;
        }
    }

    return {
        dailyIncome: totalIncome,
        dailyMaintenance: totalMaintenance,
        netIncome: totalIncome - totalMaintenance
    };
}

// Get user's properties with stats (FIXED - now uses database)
async function getUserProperties(userId) {
    const userProperties = await getUserPropertiesDB(userId);

    if (userProperties.length === 0) return [];

    return userProperties.map(ownedProp => {
        const property = getPropertyById(ownedProp.propertyId);
        if (!property) return null;

        const stats = calculatePropertyStats(property, ownedProp.upgradeLevel || 0);

        return {
            ...property,
            upgradeLevel: ownedProp.upgradeLevel || 0,
            purchasedAt: ownedProp.purchasedAt,
            ...stats
        };
    }).filter(p => p !== null);
}

// Collect daily income from all properties (FIXED - now uses database)
async function collectPropertyIncome(userId) {
    const userProperties = await getUserProperties(userId);

    if (userProperties.length === 0) {
        return {
            success: false,
            message: 'You don\'t own any properties! Visit `/properties` to purchase one.'
        };
    }

    const now = Date.now();
    const lastCollection = await getPropertyLastCollected(userId);
    const oneDayMs = 24 * 60 * 60 * 1000;

    if (now - lastCollection < oneDayMs) {
        const timeLeft = oneDayMs - (now - lastCollection);
        const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
        const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

        return {
            success: false,
            message: `You can collect income again in ${hoursLeft}h ${minutesLeft}m`
        };
    }

    let totalIncome = 0;
    let totalMaintenance = 0;

    for (const property of userProperties) {
        totalIncome += property.dailyIncome;
        totalMaintenance += property.dailyMaintenance;
    }

    const netIncome = totalIncome - totalMaintenance;

    try {
        // Add money
        const currentMoney = await getUserMoney(userId);
        await setUserMoney(userId, currentMoney + netIncome);

        // Update last collection time in database
        await updatePropertyCollectionTime(userId);

        return {
            success: true,
            totalIncome,
            totalMaintenance,
            netIncome,
            propertyCount: userProperties.length
        };
    } catch (error) {
        console.error('Error in collectPropertyIncome:', error);
        return {
            success: false,
            message: 'Failed to collect income!'
        };
    }
}

module.exports = {
    PROPERTIES,
    getAllProperties,
    getPropertyById,
    canPurchaseProperty,
    purchaseProperty,
    upgradeProperty,
    calculatePropertyStats,
    getUserProperties,
    collectPropertyIncome
};
