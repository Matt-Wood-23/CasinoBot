// Guild Shop Effects - Apply purchased item effects to gameplay
// This module checks for active boosts and applies them to games, commands, etc.

const { getActivePurchases, useConsumableItem } = require('../database/queries');

/**
 * Get all active effects for a user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Object with all active effects
 */
async function getUserEffects(userId) {
    try {
        const purchases = await getActivePurchases(userId);

        const effects = {
            xpMultiplier: 1.0,
            luckBonus: 0,
            winningsMultiplier: 1.0,
            dailyMultiplier: 1.0,
            workMultiplier: 1.0,
            heistProtection: false,
            jackpotBoost: 0,
            customTitle: null,
            badge: null,
            nameColor: null,
            activeItems: []
        };

        for (const purchase of purchases) {
            const effect = typeof purchase.effect === 'string'
                ? JSON.parse(purchase.effect)
                : purchase.effect;

            effects.activeItems.push({
                id: purchase.id,
                name: purchase.itemName,
                type: purchase.itemType,
                effect
            });

            // Apply effects based on type
            if (effect.xp_multiplier) {
                effects.xpMultiplier = Math.max(effects.xpMultiplier, effect.xp_multiplier);
            }

            if (effect.luck_bonus) {
                effects.luckBonus = Math.max(effects.luckBonus, effect.luck_bonus);
            }

            if (effect.winnings_multiplier) {
                effects.winningsMultiplier = Math.max(effects.winningsMultiplier, effect.winnings_multiplier);
            }

            if (effect.daily_multiplier && purchase.timesUsed < (purchase.maxUses || 1)) {
                effects.dailyMultiplier = Math.max(effects.dailyMultiplier, effect.daily_multiplier);
            }

            if (effect.work_multiplier && purchase.timesUsed < (purchase.maxUses || 1)) {
                effects.workMultiplier = Math.max(effects.workMultiplier, effect.work_multiplier);
            }

            if (effect.heist_protection && purchase.timesUsed < (purchase.maxUses || 1)) {
                effects.heistProtection = true;
            }

            if (effect.jackpot_boost && purchase.timesUsed < (purchase.maxUses || 1)) {
                effects.jackpotBoost = Math.max(effects.jackpotBoost, effect.jackpot_boost);
            }

            // Cosmetic effects
            if (effect.badge) {
                effects.badge = effect.badge;
            }

            if (effect.name_color) {
                effects.nameColor = effect.name_color;
            }

            if (effect.allows_custom_title) {
                effects.customTitle = 'enabled'; // Placeholder - implement title storage separately
            }
        }

        return effects;
    } catch (error) {
        console.error('Error getting user effects:', error);
        return getDefaultEffects();
    }
}

/**
 * Get default effects (no boosts)
 * @returns {Object} Default effects object
 */
function getDefaultEffects() {
    return {
        xpMultiplier: 1.0,
        luckBonus: 0,
        winningsMultiplier: 1.0,
        dailyMultiplier: 1.0,
        workMultiplier: 1.0,
        heistProtection: false,
        jackpotBoost: 0,
        customTitle: null,
        badge: null,
        nameColor: null,
        activeItems: []
    };
}

/**
 * Apply XP multiplier to XP gain
 * @param {string} userId - User ID
 * @param {number} baseXP - Base XP amount
 * @returns {Promise<number>} Modified XP amount
 */
async function applyXPBoost(userId, baseXP) {
    try {
        const effects = await getUserEffects(userId);
        return Math.floor(baseXP * effects.xpMultiplier);
    } catch (error) {
        console.error('Error applying XP boost:', error);
        return baseXP;
    }
}

/**
 * Apply winnings multiplier to game winnings
 * @param {string} userId - User ID
 * @param {number} baseWinnings - Base winnings amount
 * @returns {Promise<number>} Modified winnings amount
 */
async function applyWinningsBoost(userId, baseWinnings) {
    try {
        const effects = await getUserEffects(userId);
        if (effects.winningsMultiplier > 1.0) {
            return Math.floor(baseWinnings * effects.winningsMultiplier);
        }
        return baseWinnings;
    } catch (error) {
        console.error('Error applying winnings boost:', error);
        return baseWinnings;
    }
}

/**
 * Apply luck bonus to game odds
 * @param {string} userId - User ID
 * @param {number} baseOdds - Base odds (0-1)
 * @returns {Promise<number>} Modified odds
 */
async function applyLuckBonus(userId, baseOdds) {
    try {
        const effects = await getUserEffects(userId);
        if (effects.luckBonus > 0) {
            return Math.min(1.0, baseOdds + effects.luckBonus);
        }
        return baseOdds;
    } catch (error) {
        console.error('Error applying luck bonus:', error);
        return baseOdds;
    }
}

/**
 * Use a daily boost consumable (Fortune Cookie)
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Result with multiplier
 */
async function useDailyBoost(userId) {
    try {
        const purchases = await getActivePurchases(userId, 'consumable');
        const dailyBoost = purchases.find(p => {
            const effect = typeof p.effect === 'string' ? JSON.parse(p.effect) : p.effect;
            return effect.daily_multiplier && p.timesUsed < (p.maxUses || 1);
        });

        if (dailyBoost) {
            await useConsumableItem(dailyBoost.id);
            const effect = typeof dailyBoost.effect === 'string'
                ? JSON.parse(dailyBoost.effect)
                : dailyBoost.effect;
            return {
                success: true,
                multiplier: effect.daily_multiplier,
                itemName: dailyBoost.itemName
            };
        }

        return { success: false, multiplier: 1.0 };
    } catch (error) {
        console.error('Error using daily boost:', error);
        return { success: false, multiplier: 1.0 };
    }
}

