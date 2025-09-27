const { getUserMoney, setUserMoney } = require('../utils/data');
const { createGameEmbed } = require('../utils/embeds');
const { createJoinTableButton } = require('../utils/buttons');
const BlackjackGame = require('../gameLogic/blackjackGame');

module.exports = {
    data: {
        name: 'starttable',
        description: 'Start a multi-player blackjack table',
        options: [
            {
                name: 'bet',
                description: 'Your bet (10-500,000)',
                type: 4,
                required: true,
                min_value: 10,
                max_value: 500000
            }
        ]
    },
    
    async execute(interaction, activeGames, dealCardsWithDelay) {
        try {
            const bet = interaction.options.getInteger('bet');
            const userMoney = await getUserMoney(interaction.user.id);

            // Clean up any existing table
            if (activeGames.has(interaction.channelId)) {
                activeGames.delete(interaction.channelId);
            }

            // Check if user has enough money
            if (userMoney < bet) {
                return await interaction.reply({ 
                    content: `❌ You don't have enough money! You have ${userMoney.toLocaleString()}.`, 
                    ephemeral: true 
                });
            }

            // Deduct bet and create multiplayer game
            await setUserMoney(interaction.user.id, userMoney - bet);
            const game = new BlackjackGame(interaction.channelId, interaction.user.id, bet, true);
            activeGames.set(interaction.channelId, game);
            game.interactionId = interaction.id;
            game.interactionStartTime = Date.now();

            // Create join button and initial embed
            const joinButton = createJoinTableButton();
            const initialEmbed = await createGameEmbed(game, interaction.user.id, interaction.client);
            initialEmbed.setDescription(`🃏 Blackjack table started! Click to join (30 seconds remaining).`);

            const message = await interaction.reply({
                embeds: [initialEmbed],
                components: [joinButton],
                fetchReply: true
            });

            // Start 30-second countdown for players to join
            let countdown = 30;
            const countdownInterval = setInterval(async () => {
                countdown--;
                
                if (countdown <= 0) {
                    clearInterval(countdownInterval);
                    
                    // Start the game if still active
                    if (activeGames.get(interaction.channelId) === game && game.dealingPhase === 0) {
                        await dealCardsWithDelay(interaction, message, game, interaction.user.id, 1000);
                        
                        const embed = await createGameEmbed(game, interaction.user.id, interaction.client);
                        const { createButtons } = require('../utils/buttons');
                        const buttons = createButtons(game, interaction.user.id, interaction.client);
                        
                        let components = [];
                        if (buttons) {
                            if (Array.isArray(buttons)) {
                                components = buttons;
                            } else {
                                components = [buttons];
                            }
                        }
                        
                        try {
                            await message.edit({
                                embeds: [embed],
                                components: components
                            });
                            
                            // Start turn timer if game is active
                            if (!game.gameOver && game.dealingPhase >= 5) {
                                const { startTurnTimer } = require('../handlers/buttonHandler');
                                startTurnTimer(game, interaction, activeGames, interaction.client, dealCardsWithDelay);
                            }
                        } catch (error) {
                            console.error('Error updating game message after countdown:', error);
                        }
                    }
                    return;
                }

                // Update countdown display
                const updatedEmbed = await createGameEmbed(game, interaction.user.id, interaction.client);
                updatedEmbed.setDescription(`🃏 Blackjack table started! Click to join (${countdown} seconds remaining).`);
                
                try {
                    await message.edit({
                        embeds: [updatedEmbed],
                        components: [joinButton]
                    });
                } catch (error) {
                    console.error('Error updating countdown:', error);
                }
            }, 1000);
            
        } catch (error) {
            console.error('Error in starttable command:', error);
            await interaction.reply({
                content: '❌ An error occurred while starting the blackjack table. Please try again.',
                ephemeral: true
            });
        }
    }
};