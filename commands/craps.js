const { EmbedBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { getUserMoney } = require('../utils/data');
const { isGamblingBanned, getGamblingBanTime } = require('../database/queries');

module.exports = {
    data: {
        name: 'craps',
        description: 'Play a game of craps with Pass Line, Don\'t Pass, and Field bets',
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
