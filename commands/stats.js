const { createStatsEmbed } = require('../utils/embeds');
const { getUserMoney } = require('../utils/data');

module.exports = {
    data: {
        name: 'stats',
        description: 'View your gambling statistics',
        options: [
            {
                name: 'user',
                description: 'View another user\'s stats (optional)',
                type: 6,
                required: false
            }
        ]
    },
    
    async execute(interaction) {
        try {
            const targetUser = interaction.options.getUser('user') || interaction.user;
            
            // Ensure the target user has data initialized
            await getUserMoney(targetUser.id);
            
            // Create and send the stats embed
            const statsEmbed = await createStatsEmbed(targetUser, interaction.client);
            await interaction.reply({ embeds: [statsEmbed] });
            
        } catch (error) {
            console.error('Error in stats command:', error);
            await interaction.reply({
                content: '❌ An error occurred while retrieving statistics. Please try again.',
                ephemeral: true
            });
        }
    }
};