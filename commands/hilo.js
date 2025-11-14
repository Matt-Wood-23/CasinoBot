const { EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { getUserMoney } = require('../utils/data');
const { isGamblingBanned, getGamblingBanTime } = require('../database/queries');
const { recordGameToEvents, getEventNotifications } = require('../utils/eventIntegration');

module.exports = {
    data: {
        name: 'hilo',
        description: 'Play Hi-Lo - guess if the next card is higher or lower!',
        options: []
    },

    async execute(interaction) {
        try {
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

            const userMoney = await getUserMoney(interaction.user.id);

            if (userMoney < 10) {
                return interaction.reply({
                    content: '❌ You need at least $10 to play Hi-Lo!',
                    ephemeral: true
                });
            }

            // Show betting modal
            const modal = new ModalBuilder()
                .setCustomId('hilo_place_bet')
                .setTitle('🎴 Play Hi-Lo')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('bet_amount')
                            .setLabel('Bet Amount ($10 - $10,000)')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setPlaceholder('100')
                    )
                );

            await interaction.showModal(modal);

        } catch (error) {
            console.error('Error in hilo command:', error);

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
