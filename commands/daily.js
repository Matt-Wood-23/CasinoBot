const { getUserMoney, setUserMoney, canClaimDaily, setLastDaily, getTimeUntilNextDaily } = require('../utils/data');

module.exports = {
    data: {
        name: 'daily',
        description: 'Claim your daily bonus (if you have less than $50)'
    },
    
    async execute(interaction) {
        try {
            const userMoney = await getUserMoney(interaction.user.id);
            
            // Check if daily is available
            if (!(await canClaimDaily(interaction.user.id))) {
                const timeUntilNext = getTimeUntilNextDaily(interaction.user.id);
                const hours = Math.floor(timeUntilNext / (1000 * 60 * 60));
                const minutes = Math.floor((timeUntilNext % (1000 * 60 * 60)) / (1000 * 60));
                
                return await interaction.reply({
                    content: `⏰ You can claim your daily bonus again in **${hours}h ${minutes}m**!`,
                    ephemeral: true
                });
            }
            
            // Give daily bonus
            let dailyAmount = 500;
            let doubleBoostUsed = false;
            let vipBonusAmount = 0;

            // Apply VIP daily bonus
            const { getVIPDailyBonus } = require('../utils/vip');
            vipBonusAmount = getVIPDailyBonus(interaction.user.id);
            dailyAmount += vipBonusAmount;

            // Check for Double Daily boost
            const { hasActiveBoost, consumeBoost } = require('../utils/shop');
            if (hasActiveBoost(interaction.user.id, 'double_daily')) {
                dailyAmount *= 2;
                await consumeBoost(interaction.user.id, 'double_daily');
                doubleBoostUsed = true;
            }

            await setUserMoney(interaction.user.id, userMoney + dailyAmount);
            await setLastDaily(interaction.user.id);

            let message = `🎁 Daily bonus claimed! **$${dailyAmount.toLocaleString()}**`;

            if (doubleBoostUsed && vipBonusAmount > 0) {
                message += ` (💎 Double Daily boost + 👑 VIP bonus activated!)`;
            } else if (doubleBoostUsed) {
                message += ` (💎 Double Daily boost activated!)`;
            } else if (vipBonusAmount > 0) {
                message += ` (👑 VIP bonus: +$${vipBonusAmount})`;
            }

            await interaction.reply(message);
        } catch (error) {
            console.error('Error in daily command:', error);
            await interaction.reply({
                content: '❌ An error occurred while claiming your daily bonus. Please try again.',
                ephemeral: true
            });
        }
    }
};