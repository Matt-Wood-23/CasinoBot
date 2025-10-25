const { getUserMoney, setUserMoney, recordGameResult } = require('../utils/data');
const { createGameEmbed } = require('../utils/embeds');
const { createButtons } = require('../utils/buttons');
const SlotsGame = require('../gameLogic/slotsGame');

module.exports = {
    data: {
        name: 'slots',
        description: 'Play slots',
        options: [
            {
                name: 'bet',
                description: 'Amount to bet per spin (1-1000)',
                type: 4,
                required: true,
                min_value: 1,
                max_value: 1000
            }
        ]
    },
    
    async execute(interaction) {
        try {
            const bet = interaction.options.getInteger('bet');
            const userMoney = await getUserMoney(interaction.user.id);

            // Check if user has enough money
            if (userMoney < bet) {
                return await interaction.reply({ 
                    content: `❌ You don't have enough money! You have ${userMoney.toLocaleString()}.`, 
                    ephemeral: true 
                });
            }

            // Deduct bet and create game
            await setUserMoney(interaction.user.id, userMoney - bet);
            const slotsGame = new SlotsGame(interaction.user.id, bet);
            
            // Update user's money with winnings
            await setUserMoney(interaction.user.id, userMoney - bet + slotsGame.winnings);
            
            // Record the game result
            await recordGameResult(
                interaction.user.id, 
                'slots', 
                bet, 
                slotsGame.winnings, 
                slotsGame.winnings > 0 ? 'win' : 'lose'
            );

            // Create and send the result
            const embed = await createGameEmbed(slotsGame, interaction.user.id, interaction.client);
            const buttons = await createButtons(slotsGame, interaction.user.id, interaction.client);
            
            await interaction.reply({
                embeds: [embed],
                components: buttons ? [buttons] : []
            });
            
        } catch (error) {
            console.error('Error in slots command:', error);

            const errorMessage = {
                content: '❌ An error occurred while playing slots. Please try again.',
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