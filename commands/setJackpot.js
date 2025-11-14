const { SlashCommandBuilder } = require('discord.js');
const { getServerJackpot } = require('../database/queries');
const { query } = require('../database/connection');
const { ADMIN_USER_ID } = require('../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setjackpot')
        .setDescription('[ADMIN ONLY] Set the server jackpot amount')
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('New jackpot amount')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(100000000)),

    async execute(interaction) {
        try {
            // Check if user is admin
            if (interaction.user.id !== ADMIN_USER_ID) {
                return await interaction.reply({
                    content: '❌ You do not have permission to use this command!',
                    ephemeral: true
                });
            }

            const newAmount = interaction.options.getInteger('amount');
            const serverId = interaction.guildId;

            if (!serverId) {
                return await interaction.reply({
                    content: '❌ This command can only be used in a server!',
                    ephemeral: true
                });
            }

            // Get current jackpot
            const currentJackpot = await getServerJackpot(serverId);

            // Set new jackpot (direct query since setServerJackpot doesn't exist)
            await query(
                'UPDATE progressive_jackpot SET current_amount = $1 WHERE server_id = $2',
                [newAmount, serverId]
            );

            await interaction.reply({
                content: `🎰 **Admin Action**: Jackpot updated!\n` +
                         `Previous amount: $${currentJackpot.toLocaleString()}\n` +
                         `New amount: $${newAmount.toLocaleString()}`,
                ephemeral: true
            });

            // Log the admin action
            console.log(`Admin ${interaction.user.username} (${interaction.user.id}) set jackpot to $${newAmount} (was $${currentJackpot})`);

        } catch (error) {
            console.error('Error in setjackpot command:', error);

            const errorMessage = {
                content: '❌ An error occurred while setting the jackpot. Please try again.',
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
