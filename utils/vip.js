const { getUserData, saveUserData, getUserMoney, setUserMoney } = require('./data');

// VIP Tier Definitions
const VIP_TIERS = {
    bronze: {
        id: 'bronze',
        name: '🥉 Bronze VIP',
        level: 1,
        price: 5000,
        monthlyPrice: 5000,
        emoji: '🥉',
        color: '#CD7F32',
        perks: {
            workBonus: 0.10,          // 10% more work pay
            dailyBonus: 100,          // +$100 to daily bonus
            bettingLimit: 1.10,       // 10% higher betting limits
            loanRateDiscount: 0.02,   // -2% loan interest rate
            description: [
                '+10% work pay',
                '+$100 daily bonus',
                '+10% betting limits',
                '-2% loan interest'
            ]
        }
    },
    silver: {
        id: 'silver',
        name: '🥈 Silver VIP',
        level: 2,
        price: 15000,
        monthlyPrice: 15000,
        emoji: '🥈',
        color: '#C0C0C0',
        perks: {
            workBonus: 0.25,          // 25% more work pay
            dailyBonus: 250,          // +$250 to daily bonus
            bettingLimit: 1.25,       // 25% higher betting limits
            loanRateDiscount: 0.05,   // -5% loan interest rate
            description: [
                '+25% work pay',
                '+$250 daily bonus',
                '+25% betting limits',
                '-5% loan interest',
                'Access to Silver properties'
            ]
        }
    },
    gold: {
        id: 'gold',
        name: '🥇 Gold VIP',
        level: 3,
        price: 50000,
        monthlyPrice: 50000,
        emoji: '🥇',
        color: '#FFD700',
        perks: {
            workBonus: 0.50,          // 50% more work pay
            dailyBonus: 500,          // +$500 to daily bonus
            bettingLimit: 1.50,       // 50% higher betting limits
            loanRateDiscount: 0.10,   // -10% loan interest rate
            weeklyBonus: 2500,        // $2500 weekly bonus
            description: [
                '+50% work pay',
                '+$500 daily bonus',
                '+50% betting limits',
                '-10% loan interest',
                '$2,500 weekly bonus',
                'Access to Gold properties'
            ]
        }
    },
    platinum: {
        id: 'platinum',
        name: '💎 Platinum VIP',
        level: 4,
        price: 100000,
        monthlyPrice: 100000,
        emoji: '💎',
        color: '#E5E4E2',
        perks: {
            workBonus: 1.00,          // 100% more work pay (double)
            dailyBonus: 1000,         // +$1000 to daily bonus
            bettingLimit: 2.00,       // 100% higher betting limits (double)
            loanRateDiscount: 0.15,   // -15% loan interest rate
            weeklyBonus: 10000,       // $10,000 weekly bonus
            description: [
                '+100% work pay (DOUBLE)',
                '+$1,000 daily bonus',
                '+100% betting limits',
                '-15% loan interest',
                '$10,000 weekly bonus',
                'Access to Platinum properties',
                'Exclusive prestige badge'
            ]
        }
    }
};

// Initialize VIP status for a user
function initializeVIP(userId) {
    const userData = getUserData(userId);
    if (!userData) return null;

    if (!userData.vipStatus) {
        userData.vipStatus = {
            tier: null,
            level: 0,
            expiresAt: 0,
            purchasedAt: 0,
            renewalCount: 0,
            lastWeeklyBonus: 0
        };
    }

    return userData.vipStatus;
}

// Purchase or renew VIP
async function purchaseVIP(userId, tierId) {
    const tier = VIP_TIERS[tierId];
    if (!tier) {
        return { success: false, message: 'Invalid VIP tier!' };
    }

    const currentMoney = await getUserMoney(userId);

    if (currentMoney < tier.price) {
        return {
            success: false,
            message: `You don't have enough money! Need $${tier.price.toLocaleString()}, you have $${currentMoney.toLocaleString()}`
        };
    }

    const vipStatus = initializeVIP(userId);
    if (!vipStatus) {
        return { success: false, message: 'User data not found!' };
    }

    const now = Date.now();
    const oneMonthMs = 30 * 24 * 60 * 60 * 1000; // 30 days

    // Check if renewing same tier or upgrading
    const isRenewal = vipStatus.tier === tierId;
    const isUpgrade = vipStatus.tier && tier.level > VIP_TIERS[vipStatus.tier].level;

    // Deduct money
    await setUserMoney(userId, currentMoney - tier.price);

    // Update VIP status
    vipStatus.tier = tierId;
    vipStatus.level = tier.level;
    vipStatus.purchasedAt = now;

    // If renewing or upgrading and still active, extend from current expiry
    if ((isRenewal || isUpgrade) && now < vipStatus.expiresAt) {
        vipStatus.expiresAt += oneMonthMs;
    } else {
        vipStatus.expiresAt = now + oneMonthMs;
    }

    if (isRenewal) {
        vipStatus.renewalCount = (vipStatus.renewalCount || 0) + 1;
    } else {
        vipStatus.renewalCount = 0;
    }

    await saveUserData();

    return {
        success: true,
        tier: tier,
        expiresAt: vipStatus.expiresAt,
        isRenewal,
        isUpgrade
    };
}

