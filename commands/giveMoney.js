const { SlashCommandBuilder } = require('discord.js');
const { getUserMoney, setUserMoney } = require('../database/queries');
const { ADMIN_USER_ID } = require('../config');
const { recordTransaction, TransactionTypes } = require('../utils/transactions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('givemoney')
        .setDescription('[ADMIN ONLY] Give money to a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to give money to')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount of money to give')
                .setRequired(true)
                .setMinValue(1)
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

            const targetUser = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');

            // Check if target is a bot
            if (targetUser.bot) {
                return await interaction.reply({
                    content: '❌ Cannot give money to bots!',
                    ephemeral: true
                });
            }

            // Give money to target user
            const targetCurrentMoney = await getUserMoney(targetUser.id);
            const newBalance = targetCurrentMoney + amount;
            await addUserMoney(targetUser.id, amount);

            // Record transaction
            await recordTransaction({
                userId: targetUser.id,
                type: TransactionTypes.ADMIN_GIVE,
                amount: amount,
                balanceAfter: newBalance,
                relatedUserId: interaction.user.id,
                description: `Admin gave money (by ${interaction.user.username})`,
                metadata: {
                    adminId: interaction.user.id,
                    adminName: interaction.user.username
                }
            });

            await interaction.reply({
                content: `💰 **Admin Action**: Gave $${amount.toLocaleString()} to ${targetUser.username}!\nNew balance: $${newBalance.toLocaleString()}`,
                ephemeral: true
            });

            // Log the admin action
            console.log(`Admin ${interaction.user.username} (${interaction.user.id}) gave $${amount} to ${targetUser.username} (${targetUser.id})`);
            
        } catch (error) {
            console.error('Error in givemoney command:', error);

            const errorMessage = {
                content: '❌ An error occurred while giving money. Please try again.',
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