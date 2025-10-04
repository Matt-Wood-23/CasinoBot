const { EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { getUserMoney } = require('../utils/data');

module.exports = {
    data: {
        name: 'craps',
        description: 'Play a game of craps with Pass Line, Don\'t Pass, and Field bets',
        options: []
    },

    async execute(interaction) {
        try {
            const userMoney = await getUserMoney(interaction.user.id);

            if (userMoney < 10) {
                return interaction.reply({
                    content: '❌ You need at least $10 to play craps!',
                    ephemeral: true
                });
            }

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
            await interaction.reply({
                content: '❌ An error occurred while starting the game. Please try again.',
                ephemeral: true
            });
        }
    }
};
