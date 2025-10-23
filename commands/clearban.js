const { EmbedBuilder } = require('discord.js');
const { getUserData, saveUserData } = require('../utils/data');
const { ADMIN_USER_ID } = require('../config');
const { initializeHeist } = require('../utils/heist');

module.exports = {
    data: {
        name: 'clearban',
        description: '[ADMIN ONLY] Clear a user\'s gambling ban',
        options: [
            {
                name: 'user',
                description: 'The user to clear the ban for',
                type: 6, // USER
                required: true
            }
        ]
    },

    async execute(interaction) {
        try {
            // Check if user is admin
            if (interaction.user.id !== ADMIN_USER_ID) {
                return await interaction.reply({
                    content: '❌ You do not have permission to use this command!',
                    ephemeral: true
                });
            }

            const targetUser = interaction.options.getUser('user');

            // Check if target is a bot
            if (targetUser.bot) {
                return await interaction.reply({
                    content: '❌ Cannot clear ban for bots!',
                    ephemeral: true
                });
            }

            // Get user data and clear ban
            const heistData = initializeHeist(targetUser.id);

            if (!heistData) {
                return await interaction.reply({
                    content: '❌ User data not found!',
                    ephemeral: true
                });
            }

            const wasBanned = heistData.gamblingBanUntil > Date.now();

            // Clear the gambling ban
            heistData.gamblingBanUntil = 0;

            await saveUserData();

            const embed = new EmbedBuilder()
                .setColor(wasBanned ? '#00FF00' : '#FFA500')
                .setTitle(wasBanned ? '✅ Gambling Ban Cleared' : 'ℹ️ No Active Ban')
                .setDescription(wasBanned
                    ? `Cleared gambling ban for **${targetUser.username}**.\n\nThey can now play games again.`
                    : `**${targetUser.username}** did not have an active gambling ban.`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });

            // Log the admin action
            console.log(`Admin ${interaction.user.username} (${interaction.user.id}) cleared gambling ban for ${targetUser.username} (${targetUser.id})`);

        } catch (error) {
            console.error('Error in clearban command:', error);
            await interaction.reply({
                content: '❌ An error occurred while clearing the ban. Please try again.',
                ephemeral: true
            });
        }
    }
};
