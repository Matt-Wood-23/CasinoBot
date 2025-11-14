/**
 * Event Integration Utility
 * Automatically records game plays and results to active guild events
 */

const { getUserGuild } = require('./guilds');
const { getCurrentBossRaid, dealDamageToBoss } = require('./bossRaid');
const { getCurrentCasinoDomination, recordCasinoWinnings } = require('./casinoDomination');
const { getCurrentHeistFestival, getFestivalBonuses, recordFestivalHeist } = require('./heistFestival');

/**
 * Record a game play to active events
 * Call this after every game completion
 */
async function recordGameToEvents(userId, gameName, wagerAmount, winnings) {
    try {
        // Check if user is in a guild
        const userGuild = await getUserGuild(userId);
        if (!userGuild) {
            return { hasGuild: false };
        }

        const results = {
            hasGuild: true,
            bossRaid: null,
            casinoDomination: null
        };

        // Boss Raid - record damage dealt
        const bossRaid = await getCurrentBossRaid();
        if (bossRaid && bossRaid.event) {
            try {
                const damageResult = await dealDamageToBoss(
                    bossRaid.event.id,
                    userGuild.guildId,
                    userId,
                    gameName,
                    wagerAmount
                );

                results.bossRaid = damageResult;
            } catch (error) {
                console.error('Error recording boss raid damage:', error);
            }
        }

        // Casino Domination - record winnings (only if player won)
        if (winnings > 0) {
            const casinoDom = await getCurrentCasinoDomination();
            if (casinoDom) {
                try {
                    const winningsResult = await recordCasinoWinnings(
                        casinoDom.id,
                        userGuild.guildId,
                        userId,
                        gameName,
                        wagerAmount,
                        winnings
                    );

                    results.casinoDomination = winningsResult;
                } catch (error) {
                    console.error('Error recording casino domination winnings:', error);
                }
            }
        }

        return results;

    } catch (error) {
        console.error('Error in recordGameToEvents:', error);
        return { error: error.message };
    }
}

/**
 * Record a heist to active Heist Festival
 */
async function recordHeistToEvents(userId, successful, amountStolen, xpEarned) {
    try {
        // Check if user is in a guild
        const userGuild = await getUserGuild(userId);
        if (!userGuild) {
            return { hasGuild: false };
        }

        // Check for active Heist Festival
        const heistFest = await getCurrentHeistFestival();
        if (!heistFest) {
            return { hasGuild: true, heistFestival: null };
        }

        // Record heist to festival
        const result = await recordFestivalHeist(
            heistFest.id,
            userGuild.guildId,
            userId,
            successful,
            amountStolen,
            xpEarned
        );

        return {
            hasGuild: true,
            heistFestival: result
        };

    } catch (error) {
        console.error('Error in recordHeistToEvents:', error);
        return { error: error.message };
    }
}

/**
 * Get active Heist Festival bonuses (if any)
 * Call this before calculating heist rewards
 */
async function getActiveHeistBonuses() {
    try {
        const heistFest = await getCurrentHeistFestival();
        if (!heistFest) {
            return null;
        }

        return getFestivalBonuses();

    } catch (error) {
        console.error('Error getting heist bonuses:', error);
        return null;
    }
}

/**
 * Apply Heist Festival bonuses to winnings and penalties
 */
function applyHeistFestivalBonuses(bonuses, amount, isWinnings = true) {
    if (!bonuses) {
        return amount;
    }

    if (isWinnings) {
        // Apply winnings multiplier
        return Math.floor(amount * bonuses.winningsMultiplier);
    } else {
        // Apply penalty reduction
        return Math.floor(amount * bonuses.failurePenaltyReduction);
    }
}

/**
 * Get event notifications for game result
 * Returns messages to show to the player about event progress
 */
function getEventNotifications(eventResults) {
    const notifications = [];

    if (!eventResults || !eventResults.hasGuild) {
        return notifications;
    }

    // Boss Raid notification
    if (eventResults.bossRaid && eventResults.bossRaid.success) {
        const { damage, boss, defeated } = eventResults.bossRaid;

        if (defeated) {
            notifications.push(`🐉 **BOSS DEFEATED!** Your attack dealt the final ${damage.toLocaleString()} damage!`);
        } else {
            const hpPercent = ((boss.bossHpCurrent / boss.bossHpMax) * 100).toFixed(1);
            notifications.push(`🐉 **Boss Raid:** Dealt ${damage.toLocaleString()} damage! (Boss at ${hpPercent}% HP)`);
        }
    }

    // Casino Domination notification
    if (eventResults.casinoDomination && eventResults.casinoDomination.success) {
        const { data } = eventResults.casinoDomination;
        notifications.push(`🎰 **Casino Domination:** Your guild has earned $${data.totalWinnings.toLocaleString()} total!`);
    }

    return notifications;
}

module.exports = {
    recordGameToEvents,
    recordHeistToEvents,
    getActiveHeistBonuses,
    applyHeistFestivalBonuses,
    getEventNotifications
};
