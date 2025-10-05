const { getUserMoney, setUserMoney } = require('../utils/data');
const { createGameEmbed } = require('../utils/embeds');
const { createButtons } = require('../utils/buttons');
const CrashGame = require('../gameLogic/crashGame');

module.exports = {
    data: {
        name: 'crash',
        description: 'Play Crash - watch the multiplier climb and cash out before it crashes!',
        options: [
            {
                name: 'bet',
                type: 4, // INTEGER
                description: 'Amount to bet ($10 - $10,000)',
                required: true,
                min_value: 10,
                max_value: 10000
            }
        ]
    },

    async execute(interaction, activeGames) {
        try {
            const betAmount = interaction.options.getInteger('bet');
            const userId = interaction.user.id;

            // Check user has enough money
            const userMoney = await getUserMoney(userId);
            if (userMoney < betAmount) {
                return interaction.reply({
                    content: `❌ You don't have enough money! You have ${userMoney.toLocaleString()}, but need ${betAmount.toLocaleString()}.`,
                    ephemeral: true
                });
            }

            // Deduct bet
            await setUserMoney(userId, userMoney - betAmount);

            // Create game
            const crashGame = new CrashGame(userId, betAmount);
            activeGames.set(`crash_${userId}`, crashGame);

            // Send initial embed
            const embed = await createGameEmbed(crashGame, userId, interaction.client);
            const buttons = createButtons(crashGame, userId, interaction.client);

            await interaction.reply({
                embeds: [embed],
                components: buttons ? [buttons] : []
            });

        } catch (error) {
            console.error('Error in crash command:', error);
            await interaction.reply({
                content: '❌ An error occurred while starting the game. Please try again.',
                ephemeral: true
            });
        }
    }
};
