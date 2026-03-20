const { EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { getUserMoney } = require('../utils/data');
const { checkGamblingBan, checkCooldown, setCooldown } = require('../utils/guardChecks');
const { recordGameToEvents, getEventNotifications } = require('../utils/eventIntegration');

module.exports = {
    data: {
        name: 'craps',
        description: 'Play a game of craps with Pass Line, Don\'t Pass, and Field bets',
        options: []
    },

    async execute(interaction) {
        try {
            // Cooldown: 3 seconds between games
            if (checkCooldown(interaction, 'craps', 3000)) return;

            // Check if user is gambling banned
            if (await checkGamblingBan(interaction)) return;

            const userMoney = await getUserMoney(interaction.user.id);

            if (userMoney < 10) {
                return interaction.reply({
                    content: '❌ You need at least $10 to play craps!',
                    ephemeral: true
                });
            }

            // All checks passed — set cooldown
            setCooldown(interaction, 'craps', 3000);

            // Show betting modal
            const modal = new ModalBuilder()
                .setCustomId('craps_place_bets')
                .setTitle('🎲 Place Your Craps Bets')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('pass_line_bet')
                            .setLabel('Pass Line Bet (10-10,000) - Optional')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(false)
                            .setPlaceholder('100')
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('dont_pass_bet')
                            .setLabel('Don\'t Pass Bet (10-10,000) - Optional')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(false)
                            .setPlaceholder('0')
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('field_bet')
                            .setLabel('Field Bet (10-10,000) - Optional')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(false)
                            .setPlaceholder('0')
                    )
                );

            await interaction.showModal(modal);

        } catch (error) {
            console.error('Error in craps command:', error);

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
