const { getUserMoney, setUserMoney } = require('../utils/data');
const { validateBet } = require('../utils/vip');
const { checkGamblingBan, checkCooldown, setCooldown } = require('../utils/guardChecks');
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
                description: 'Amount to bet (VIP gets higher limits!)',
                type: 4,
                required: true,
                min_value: 10,
                max_value: 20000
            }
        ]
    },

    async execute(interaction, activeGames) {
        try {
            // Cooldown: 3 seconds between games
            if (checkCooldown(interaction, 'war', 3000)) return;

            // Check if user is gambling banned
            if (await checkGamblingBan(interaction)) return;

            const bet = interaction.options.getInteger('bet');
            const userId = interaction.user.id;

            // Validate bet against VIP limits
            const betValidation = await validateBet(userId, bet, 10, 10000);
            if (!betValidation.valid) {
                return await interaction.reply({
                    content: betValidation.message,
                    ephemeral: true
                });
            }

            // Check if user has enough money
            const userMoney = await getUserMoney(userId);
            if (userMoney < bet) {
                return interaction.reply({
                    content: `❌ You don't have enough money! You have ${userMoney.toLocaleString()}, need ${bet.toLocaleString()}.`,
                    ephemeral: true
                });
            }

            // All checks passed — set cooldown
            setCooldown(interaction, 'war', 3000);

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
