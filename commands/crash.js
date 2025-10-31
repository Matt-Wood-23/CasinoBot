const { getUserMoney, setUserMoney } = require('../utils/data');
const { isGamblingBanned, getGamblingBanTime } = require('../database/queries');
const { createGameEmbed } = require('../utils/embeds');
const { createButtons } = require('../utils/buttons');
const { validateBet } = require('../utils/vip');
const CrashGame = require('../gameLogic/crashGame');

module.exports = {
    data: {
        name: 'crash',
        description: 'Play Crash - watch the multiplier climb and cash out before it crashes!',
        options: [
            {
                name: 'bet',
                type: 4, // INTEGER
                description: 'Amount to bet (VIP gets higher limits!)',
                required: true,
                min_value: 10,
                max_value: 20000
            }
        ]
    },

    async execute(interaction, activeGames) {
        try {
            const betAmount = interaction.options.getInteger('bet');
            const userId = interaction.user.id;

            // Validate bet against VIP limits
            const betValidation = await validateBet(userId, betAmount, 10, 10000);
            if (!betValidation.valid) {
                return await interaction.reply({
                    content: betValidation.message,
                    ephemeral: true
                });
            }

            // Check if user is gambling banned
            const isBanned = await isGamblingBanned(userId);
            if (isBanned) {
                const banUntil = await getGamblingBanTime(userId);
                const timeLeft = banUntil - Date.now();
                const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
                const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

                return await interaction.reply({
                    content: `🚫 You're banned from gambling after a failed heist!\nBan expires in: ${hoursLeft}h ${minutesLeft}m`,
                    ephemeral: true
                });
            }

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
            const buttons = await createButtons(crashGame, userId, interaction.client);

            await interaction.reply({
                embeds: [embed],
                components: buttons ? [buttons] : []
            });

        } catch (error) {
            console.error('Error in crash command:', error);

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
