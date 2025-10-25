const { createLeaderboardEmbed } = require('../utils/embeds');

module.exports = {
    data: {
        name: 'leaderboard',
        description: 'Show the blackjack money leaderboard'
    },
    
    async execute(interaction) {
        try {
            // Create and send leaderboard embed
            const leaderboardEmbed = await createLeaderboardEmbed(interaction.client);
            await interaction.reply({ embeds: [leaderboardEmbed] });
            
        } catch (error) {
            console.error('Error in leaderboard command:', error);

            const errorMessage = {
                content: '❌ An error occurred while retrieving the leaderboard. Please try again.',
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