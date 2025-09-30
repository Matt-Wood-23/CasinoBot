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
            await setUserMoney(interaction.user.id, userMoney + 500);
            await setLastDaily(interaction.user.id);
            
            await interaction.reply('🎁 Daily **$500** bonus claimed!');
        } catch (error) {
            console.error('Error in daily command:', error);
            await interaction.reply({
                content: '❌ An error occurred while claiming your daily bonus. Please try again.',
                ephemeral: true
            });
        }
    }
};