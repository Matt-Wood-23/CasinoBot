const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
    purchaseVIP,
    getVIPStatus,
    getAllVIPTiers,
    claimWeeklyBonus,
    getVIPTierById
} = require('../utils/vip');
const { getUserMoney } = require('../utils/data');

module.exports = {
    data: {
        name: 'vip',
        description: 'Manage your VIP membership',
        options: [
            {
                name: 'action',
                description: 'VIP action',
                type: 3, // STRING
                required: true,
                choices: [
                    { name: 'Status - View your VIP status', value: 'status' },
                    { name: 'Shop - Browse VIP tiers', value: 'shop' },
                    { name: 'Buy - Purchase a VIP tier', value: 'buy' },
                    { name: 'Weekly - Claim weekly bonus (Gold/Platinum)', value: 'weekly' }
                ]
            },
            {
                name: 'tier',
                description: 'VIP tier to purchase (only for buy action)',
                type: 3, // STRING
                required: false,
                choices: [
                    { name: '🥉 Bronze - $5,000/month', value: 'bronze' },
                    { name: '🥈 Silver - $15,000/month', value: 'silver' },
                    { name: '🥇 Gold - $50,000/month', value: 'gold' },
                    { name: '💎 Platinum - $100,000/month', value: 'platinum' }
                ]
            }
        ]
    },

    async execute(interaction) {
        try {
            const userId = interaction.user.id;
            const action = interaction.options.getString('action');

            switch (action) {
                case 'status':
                    await showVIPStatus(interaction, userId);
                    break;
                case 'shop':
                    await showVIPShop(interaction, userId);
                    break;
                case 'buy':
                    await buyVIP(interaction, userId);
                    break;
                case 'weekly':
                    await claimWeekly(interaction, userId);
                    break;
                default:
                    await interaction.reply({
                        content: '❌ Invalid action!',
                        ephemeral: true
                    });
            }

        } catch (error) {
            console.error('Error in vip command:', error);
            await interaction.reply({
                content: '❌ An error occurred while processing your VIP request. Please try again.',
                ephemeral: true
            });
        }
    }
};

async function showVIPStatus(interaction, userId) {
    const status = getVIPStatus(userId);

    const embed = new EmbedBuilder()
        .setTitle(`${interaction.user.username}'s VIP Status`)
        .setTimestamp();

    if (status.isActive) {
        const tier = status.tier;
        embed.setColor(tier.color);
        embed.setDescription(`${tier.emoji} **${tier.name}**\n*Active Membership*`);

        embed.addFields(
            {
                name: '⏰ Time Remaining',
                value: `${status.daysRemaining} days`,
                inline: true
            },
            {
                name: '🔄 Renewals',
                value: `${status.renewalCount} times`,
                inline: true
            },
            {
                name: '✨ Active Perks',
                value: tier.perks.description.join('\n'),
                inline: false
            }
        );

        const expiryDate = new Date(status.expiresAt);
        embed.setFooter({ text: `Expires on ${expiryDate.toLocaleDateString()}` });

    } else {
        embed.setColor('#808080');
        embed.setDescription('You don\'t have an active VIP membership.');
        embed.addFields({
            name: '🛒 Get VIP',
            value: 'Use `/vip shop` to browse VIP tiers and unlock exclusive perks!',
            inline: false
        });
    }

    await interaction.reply({ embeds: [embed] });
}

async function showVIPShop(interaction, userId) {
    const tiers = getAllVIPTiers();
    const userMoney = await getUserMoney(userId);
    const currentStatus = getVIPStatus(userId);

    const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('👑 VIP Membership Tiers')
        .setDescription('Unlock exclusive perks with VIP membership!\n**Duration:** 30 days per purchase')
        .setFooter({ text: `Your Balance: $${userMoney.toLocaleString()}` })
        .setTimestamp();

    for (const tier of tiers) {
        const affordable = userMoney >= tier.price ? '✅' : '❌';
        const current = currentStatus.isActive && currentStatus.tier.id === tier.id ? '⭐ **ACTIVE**' : '';

        embed.addFields({
            name: `${affordable} ${tier.emoji} ${tier.name} - $${tier.monthlyPrice.toLocaleString()}/month ${current}`,
            value: tier.perks.description.join('\n'),
            inline: false
        });
    }

    embed.addFields({
        name: 'How to Purchase',
        value: 'Use `/vip buy <tier>` to purchase or renew your VIP membership!',
        inline: false
    });

    // Create purchase buttons
    const rows = [];
    const row1 = new ActionRowBuilder();
    const row2 = new ActionRowBuilder();

    // Bronze and Silver
    row1.addComponents(
        new ButtonBuilder()
            .setCustomId('vip_buy_bronze')
            .setLabel('🥉 Bronze - $5k')
            .setStyle(userMoney >= tiers[0].price ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(userMoney < tiers[0].price),
        new ButtonBuilder()
            .setCustomId('vip_buy_silver')
            .setLabel('🥈 Silver - $15k')
            .setStyle(userMoney >= tiers[1].price ? ButtonStyle.Primary : ButtonStyle.Secondary)
            .setDisabled(userMoney < tiers[1].price)
    );

    // Gold and Platinum
    row2.addComponents(
        new ButtonBuilder()
            .setCustomId('vip_buy_gold')
            .setLabel('🥇 Gold - $50k')
            .setStyle(userMoney >= tiers[2].price ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(userMoney < tiers[2].price),
        new ButtonBuilder()
            .setCustomId('vip_buy_platinum')
            .setLabel('💎 Platinum - $100k')
            .setStyle(userMoney >= tiers[3].price ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(userMoney < tiers[3].price)
    );

    rows.push(row1, row2);

    await interaction.reply({ embeds: [embed], components: rows });
}

async function buyVIP(interaction, userId) {
    const tierId = interaction.options.getString('tier');

    if (!tierId) {
        return interaction.reply({
            content: '❌ Please specify a VIP tier! Example: `/vip buy bronze`',
            ephemeral: true
        });
    }

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
}

async function claimWeekly(interaction, userId) {
    const result = await claimWeeklyBonus(userId);

    if (!result.success) {
        return interaction.reply({
            content: `❌ ${result.message}`,
            ephemeral: true
        });
    }

    const embed = new EmbedBuilder()
        .setColor(result.tier.color)
        .setTitle('🎁 Weekly VIP Bonus Claimed!')
        .setDescription(`${result.tier.emoji} **${result.tier.name}** Weekly Bonus`)
        .addFields({
            name: '💰 Amount',
            value: `$${result.amount.toLocaleString()}`,
            inline: true
        })
        .setFooter({ text: 'You can claim your next weekly bonus in 7 days' })
        .setTimestamp();

    const currentMoney = await getUserMoney(userId);
    embed.addFields({
        name: '💵 New Balance',
        value: `$${currentMoney.toLocaleString()}`,
        inline: true
    });

    await interaction.reply({ embeds: [embed] });
}
