const { SlashCommandBuilder } = require('discord.js');
const { getUserMoney, setUserMoney } = require('../database/queries');
const { ADMIN_USER_ID } = require('../config');
const { recordTransaction, TransactionTypes } = require('../utils/transactions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('takemoney')
        .setDescription('[ADMIN ONLY] Remove money from a user')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to take money from')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount of money to take')
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
                    content: '❌ Cannot take money from bots!',
                    ephemeral: true
                });
            }

            // Take money from target user
            const targetCurrentMoney = await getUserMoney(targetUser.id);
            const newBalance = Math.max(0, targetCurrentMoney - amount); // Don't go below 0
            await setUserMoney(targetUser.id, newBalance);

            const actualAmountTaken = targetCurrentMoney - newBalance;

            // Record transaction
            await recordTransaction({
                userId: targetUser.id,
                type: TransactionTypes.ADMIN_TAKE,
                amount: -actualAmountTaken,
                balanceAfter: newBalance,
                relatedUserId: interaction.user.id,
                description: `Admin took money (by ${interaction.user.username})`,
                metadata: {
                    adminId: interaction.user.id,
                    adminName: interaction.user.username,
                    requestedAmount: amount,
                    actualAmount: actualAmountTaken
                }
            });

            await interaction.reply({
                content: `💸 **Admin Action**: Removed $${actualAmountTaken.toLocaleString()} from ${targetUser.username}!\n` +
                         `Previous balance: $${targetCurrentMoney.toLocaleString()}\n` +
                         `New balance: $${newBalance.toLocaleString()}`,
                ephemeral: true
            });

            // Log the admin action
            console.log(`Admin ${interaction.user.username} (${interaction.user.id}) took $${actualAmountTaken} from ${targetUser.username} (${targetUser.id})`);

        } catch (error) {
            console.error('Error in takemoney command:', error);

            const errorMessage = {
                content: '❌ An error occurred while taking money. Please try again.',
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
