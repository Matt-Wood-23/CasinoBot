const { getUserMoney, setUserMoney, getUserProperty, setUserProperty, getUserItem, setUserItem, getVIPStatus, updateVIPStatus } = require('../../utils/data');
const { EmbedBuilder } = require('discord.js');

async function handleShopPurchase(interaction, userId) {
    const { purchaseItem, getShopItem } = require('../utils/shop');

    try {
        const itemId = interaction.customId.replace('shop_buy_', '');
        const result = await purchaseItem(userId, itemId);

        if (!result.success) {
            return interaction.reply({
                content: `❌ ${result.message}`,
                ephemeral: true
            });
        }

        const item = getShopItem(itemId);
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ Purchase Successful!')
            .setDescription(result.message)
            .addFields(
                { name: 'Item', value: item.name, inline: true },
                { name: 'Effect', value: item.description, inline: false }
            )
            .setFooter({ text: 'Use /inventory to view your items' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('Error handling shop purchase:', error);
        await interaction.reply({
            content: '❌ An error occurred while processing your purchase. Please try again.',
            ephemeral: true
        });
    }
}

async function handlePropertyPurchase(interaction, userId) {
    const { purchaseProperty } = require('../utils/properties');
    const { getUserMoney } = require('../utils/data');

    try {
        await interaction.deferReply();

        const propertyId = interaction.customId.replace('property_buy_', '');
        const result = await purchaseProperty(userId, propertyId);

        if (!result.success) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Purchase Failed')
                .setDescription(result.message)
                .setTimestamp();

            return interaction.editReply({ embeds: [errorEmbed] });
        }

        const property = result.property;
        const currentMoney = await getUserMoney(userId);

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ Property Purchased!')
            .setDescription(`${property.emoji} **${property.name}**\n*${property.description}*`)
            .addFields(
                {
                    name: '💰 Purchase Price',
                    value: `$${property.purchasePrice.toLocaleString()}`,
                    inline: true
                },
                {
                    name: '💵 Daily Income',
                    value: `$${property.baseIncome.toLocaleString()}`,
                    inline: true
                },
                {
                    name: '🔧 Daily Maintenance',
                    value: `$${property.baseMaintenance.toLocaleString()}`,
                    inline: true
                },
                {
                    name: '📊 Net Daily Profit',
                    value: `$${(property.baseIncome - property.baseMaintenance).toLocaleString()}`,
                    inline: false
                },
                {
                    name: '💳 New Balance',
                    value: `$${currentMoney.toLocaleString()}`,
                    inline: true
                }
            )
            .setFooter({ text: 'Use /collect to claim daily income!' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error('Error handling property purchase:', error);

        const errorMessage = {
            content: '❌ An error occurred while processing your property purchase. Please try again.',
            ephemeral: true
        };

        if (interaction.deferred) {
            await interaction.editReply(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
}

async function handleUseItem(interaction, userId) {
    const { useItem, getUserInventory, SHOP_ITEMS } = require('../utils/shop');

    try {
        const itemType = interaction.customId.replace('use_item_', '');
        const inventory = getUserInventory(userId);

        // Find the first item of this type
        const item = inventory.find(invItem => {
            const invItemType = invItem.id.split('_')[0] + '_' + invItem.id.split('_')[1];
            return invItemType === itemType;
        });

        if (!item) {
            return interaction.reply({
                content: '❌ Item not found in your inventory!',
                ephemeral: true
            });
        }

        const result = await useItem(userId, item.id);

        if (!result.success) {
            return interaction.reply({
                content: `❌ ${result.message}`,
                ephemeral: true
            });
        }

        const shopItem = SHOP_ITEMS[itemType];
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ Item Activated!')
            .setDescription(result.message)
            .addFields(
                { name: 'Effect', value: shopItem.description, inline: false },
                { name: 'Status', value: '⚡ Active - Will be consumed on your next applicable action', inline: false }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('Error handling item use:', error);
        await interaction.reply({
            content: '❌ An error occurred while using the item. Please try again.',
            ephemeral: true
        });
    }
}

async function handleVIPPurchase(interaction, userId) {
    const { purchaseVIP, getVIPTierById } = require('../utils/vip');
    const { getUserMoney } = require('../utils/data');

    try {
        const tierId = interaction.customId.replace('vip_buy_', '');

        await interaction.deferReply();

        const result = await purchaseVIP(userId, tierId);

        if (!result.success) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Purchase Failed')
                .setDescription(result.message)
                .setTimestamp();

            return interaction.editReply({ embeds: [errorEmbed] });
        }

        const tier = result.tier;
        const actionType = result.isUpgrade ? 'Upgraded' : (result.isRenewal ? 'Renewed' : 'Purchased');

        const embed = new EmbedBuilder()
            .setColor(tier.color)
            .setTitle(`✅ VIP ${actionType}!`)
            .setDescription(`${tier.emoji} **${tier.name}**`)
            .addFields(
                {
                    name: '💰 Cost',
                    value: `$${tier.price.toLocaleString()}`,
                    inline: true
                },
                {
                    name: '⏰ Duration',
                    value: '30 days',
                    inline: true
                },
                {
                    name: '✨ Your Perks',
                    value: tier.perks.description.join('\n'),
                    inline: false
                }
            )
            .setTimestamp();

        const expiryDate = new Date(result.expiresAt);
        embed.setFooter({ text: `Expires on ${expiryDate.toLocaleDateString()}` });

        const currentMoney = await getUserMoney(userId);
        embed.addFields({
            name: '💵 New Balance',
            value: `$${currentMoney.toLocaleString()}`,
            inline: true
        });

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error('Error handling VIP purchase:', error);
        await interaction.reply({
            content: '❌ An error occurred while processing your VIP purchase. Please try again.',
            ephemeral: true
        });
    }
}


module.exports = { handleShopPurchase, handlePropertyPurchase, handleUseItem, handleVIPPurchase };
