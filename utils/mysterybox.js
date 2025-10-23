const { getUserMoney, setUserMoney, saveUserData } = require('./data');
const { SHOP_ITEMS } = require('./shop');

// Mystery Box Tiers
const BOX_TIERS = {
    basic: {
        id: 'basic',
        name: '📦 Basic Mystery Box',
        price: 5000,
        emoji: '📦',
        color: '#808080',
        rewards: {
            money: {
                weight: 60,
                amounts: [
                    { amount: 3000, weight: 30 },
                    { amount: 5000, weight: 25 },
                    { amount: 7500, weight: 20 },
                    { amount: 10000, weight: 15 },
                    { amount: 15000, weight: 10 }
                ]
            },
            items: {
                weight: 40,
                types: [
                    { itemId: 'luck_boost', weight: 40 },
                    { itemId: 'insurance', weight: 30 },
                    { itemId: 'big_spender_pass', weight: 20 },
                    { itemId: 'xp_boost', weight: 10 }
                ]
            }
        }
    },
    premium: {
        id: 'premium',
        name: '💎 Premium Mystery Box',
        price: 15000,
        emoji: '💎',
        color: '#9B59B6',
        rewards: {
            money: {
                weight: 50,
                amounts: [
                    { amount: 12000, weight: 25 },
                    { amount: 18000, weight: 25 },
                    { amount: 25000, weight: 20 },
                    { amount: 35000, weight: 15 },
                    { amount: 50000, weight: 10 },
                    { amount: 75000, weight: 5 }
                ]
            },
            items: {
                weight: 50,
                types: [
                    { itemId: 'luck_boost', weight: 20, quantity: 2 },
                    { itemId: 'insurance', weight: 20, quantity: 2 },
                    { itemId: 'xp_boost', weight: 25, quantity: 1 },
                    { itemId: 'win_streak_protector', weight: 20, quantity: 1 },
                    { itemId: 'double_daily', weight: 15, quantity: 1 }
                ]
            }
        }
    },
    legendary: {
        id: 'legendary',
        name: '⭐ Legendary Mystery Box',
        price: 50000,
        emoji: '⭐',
        color: '#FFD700',
        rewards: {
            money: {
                weight: 45,
                amounts: [
                    { amount: 40000, weight: 20 },
                    { amount: 65000, weight: 20 },
                    { amount: 100000, weight: 20 },
                    { amount: 150000, weight: 15 },
                    { amount: 250000, weight: 15 },
                    { amount: 500000, weight: 10 }
                ]
            },
            items: {
                weight: 55,
                types: [
                    { itemId: 'luck_boost', weight: 15, quantity: 5 },
                    { itemId: 'insurance', weight: 15, quantity: 3 },
                    { itemId: 'xp_boost', weight: 20, quantity: 3 },
                    { itemId: 'win_streak_protector', weight: 20, quantity: 2 },
                    { itemId: 'double_daily', weight: 20, quantity: 2 },
                    { itemId: 'big_spender_pass', weight: 10, quantity: 3 }
                ]
            }
        }
    }
};

// Weighted random selection
function weightedRandom(items) {
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;

    for (const item of items) {
        random -= item.weight;
        if (random <= 0) {
            return item;
        }
    }

    return items[items.length - 1];
}

// Open a mystery box
async function openMysteryBox(userId, tierId) {
    const tier = BOX_TIERS[tierId];
    if (!tier) {
        return { success: false, message: 'Invalid mystery box tier!' };
    }

    const currentMoney = await getUserMoney(userId);

    if (currentMoney < tier.price) {
        return {
            success: false,
            message: `You don't have enough money! Need $${tier.price.toLocaleString()}, you have $${currentMoney.toLocaleString()}`
        };
    }

    // Deduct cost
    await setUserMoney(userId, currentMoney - tier.price);

    // Determine if reward is money or item
    const rewardTypes = [
        { type: 'money', weight: tier.rewards.money.weight },
        { type: 'items', weight: tier.rewards.items.weight }
    ];

    const rewardType = weightedRandom(rewardTypes).type;

    let reward;

    if (rewardType === 'money') {
        // Select money amount
        const moneyReward = weightedRandom(tier.rewards.money.amounts);
        await setUserMoney(userId, currentMoney - tier.price + moneyReward.amount);

        reward = {
            type: 'money',
            amount: moneyReward.amount,
            emoji: '💰',
            description: `$${moneyReward.amount.toLocaleString()}`
        };
    } else {
        // Select item
        const itemReward = weightedRandom(tier.rewards.items.types);
        const item = SHOP_ITEMS[itemReward.itemId];
        const quantity = itemReward.quantity || 1;

        // Add items to inventory
        const { getUserData } = require('./data');
        const userData = getUserData(userId);

        if (!userData.inventory) {
            userData.inventory = [];
        }

        for (let i = 0; i < quantity; i++) {
            const inventoryItem = {
                ...item,
                purchasedAt: Date.now(),
                id: `${item.id}_${Date.now()}_${Math.random()}`
            };
            userData.inventory.push(inventoryItem);
        }

        await saveUserData();

        reward = {
            type: 'item',
            itemId: itemReward.itemId,
            quantity: quantity,
            emoji: item.emoji || item.name.split(' ')[0],
            description: quantity > 1 ? `${item.name} x${quantity}` : item.name
        };
    }

    return {
        success: true,
        tier: tier,
        reward: reward
    };
}

// Get box tier info
function getBoxTier(tierId) {
    return BOX_TIERS[tierId] || null;
}

// Get all tiers
function getAllBoxTiers() {
    return Object.values(BOX_TIERS);
}

module.exports = {
    BOX_TIERS,
    openMysteryBox,
    getBoxTier,
    getAllBoxTiers
};
