const { EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { getUserMoney } = require('../utils/data');
const { recordGameToEvents, getEventNotifications } = require('../utils/eventIntegration');
const { checkGamblingBan, checkCooldown, setCooldown } = require('../utils/guardChecks');

module.exports = {
    data: {
        name: 'hilo',
        description: 'Play Hi-Lo - guess if the next card is higher or lower!',
        options: []
    },

    async execute(interaction) {
        try {
            // Cooldown: 3 seconds between games
            if (checkCooldown(interaction, 'hilo', 3000)) return;

            // Check if user is gambling banned
            if (await checkGamblingBan(interaction)) return;

            const userMoney = await getUserMoney(interaction.user.id);

            if (userMoney < 10) {
                return interaction.reply({
                    content: '❌ You need at least $10 to play Hi-Lo!',
                    ephemeral: true
                });
            }

            // All checks passed — set cooldown
            setCooldown(interaction, 'hilo', 3000);

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