// Check if user has active VIP
function hasActiveVIP(userId) {
    const vipStatus = initializeVIP(userId);
    if (!vipStatus) return false;

    return vipStatus.tier && Date.now() < vipStatus.expiresAt;
}

// Get user's VIP tier
function getUserVIPTier(userId) {
    const vipStatus = initializeVIP(userId);
    if (!vipStatus || !vipStatus.tier) return null;

    if (Date.now() >= vipStatus.expiresAt) {
        return null; // Expired
    }

    return VIP_TIERS[vipStatus.tier];
}

// Get VIP status info
function getVIPStatus(userId) {
    const vipStatus = initializeVIP(userId);
    if (!vipStatus) return null;

    const isActive = hasActiveVIP(userId);
    const tier = isActive ? VIP_TIERS[vipStatus.tier] : null;

    return {
        isActive,
        tier,
        expiresAt: vipStatus.expiresAt,
        daysRemaining: isActive ? Math.ceil((vipStatus.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)) : 0,
        renewalCount: vipStatus.renewalCount || 0
    };
}

// Get VIP work bonus
function getVIPWorkBonus(userId) {
    const tier = getUserVIPTier(userId);
    return tier ? tier.perks.workBonus : 0;
}

// Get VIP daily bonus
function getVIPDailyBonus(userId) {
    const tier = getUserVIPTier(userId);
    return tier ? tier.perks.dailyBonus : 0;
}

// Get VIP betting limit multiplier
function getVIPBettingLimit(userId) {
    const tier = getUserVIPTier(userId);
    return tier ? tier.perks.bettingLimit : 1.0;
}

// Get VIP loan rate discount
function getVIPLoanDiscount(userId) {
    const tier = getUserVIPTier(userId);
    return tier ? tier.perks.loanRateDiscount : 0;
}

// Check and claim weekly bonus (for Gold and Platinum)
async function claimWeeklyBonus(userId) {
    const vipStatus = initializeVIP(userId);
    if (!vipStatus) {
        return { success: false, message: 'User data not found!' };
    }

    const tier = getUserVIPTier(userId);
    if (!tier || !tier.perks.weeklyBonus) {
        return {
            success: false,
            message: 'You need Gold or Platinum VIP to claim weekly bonuses!'
        };
    }

    const now = Date.now();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    const lastClaim = vipStatus.lastWeeklyBonus || 0;

    if (now - lastClaim < oneWeekMs) {
        const timeLeft = oneWeekMs - (now - lastClaim);
        const daysLeft = Math.floor(timeLeft / (24 * 60 * 60 * 1000));
        const hoursLeft = Math.floor((timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

        return {
            success: false,
            message: `You can claim your weekly bonus in ${daysLeft}d ${hoursLeft}h`
        };
    }

    // Give weekly bonus
    const currentMoney = await getUserMoney(userId);
    await setUserMoney(userId, currentMoney + tier.perks.weeklyBonus);

    vipStatus.lastWeeklyBonus = now;
    await saveUserData();

    return {
        success: true,
        amount: tier.perks.weeklyBonus,
        tier: tier
    };
}

// Check for expired VIP (run daily)
async function checkExpiredVIP() {
    const { getAllUserData } = require('./data');
    const allUserData = getAllUserData();
    const expiredUsers = [];

    for (const [userId, userData] of Object.entries(allUserData)) {
        if (userData.vipStatus && userData.vipStatus.tier) {
            if (Date.now() >= userData.vipStatus.expiresAt) {
                expiredUsers.push({
                    userId,
                    tier: userData.vipStatus.tier
                });
                // Clear VIP status
                userData.vipStatus.tier = null;
                userData.vipStatus.level = 0;
            }
        }
    }

    if (expiredUsers.length > 0) {
        await saveUserData();
    }

    return expiredUsers;
}

// Get all tier info
function getAllVIPTiers() {
    return Object.values(VIP_TIERS);
}

// Get tier by ID
function getVIPTierById(tierId) {
    return VIP_TIERS[tierId] || null;
}

module.exports = {
    VIP_TIERS,
    initializeVIP,
    purchaseVIP,
    hasActiveVIP,
    getUserVIPTier,
    getVIPStatus,
    getVIPWorkBonus,
    getVIPDailyBonus,
    getVIPBettingLimit,
    getVIPLoanDiscount,
    claimWeeklyBonus,
    checkExpiredVIP,
    getAllVIPTiers,
    getVIPTierById
};
