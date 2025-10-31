const { getUserMoney, setUserMoney } = require('../utils/data');
const { isGamblingBanned, getGamblingBanTime, addToJackpot } = require('../database/queries');
const { createGameEmbed } = require('../utils/embeds');
const { createButtons } = require('../utils/buttons');
const BlackjackGame = require('../gameLogic/blackjackGame');

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
        try {
            const bet = interaction.options.getInteger('bet');
            const userMoney = await getUserMoney(interaction.user.id);
            const serverId = interaction.guildId;

            // Check if user is gambling banned
            const isBanned = await isGamblingBanned(interaction.user.id);
            if (isBanned) {
                const banUntil = await getGamblingBanTime(interaction.user.id);
                const timeLeft = banUntil - Date.now();
                const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
                const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

                return await interaction.reply({
                    content: `🚫 You're banned from gambling after a failed heist!\nBan expires in: ${hoursLeft}h ${minutesLeft}m`,
                    ephemeral: true
                });
            }

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

            // Contribute to jackpot (0.5% of bet)
            if (serverId) {
                const jackpotContribution = Math.floor(bet * 0.005);
                await addToJackpot(serverId, jackpotContribution);
            }

            // Deduct bet from user's money
            await setUserMoney(interaction.user.id, userMoney - bet);

            // Create new game
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


            await dealCardsWithDelay(interaction, message, game, interaction.user.id, 1000);


        } catch (error) {
            console.error('Error in blackjack command:', error);

            const errorMessage = {
                content: '❌ An error occurred while starting the blackjack game. Please try again.',
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