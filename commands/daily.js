const { getUserMoney, setUserMoney, canClaimDaily, setLastDaily, getTimeUntilNextDaily } = require('../utils/data');
const { updateLoginStreak, getStreakMultiplier, getNextStreakMilestone } = require('../database/queries');
const { getCurrentHoliday, getHolidayMultiplier } = require('../utils/holidayEvents');

module.exports = {
    data: {
        name: 'daily',
        description: 'Claim your daily bonus - Build your login streak for bigger rewards!'
    },

    async execute(interaction) {
        try {
            const userMoney = await getUserMoney(interaction.user.id);

            // Check if daily is available
            if (!(await canClaimDaily(interaction.user.id))) {
                const timeUntilNext = await getTimeUntilNextDaily(interaction.user.id);
                const hours = Math.floor(timeUntilNext / (1000 * 60 * 60));
                const minutes = Math.floor((timeUntilNext % (1000 * 60 * 60)) / (1000 * 60));

                return await interaction.reply({
                    content: `⏰ You can claim your daily bonus again in **${hours}h ${minutes}m**!`,
                    ephemeral: true
                });
            }

            // Update login streak
            const streakData = await updateLoginStreak(interaction.user.id, true);
            const streakMultiplier = getStreakMultiplier(streakData.currentStreak);

            // Base daily bonus
            let baseDailyAmount = 500;
            let dailyAmount = Math.floor(baseDailyAmount * streakMultiplier);

            let bonusBreakdown = [];
            let doubleBoostUsed = false;
            let vipBonusAmount = 0;
            let holidayBonusAmount = 0;

            // Apply VIP daily bonus
            const { getVIPDailyBonus } = require('../utils/vip');
            vipBonusAmount = await getVIPDailyBonus(interaction.user.id);
            if (vipBonusAmount > 0) {
                dailyAmount += vipBonusAmount;
                bonusBreakdown.push(`👑 VIP: +$${vipBonusAmount}`);
            }

            // Check for active holiday event
            const currentHoliday = getCurrentHoliday();
            if (currentHoliday) {
                const holidayMultiplier = getHolidayMultiplier('dailyMultiplier', currentHoliday.id);
                if (holidayMultiplier > 1.0) {
                    const beforeHoliday = dailyAmount;
                    dailyAmount = Math.floor(dailyAmount * holidayMultiplier);
                    holidayBonusAmount = dailyAmount - beforeHoliday;
                    bonusBreakdown.push(`${currentHoliday.emoji} ${currentHoliday.name}: +$${holidayBonusAmount}`);
                }
            }

            // Check for Double Daily boost
            const { hasActiveBoost, consumeBoost } = require('../utils/shop');
            if (await hasActiveBoost(interaction.user.id, 'double_daily')) {
                dailyAmount *= 2;
                await consumeBoost(interaction.user.id, 'double_daily');
                doubleBoostUsed = true;
                bonusBreakdown.push('💎 Double Daily Boost: x2');
            }

            // Update user money
            await setUserMoney(interaction.user.id, userMoney + dailyAmount);
            await setLastDaily(interaction.user.id);

            // Build response message
            let message = `🎁 **Daily Bonus Claimed!**\n\n`;
            message += `💰 You received: **$${dailyAmount.toLocaleString()}**\n\n`;

            // Streak info
            const streakEmoji = streakData.currentStreak >= 7 ? '🔥' : '📅';
            message += `${streakEmoji} **Login Streak: ${streakData.currentStreak} day${streakData.currentStreak !== 1 ? 's' : ''}**\n`;

            if (streakData.wasReset && streakData.currentStreak === 1) {
                message += `⚠️ Your streak was reset! Claim daily to build it back up.\n`;
            }

            if (streakMultiplier > 1.0) {
                message += `🎯 Streak Bonus: **x${streakMultiplier.toFixed(1)}** (Base: $${baseDailyAmount} → $${Math.floor(baseDailyAmount * streakMultiplier)})\n`;
            }

            // Next milestone
            const nextMilestone = getNextStreakMilestone(streakData.currentStreak);
            if (nextMilestone) {
                const nextMultiplier = getStreakMultiplier(nextMilestone);
                message += `⭐ Next Milestone: **${nextMilestone} days** (x${nextMultiplier.toFixed(1)} multiplier)\n`;
            } else {
                message += `🏆 **MAX STREAK!** You're at the highest multiplier!\n`;
            }

            if (streakData.bestStreak > streakData.currentStreak) {
                message += `🥇 Personal Best: ${streakData.bestStreak} days\n`;
            } else if (streakData.currentStreak > 1) {
                message += `🥇 **New Personal Best!**\n`;
            }

            // Bonus breakdown
            if (bonusBreakdown.length > 0) {
                message += `\n📊 **Bonuses Applied:**\n${bonusBreakdown.join('\n')}`;
            }

            // New balance
            message += `\n\n💵 New Balance: **$${(userMoney + dailyAmount).toLocaleString()}**`;

            await interaction.reply(message);
        } catch (error) {
            console.error('Error in daily command:', error);

            const errorMessage = {
                content: '❌ An error occurred while claiming your daily bonus. Please try again.',
                ephemeral: true
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        }
    }
};