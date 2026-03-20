const { getUserMoney, setUserMoney } = require('../utils/data');
const { addToJackpot } = require('../database/queries');
const { createGameEmbed } = require('../utils/embeds');
const { createButtons } = require('../utils/buttons');
const { validateBet } = require('../utils/vip');
const { checkGamblingBan, checkCooldown, setCooldown } = require('../utils/guardChecks');
const BlackjackGame = require('../gameLogic/blackjackGame');
const { recordGameToEvents, getEventNotifications } = require('../utils/eventIntegration');

module.exports = {
    data: {
        name: 'blackjack',
        description: 'Start a single-player blackjack game - Chance to win the jackpot!',
        options: [
            {
                name: 'bet',
                description: 'Amount to bet (10-500,000)',
                type: 4,
                required: true,
                min_value: 10,
                max_value: 500000
            }
        ]
    },

    async execute(interaction, activeGames, dealCardsWithDelay) {
        const bet = interaction.options.getInteger('bet');
        let userMoney = null;
        let moneyDeducted = false;

        try {
            // Cooldown: 5 seconds between hands
            if (checkCooldown(interaction, 'blackjack', 5000)) return;

            userMoney = await getUserMoney(interaction.user.id);
            const serverId = interaction.guildId;

            // Validate bet against VIP limits (base max 50,000; Platinum VIP can reach 100,000)
            const betValidation = await validateBet(interaction.user.id, bet, 10, 50000);
            if (!betValidation.valid) {
                return await interaction.reply({
                    content: betValidation.message,
                    ephemeral: true
                });
            }

            // Check if user is gambling banned
            if (await checkGamblingBan(interaction)) return;

            // Clean up any existing game
            if (activeGames.has(interaction.user.id)) {
                activeGames.delete(interaction.user.id);
            }

            // Check if user has enough money
            if (userMoney < bet) {
                return await interaction.reply({
                    content: `❌ You don't have enough money! You have ${userMoney.toLocaleString()}.`,
                    ephemeral: true
                });
            }

            // All checks passed — set cooldown
            setCooldown(interaction, 'blackjack', 5000);

            // Create new game (before deducting money)
            const game = new BlackjackGame(interaction.channelId, interaction.user.id, bet, false);
            game.serverId = serverId; // Store serverId for jackpot checking
            activeGames.set(interaction.user.id, game);

            // Create initial embed and buttons
            const embed = await createGameEmbed(game, interaction.user.id, interaction.client);
            const buttons = await createButtons(game, interaction.user.id, interaction.client);

            let components = [];
            if (buttons) {
                if (Array.isArray(buttons)) {
                    components = buttons;
                } else {
                    components = [buttons];
                }
            }

            const message = await interaction.reply({
                embeds: [embed],
                components: components,
                fetchReply: true
            });

            // Only deduct money AFTER interaction reply succeeds
            // Contribute to jackpot (0.5% of bet)
            if (serverId) {
                const jackpotContribution = Math.floor(bet * 0.005);
                await addToJackpot(serverId, jackpotContribution);
            }

            // Deduct bet from user's money
            await setUserMoney(interaction.user.id, userMoney - bet);
            moneyDeducted = true;

            // Deal cards - dealCardsWithDelay handles its own errors and refunds
            await dealCardsWithDelay(interaction, message, game, interaction.user.id, 1000);

        } catch (error) {
            console.error('Error in blackjack command:', error);

            // Refund money if it was deducted
            if (moneyDeducted && userMoney !== null) {
                try {
                    await setUserMoney(interaction.user.id, userMoney);
                    console.log(`Refunded bet to user ${interaction.user.id} due to blackjack startup error`);
                } catch (refundError) {
                    console.error('Error refunding bet after failure:', refundError);
                }
            }

            // Clean up the failed game
            activeGames.delete(interaction.user.id);

            const errorMessage = {
                content: `❌ An error occurred while starting the blackjack game. If your bet was deducted, it has been refunded.`,
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