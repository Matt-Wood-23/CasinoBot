const { getUserMoney, setUserMoney, updateUserGifts } = require('../utils/data');
const { EmbedBuilder } = require('discord.js');
const { recordTransaction, TransactionTypes } = require('../utils/transactions');

module.exports = {
    data: {
        name: 'gift',
        description: 'Send money to another user',
        options: [
            {
                name: 'user',
                description: 'User to send money to',
                type: 6,
                required: true
            },
            {
                name: 'amount',
                description: 'Amount to send (10-10000)',
                type: 4,
                required: true,
                min_value: 10,
                max_value: 10000
            },
            {
                name: 'message',
                description: 'Optional message with the gift',
                type: 3,
                required: false
            }
        ]
    },
    
    async execute(interaction) {
        try {
            const targetUser = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');
            const message = interaction.options.getString('message') || '';

            // Validation checks
            if (targetUser.bot) {
                return await interaction.reply({ 
                    content: '❌ You cannot send gifts to bots!', 
                    ephemeral: true 
                });
            }

            if (targetUser.id === interaction.user.id) {
                return await interaction.reply({ 
                    content: '❌ You cannot send gifts to yourself!', 
                    ephemeral: true 
                });
            }

            // Check sender has enough money
            const userMoney = await getUserMoney(interaction.user.id);
            if (userMoney < amount) {
                return await interaction.reply({
                    content: `❌ You don't have enough money! You have ${userMoney.toLocaleString()}.`,
                    ephemeral: true
                });
            }

            // Process the gift transfer
            const senderNewBalance = userMoney - amount;
            await setUserMoney(interaction.user.id, senderNewBalance);
            const targetMoney = await getUserMoney(targetUser.id);
            const recipientNewBalance = targetMoney + amount;
            await setUserMoney(targetUser.id, recipientNewBalance);

            // Record transactions for both sender and receiver
            await recordTransaction({
                userId: interaction.user.id,
                type: TransactionTypes.GIFT_SENT,
                amount: -amount,
                balanceAfter: senderNewBalance,
                relatedUserId: targetUser.id,
                description: `Gift sent to ${targetUser.username}${message ? `: "${message}"` : ''}`,
                metadata: {
                    recipientId: targetUser.id,
                    recipientName: targetUser.username,
                    message: message
                }
            });

            await recordTransaction({
                userId: targetUser.id,
                type: TransactionTypes.GIFT_RECEIVED,
                amount: amount,
                balanceAfter: recipientNewBalance,
                relatedUserId: interaction.user.id,
                description: `Gift received from ${interaction.user.username}${message ? `: "${message}"` : ''}`,
                metadata: {
                    senderId: interaction.user.id,
                    senderName: interaction.user.username,
                    message: message
                }
            });

            // Update gift statistics
            await updateUserGifts(interaction.user.id, targetUser.id, amount);

            // Create gift sent embed
            const embed = new EmbedBuilder()
                .setTitle('🎁 Gift Sent!')
                .setColor('#00FF00')
                .setDescription(`${interaction.user.username} sent ${amount.toLocaleString()} to ${targetUser.username}`)
                .addFields(
                    { name: '💰 Amount', value: `${amount.toLocaleString()}`, inline: true },
                    { name: '👤 Recipient', value: targetUser.username, inline: true },
                    { name: '💵 Your Balance', value: `${senderNewBalance.toLocaleString()}`, inline: true }
                );

            if (message) {
                embed.addFields({ name: '💬 Message', value: message, inline: false });
            }

            embed.setTimestamp();

            await interaction.reply({ embeds: [embed] });

            // Try to send DM to recipient
            try {
                const dmEmbed = new EmbedBuilder()
                    .setTitle('🎁 You received a gift!')
                    .setColor('#00FF00')
                    .setDescription(`${interaction.user.username} sent you ${amount.toLocaleString()}!`)
                    .addFields({
                        name: '💵 Your New Balance',
                        value: `${recipientNewBalance.toLocaleString()}`,
                        inline: true
                    });

                if (message) {
                    dmEmbed.addFields({ name: '💬 Message', value: message, inline: false });
                }

                await targetUser.send({ embeds: [dmEmbed] });
            } catch (error) {
                // User has DMs disabled, that's okay
                console.log(`Could not send DM to ${targetUser.username} about gift`);
            }
            
        } catch (error) {
            console.error('Error in gift command:', error);

            const errorMessage = {
                content: '❌ An error occurred while sending the gift. Please try again.',
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