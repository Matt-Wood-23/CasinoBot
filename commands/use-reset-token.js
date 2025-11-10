const { SlashCommandBuilder } = require('discord.js');
const { canResetDaily, canResetWork, useDailyResetToken, useWorkResetToken } = require('../utils/guildShopEffects');
const { canClaimDaily, setLastDaily, getUserData } = require('../utils/data');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('use-reset-token')
        .setDescription('Use a reset token to bypass cooldowns')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Which cooldown to reset')
                .setRequired(true)
                .addChoices(
                    { name: 'Daily Bonus', value: 'daily' },
                    { name: 'Work', value: 'work' }
                )),

    async execute(interaction) {
        const userId = interaction.user.id;
        const type = interaction.options.getString('type');

        try {
            if (type === 'daily') {
                // Check if daily is already available
                const canClaim = await canClaimDaily(userId);
                if (canClaim) {
                    return interaction.reply({
                        content: '❌ Your daily bonus is already available! No need to use a reset token.\n\nUse `/daily` to claim it.',
                        ephemeral: true
                    });
                }

                // Check if user has a daily reset token
                const hasToken = await canResetDaily(userId);
                if (!hasToken) {
                    return interaction.reply({
                        content: '❌ You don\'t have a **Daily Reset Token**!\n\nYou can purchase one from the guild shop using `/guild shop`.',
                        ephemeral: true
                    });
                }

                // Use the token
                const result = await useDailyResetToken(userId);
                if (!result.success) {
                    return interaction.reply({
                        content: `❌ Failed to use reset token: ${result.message || 'Unknown error'}`,
                        ephemeral: true
                    });
                }

                // Reset the daily cooldown by setting it to >24 hours ago
                const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000 + 60000); // 24 hours + 1 minute ago
                await setLastDaily(userId, oneDayAgo);

                return interaction.reply({
                    content: '✅ **Daily Reset Token used!**\n\n🎁 Your daily bonus is now available!\n\nUse `/daily` to claim it now.',
                    ephemeral: false
                });

            } else if (type === 'work') {
                // Check if work is already available
                const userData = await getUserData(userId);
                if (!userData) {
                    return interaction.reply({
                        content: '❌ User data not found!',
                        ephemeral: true
                    });
                }

                const WORK_COOLDOWN = 4 * 60 * 60 * 1000; // 4 hours
                const lastWork = userData.lastWork || 0;
                const timeLeft = (lastWork + WORK_COOLDOWN) - Date.now();

                if (timeLeft <= 0) {
                    return interaction.reply({
                        content: '❌ You can already work! No need to use a reset token.\n\nUse `/work` to earn money.',
                        ephemeral: true
                    });
                }

                // Check if user has a work reset token
                const hasToken = await canResetWork(userId);
                if (!hasToken) {
                    return interaction.reply({
                        content: '❌ You don\'t have a **Work Reset Token**!\n\nYou can purchase one from the guild shop using `/guild shop`.',
                        ephemeral: true
                    });
                }

                // Use the token
                const result = await useWorkResetToken(userId);
                if (!result.success) {
                    return interaction.reply({
                        content: `❌ Failed to use reset token: ${result.message || 'Unknown error'}`,
                        ephemeral: true
                    });
                }

                // Reset the work cooldown by setting it to >4 hours ago
                const { setLastWork } = require('../utils/data');
                const fourHoursAgo = Date.now() - (4 * 60 * 60 * 1000 + 60000); // 4 hours + 1 minute ago
                await setLastWork(userId, fourHoursAgo);

                return interaction.reply({
                    content: '✅ **Work Reset Token used!**\n\n💼 You can now work again!\n\nUse `/work` to earn money now.',
                    ephemeral: false
                });
            }

        } catch (error) {
            console.error('Error using reset token:', error);
            return interaction.reply({
                content: '❌ An error occurred while using your reset token. Please try again.',
                ephemeral: true
            });
        }
    }
};
