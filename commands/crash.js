const { getUserMoney, setUserMoney } = require('../utils/data');
const { createGameEmbed } = require('../utils/embeds');
const { createButtons } = require('../utils/buttons');
const { validateBet } = require('../utils/vip');
const { checkGamblingBan, checkCooldown, setCooldown } = require('../utils/guardChecks');
const CrashGame = require('../gameLogic/crashGame');
const { recordGameToEvents, getEventNotifications } = require('../utils/eventIntegration');

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
        const userId = interaction.user.id;
        const betAmount = interaction.options.getInteger('bet');
        let moneyDeducted = false;
        let userMoney = null;

        try {
            // Cooldown: 5 seconds between games
            if (checkCooldown(interaction, 'crash', 5000)) return;

            // Validate bet against VIP limits
            const betValidation = await validateBet(userId, betAmount, 10, 10000);
            if (!betValidation.valid) {
                return await interaction.reply({
                    content: betValidation.message,
                    ephemeral: true
                });
            }

            // Check if user is gambling banned
            if (await checkGamblingBan(interaction)) return;

            // Check user has enough money
            userMoney = await getUserMoney(userId);
            if (userMoney < betAmount) {
                return interaction.reply({
                    content: `❌ You don't have enough money! You have ${userMoney.toLocaleString()}, but need ${betAmount.toLocaleString()}.`,
                    ephemeral: true
                });
            }

            // All checks passed — set cooldown and deduct bet
            setCooldown(interaction, 'crash', 5000);
            await setUserMoney(userId, userMoney - betAmount);
            moneyDeducted = true;

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

            // Refund the bet if money was already deducted before the error
            if (moneyDeducted && userMoney !== null) {
                try {
                    await setUserMoney(userId, userMoney);
                    console.log(`Refunded crash bet to user ${userId} due to startup error`);
                } catch (refundError) {
                    console.error('Error refunding crash bet:', refundError);
                }
            }

            activeGames.delete(`crash_${userId}`);

            const errorMessage = {
                content: '❌ An error occurred while starting the game. If your bet was deducted, it has been refunded.',
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
