const { createHistoryEmbed } = require('../utils/embeds');
const { getUserMoney } = require('../utils/data');

module.exports = {
    data: {
        name: 'history',
        description: 'View your recent game history',
        options: [
            {
                name: 'games',
                description: 'Number of recent games to show (1-20)',
                type: 4,
                required: false,
                min_value: 1,
                max_value: 20
            }
        ]
    },
    
    async execute(interaction) {
        try {
            const gamesToShow = interaction.options.getInteger('games') || 10;
            
            // Ensure user data exists
            await getUserMoney(interaction.user.id);
            
            // Create and send history embed
            const historyEmbed = await createHistoryEmbed(interaction.user, gamesToShow);
            await interaction.reply({ embeds: [historyEmbed] });
            
        } catch (error) {
            console.error('Error in history command:', error);

            const errorMessage = {
                content: '❌ An error occurred while retrieving your game history. Please try again.',
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