/**
 * Use a work boost consumable (Overtime Pass)
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Result with multiplier
 */
async function useWorkBoost(userId) {
    try {
        const purchases = await getActivePurchases(userId, 'consumable');
        const workBoost = purchases.find(p => {
            const effect = typeof p.effect === 'string' ? JSON.parse(p.effect) : p.effect;
            return effect.work_multiplier && p.timesUsed < (p.maxUses || 1);
        });

        if (workBoost) {
            await useConsumableItem(workBoost.id);
            const effect = typeof workBoost.effect === 'string'
                ? JSON.parse(workBoost.effect)
                : workBoost.effect;
            return {
                success: true,
                multiplier: effect.work_multiplier,
                itemName: workBoost.itemName
            };
        }

        return { success: false, multiplier: 1.0 };
    } catch (error) {
        console.error('Error using work boost:', error);
        return { success: false, multiplier: 1.0 };
    }
}

/**
 * Check if user has heist protection and use it if needed
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True if protected
 */
async function useHeistProtection(userId) {
    try {
        const purchases = await getActivePurchases(userId, 'consumable');
        const protection = purchases.find(p => {
            const effect = typeof p.effect === 'string' ? JSON.parse(p.effect) : p.effect;
            return effect.heist_protection && p.timesUsed < (p.maxUses || 1);
        });

        if (protection) {
            await useConsumableItem(protection.id);
            return true;
        }

        return false;
    } catch (error) {
        console.error('Error checking heist protection:', error);
        return false;
    }
}

/**
 * Use a jackpot ticket boost
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Result with boost amount
 */
async function useJackpotBoost(userId) {
    try {
        const purchases = await getActivePurchases(userId, 'consumable');
        const jackpotTicket = purchases.find(p => {
            const effect = typeof p.effect === 'string' ? JSON.parse(p.effect) : p.effect;
            return effect.jackpot_boost && p.timesUsed < (p.maxUses || 1);
        });

        if (jackpotTicket) {
            await useConsumableItem(jackpotTicket.id);
            const effect = typeof jackpotTicket.effect === 'string'
                ? JSON.parse(jackpotTicket.effect)
                : jackpotTicket.effect;
            return {
                success: true,
                boost: effect.jackpot_boost,
                itemName: jackpotTicket.itemName,
                remainingUses: (jackpotTicket.maxUses || 1) - jackpotTicket.timesUsed - 1
            };
        }

        return { success: false, boost: 0 };
    } catch (error) {
        console.error('Error using jackpot boost:', error);
        return { success: false, boost: 0 };
    }
}

/**
 * Check if user can reset daily (has reset token)
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True if has token
 */
async function canResetDaily(userId) {
    try {
        const purchases = await getActivePurchases(userId, 'consumable');
        const resetToken = purchases.find(p => {
            const effect = typeof p.effect === 'string' ? JSON.parse(p.effect) : p.effect;
            return effect.resets === 'daily' && p.timesUsed < (p.maxUses || 1);
        });

        return !!resetToken;
    } catch (error) {
        console.error('Error checking daily reset:', error);
        return false;
    }
}

/**
 * Use daily reset token
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True if used successfully
 */
async function useDailyResetToken(userId) {
    try {
        const purchases = await getActivePurchases(userId, 'consumable');
        const resetToken = purchases.find(p => {
            const effect = typeof p.effect === 'string' ? JSON.parse(p.effect) : p.effect;
            return effect.resets === 'daily' && p.timesUsed < (p.maxUses || 1);
        });

        if (resetToken) {
            await useConsumableItem(resetToken.id);
            return true;
        }

        return false;
    } catch (error) {
        console.error('Error using daily reset token:', error);
        return false;
    }
}

/**
 * Check if user can reset work (has reset token)
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True if has token
 */
async function canResetWork(userId) {
    try {
        const purchases = await getActivePurchases(userId, 'consumable');
        const resetToken = purchases.find(p => {
            const effect = typeof p.effect === 'string' ? JSON.parse(p.effect) : p.effect;
            return effect.resets === 'work' && p.timesUsed < (p.maxUses || 1);
        });

        return !!resetToken;
    } catch (error) {
        console.error('Error checking work reset:', error);
        return false;
    }
}

/**
 * Use work reset token
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True if used successfully
 */
async function useWorkResetToken(userId) {
    try {
        const purchases = await getActivePurchases(userId, 'consumable');
        const resetToken = purchases.find(p => {
            const effect = typeof p.effect === 'string' ? JSON.parse(p.effect) : p.effect;
            return effect.resets === 'work' && p.timesUsed < (p.maxUses || 1);
        });

        if (resetToken) {
            await useConsumableItem(resetToken.id);
            return true;
        }

        return false;
    } catch (error) {
        console.error('Error using work reset token:', error);
        return false;
    }
}

/**
 * Get user's display badge (from shop items)
 * @param {string} userId - User ID
 * @returns {Promise<string|null>} Badge emoji or null
 */
async function getUserBadge(userId) {
    try {
        const effects = await getUserEffects(userId);
        return effects.badge;
    } catch (error) {
        console.error('Error getting user badge:', error);
        return null;
    }
}

module.exports = {
    getUserEffects,
    getDefaultEffects,
    applyXPBoost,
    applyWinningsBoost,
    applyLuckBonus,
    useDailyBoost,
    useWorkBoost,
    useHeistProtection,
    useJackpotBoost,
    canResetDaily,
    useDailyResetToken,
    canResetWork,
    useWorkResetToken,
    getUserBadge
};
