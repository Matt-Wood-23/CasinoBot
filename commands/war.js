const { getUserMoney, setUserMoney } = require('../utils/data');
const WarGame = require('../gameLogic/warGame');
const { createGameEmbed } = require('../utils/embeds');
const { createButtons } = require('../utils/buttons');

module.exports = {
    data: {
        name: 'war',
        description: 'Play Casino War against the dealer',
        options: [
            {
                name: 'bet',
                description: 'Amount to bet (10-10,000)',
                type: 4,
                required: true,
                min_value: 10,
                max_value: 10000
            }
        ]
    },

    async execute(interaction, activeGames) {
        try {
            const bet = interaction.options.getInteger('bet');
            const userId = interaction.user.id;

            // Check if user has enough money
            const userMoney = await getUserMoney(userId);
            if (userMoney < bet) {
                return interaction.reply({
                    content: `❌ You don't have enough money! You have ${userMoney.toLocaleString()}, need ${bet.toLocaleString()}.`,
                    ephemeral: true
                });
            }

            // Deduct bet
            await setUserMoney(userId, userMoney - bet);

            // Create game
            const warGame = new WarGame(userId, bet);
            activeGames.set(`war_${userId}`, warGame);

            // Create embed and buttons
            const embed = await createGameEmbed(warGame, userId, interaction.client);
            const buttons = await createButtons(warGame, userId, interaction.client);

            await interaction.reply({
                embeds: [embed],
                components: buttons ? [buttons] : []
            });

        } catch (error) {
            console.error('Error in war command:', error);

            const errorMessage = {
                content: '❌ An error occurred while starting the game. Please try again.',
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
