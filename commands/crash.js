const { EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { getUserMoney } = require('../utils/data');

module.exports = {
    data: {
        name: 'crash',
        description: 'Play Crash - watch the multiplier climb and cash out before it crashes!',
        options: []
    },

    async execute(interaction) {
        try {
            const userMoney = await getUserMoney(interaction.user.id);

            if (userMoney < 10) {
                return interaction.reply({
                    content: '❌ You need at least $10 to play Crash!',
                    ephemeral: true
                });
            }

            // Show betting modal
            const modal = new ModalBuilder()
                .setCustomId('crash_place_bet')
                .setTitle('🚀 Play Crash')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('bet_amount')
                            .setLabel('Bet Amount ($10 - $10,000)')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setPlaceholder('100')
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('target_multiplier')
                            .setLabel('Target Multiplier (1.01x - 100.00x)')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setPlaceholder('2.00')
                    )
                );

            await interaction.showModal(modal);

        } catch (error) {
            console.error('Error in crash command:', error);
            await interaction.reply({
                content: '❌ An error occurred while starting the game. Please try again.',
                ephemeral: true
            });
        }
    }
};
