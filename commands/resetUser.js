const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { setUserMoney } = require('../database/queries');
const { query } = require('../database/connection');
const { ADMIN_USER_ID } = require('../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resetuser')
        .setDescription('[ADMIN ONLY] Reset a user\'s casino data')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to reset')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('confirm')
                .setDescription('Confirm you want to reset this user (set to true)')
                .setRequired(true)),

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
            const confirm = interaction.options.getBoolean('confirm');

            if (!confirm) {
                return await interaction.reply({
                    content: '❌ You must set confirm to `true` to reset a user!',
                    ephemeral: true
                });
            }

            // Check if target is a bot
            if (targetUser.bot) {
                return await interaction.reply({
                    content: '❌ Cannot reset bot data!',
                    ephemeral: true
                });
            }

            // Reset user data
            await setUserMoney(targetUser.id, 500); // Starting balance

            // Reset statistics
            await query(
                `UPDATE user_statistics
                 SET total_games = 0,
                     total_wins = 0,
                     total_losses = 0,
                     total_wagered = 0,
                     total_winnings = 0,
                     win_streak = 0,
                     best_win_streak = 0,
                     blackjack_games = 0,
                     blackjack_wins = 0,
                     slots_games = 0,
                     slots_wins = 0,
                     roulette_games = 0,
                     roulette_wins = 0,
                     poker_games = 0,
                     poker_wins = 0,
                     craps_games = 0,
                     craps_wins = 0,
                     war_games = 0,
                     war_wins = 0
                 WHERE user_id = $1`,
                [targetUser.id]
            );

            // Clear game history
            await query(
                'DELETE FROM game_history WHERE user_id = $1',
                [targetUser.id]
            );

            // Clear achievements
            await query(
                'DELETE FROM user_achievements WHERE user_id = $1',
                [targetUser.id]
            );

            await query(
                'DELETE FROM user_achievement_progress WHERE user_id = $1',
                [targetUser.id]
            );

            // Clear inventory
            await query(
                'DELETE FROM user_inventory WHERE user_id = $1',
                [targetUser.id]
            );

            // Clear boosts
            await query(
                'DELETE FROM user_boosts WHERE user_id = $1',
                [targetUser.id]
            );

            // Clear properties
            await query(
                'DELETE FROM user_properties WHERE user_id = $1',
                [targetUser.id]
            );

            // Clear loans
            await query(
                'DELETE FROM loans WHERE user_id = $1',
                [targetUser.id]
            );

            // Reset credit score to default (650)
            await query(
                'UPDATE users SET credit_score = 650 WHERE discord_id = $1',
                [targetUser.id]
            );

            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('🔄 User Reset Complete')
                .setDescription(`Successfully reset all casino data for ${targetUser.username}`)
                .addFields(
                    { name: 'Reset Items', value: '• Balance set to $500\n' +
                                                    '• Statistics cleared\n' +
                                                    '• Game history deleted\n' +
                                                    '• Achievements removed\n' +
                                                    '• Inventory cleared\n' +
                                                    '• Properties removed\n' +
                                                    '• Loans cleared\n' +
                                                    '• Credit score reset to 650', inline: false }
                )
                .setFooter({ text: 'This action cannot be undone!' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });

            // Log the admin action
            console.log(`Admin ${interaction.user.username} (${interaction.user.id}) reset user ${targetUser.username} (${targetUser.id})`);

        } catch (error) {
            console.error('Error in resetuser command:', error);

            const errorMessage = {
                content: '❌ An error occurred while resetting the user. Please try again.',
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
