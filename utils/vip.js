const {
    getUserMoney,
    setUserMoney,
    purchaseVIPDB,
    getUserVIPDB,
    claimVIPWeeklyBonusDB,
    expireVIPsDB
} = require('./data');

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

// Purchase or renew VIP (FIXED - now uses database)
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

    try {
        const vipStatus = await getUserVIPDB(userId);
        const now = Date.now();
        const oneMonthMs = 30 * 24 * 60 * 60 * 1000; // 30 days

        // Check if renewing same tier or upgrading
        const isRenewal = vipStatus && vipStatus.tier === tierId;
        const isUpgrade = vipStatus && vipStatus.tier && VIP_TIERS[vipStatus.tier].level < tier.level;

        // Calculate expiry date
        let expiresAt;
        if (vipStatus && (isRenewal || isUpgrade) && now < vipStatus.expiresAt) {
            // Extend from current expiry if still active
            expiresAt = vipStatus.expiresAt + oneMonthMs;
        } else {
            // Start from now
            expiresAt = now + oneMonthMs;
        }

        // Deduct money
        await setUserMoney(userId, currentMoney - tier.price);

        // Update VIP in database
        const success = await purchaseVIPDB(userId, tierId, expiresAt, isRenewal);

        if (!success) {
            // Refund if database operation failed
            await setUserMoney(userId, currentMoney);
            return { success: false, message: 'Failed to purchase VIP!' };
        }

        return {
            success: true,
            tier: tier,
            expiresAt: expiresAt,
            isRenewal,
            isUpgrade
        };
    } catch (error) {
        console.error('Error in purchaseVIP:', error);
        // Refund on error
        await setUserMoney(userId, currentMoney);
        return { success: false, message: 'Purchase failed!' };
    }
}

// Check if user has active VIP (FIXED - now uses database)
async function hasActiveVIP(userId) {
    const vipStatus = await getUserVIPDB(userId);
    if (!vipStatus) return false;

    return vipStatus.tier && Date.now() < vipStatus.expiresAt;
}

// Get user's VIP tier (FIXED - now uses database)
async function getUserVIPTier(userId) {
    const vipStatus = await getUserVIPDB(userId);
    if (!vipStatus || !vipStatus.tier) return null;

    if (Date.now() >= vipStatus.expiresAt) {
        return null; // Expired
    }

    return VIP_TIERS[vipStatus.tier];
}

// Get VIP status info (FIXED - now uses database)
async function getVIPStatus(userId) {
    const vipStatus = await getUserVIPDB(userId);
    if (!vipStatus) {
        return {
            isActive: false,
            tier: null,
            expiresAt: 0,
            daysRemaining: 0,
            renewalCount: 0
        };
    }

    const isActive = Date.now() < vipStatus.expiresAt;
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
async function getVIPWorkBonus(userId) {
    const tier = await getUserVIPTier(userId);
    return tier ? tier.perks.workBonus : 0;
}

// Get VIP daily bonus
async function getVIPDailyBonus(userId) {
    const tier = await getUserVIPTier(userId);
    return tier ? tier.perks.dailyBonus : 0;
}

// Get VIP betting limit multiplier
async function getVIPBettingLimit(userId) {
    const tier = await getUserVIPTier(userId);
    return tier ? tier.perks.bettingLimit : 1.0;
}

// Calculate max bet allowed for user based on VIP tier
async function getMaxBetForUser(userId, baseMaxBet) {
    const multiplier = await getVIPBettingLimit(userId);
    return Math.floor(baseMaxBet * multiplier);
}

// Validate bet amount against VIP limits
async function validateBet(userId, bet, baseMinBet, baseMaxBet) {
    const tier = await getUserVIPTier(userId);
    const maxAllowed = await getMaxBetForUser(userId, baseMaxBet);

    if (bet < baseMinBet) {
        return {
            valid: false,
            message: `❌ Minimum bet is $${baseMinBet.toLocaleString()}!`
        };
    }

    if (bet > maxAllowed) {
        if (tier) {
            return {
                valid: false,
                message: `❌ Your ${tier.emoji} ${tier.name} max bet is $${maxAllowed.toLocaleString()}!`
            };
        } else {
            return {
                valid: false,
                message: `❌ Maximum bet is $${baseMaxBet.toLocaleString()}! Upgrade VIP for higher limits:\n` +
                        `🥉 Bronze: $${Math.floor(baseMaxBet * 1.10).toLocaleString()}\n` +
                        `🥈 Silver: $${Math.floor(baseMaxBet * 1.25).toLocaleString()}\n` +
                        `🥇 Gold: $${Math.floor(baseMaxBet * 1.50).toLocaleString()}\n` +
                        `💎 Platinum: $${Math.floor(baseMaxBet * 2.00).toLocaleString()}`
            };
        }
    }

    return { valid: true };
}

// Get VIP loan rate discount
async function getVIPLoanDiscount(userId) {
    const tier = await getUserVIPTier(userId);
    return tier ? tier.perks.loanRateDiscount : 0;
}

// Check and claim weekly bonus (for Gold and Platinum) (FIXED - now uses database)
async function claimWeeklyBonus(userId) {
    const vipStatus = await getUserVIPDB(userId);
    if (!vipStatus) {
        return { success: false, message: 'User data not found!' };
    }

    const tier = await getUserVIPTier(userId);
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

    try {
        // Give weekly bonus
        const currentMoney = await getUserMoney(userId);
        await setUserMoney(userId, currentMoney + tier.perks.weeklyBonus);

        // Update claim time in database
        await claimVIPWeeklyBonusDB(userId);

        return {
            success: true,
            amount: tier.perks.weeklyBonus,
            tier: tier
        };
    } catch (error) {
        console.error('Error in claimWeeklyBonus:', error);
        return {
            success: false,
            message: 'Failed to claim weekly bonus!'
        };
    }
}

// Check for expired VIP (run daily) (FIXED - now uses database)
async function checkExpiredVIP() {
    try {
        const expiredUsers = await expireVIPsDB();
        return expiredUsers;
    } catch (error) {
        console.error('Error in checkExpiredVIP:', error);
        return [];
    }
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
    purchaseVIP,
    hasActiveVIP,
    getUserVIPTier,
    getVIPStatus,
    getVIPWorkBonus,
    getVIPDailyBonus,
    getVIPBettingLimit,
    getMaxBetForUser,
    validateBet,
    getVIPLoanDiscount,
    claimWeeklyBonus,
    checkExpiredVIP,
    getAllVIPTiers,
    getVIPTierById
};
