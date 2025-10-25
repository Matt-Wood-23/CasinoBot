const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
    getAllProperties,
    getUserProperties,
    purchaseProperty,
    upgradeProperty,
    getPropertyById,
    canPurchaseProperty
} = require('../utils/properties');
const { getUserMoney } = require('../utils/data');
const { getUserVIPTier } = require('../utils/vip');

module.exports = {
    data: {
        name: 'properties',
        description: 'View and manage your properties',
        options: [
            {
                name: 'action',
                description: 'Property action',
                type: 3, // STRING
                required: false,
                choices: [
                    { name: 'My Properties - View your owned properties', value: 'owned' },
                    { name: 'Shop - Browse available properties', value: 'shop' },
                    { name: 'Buy - Purchase a property', value: 'buy' },
                    { name: 'Upgrade - Upgrade a property', value: 'upgrade' }
                ]
            },
            {
                name: 'property',
                description: 'Property ID (for buy/upgrade actions)',
                type: 3, // STRING
                required: false
            }
        ]
    },

    async execute(interaction) {
        try {
            const userId = interaction.user.id;
            const action = interaction.options.getString('action') || 'owned';

            switch (action) {
                case 'owned':
                    await showOwnedProperties(interaction, userId);
                    break;
                case 'shop':
                    await showPropertyShop(interaction, userId);
                    break;
                case 'buy':
                    await buyProperty(interaction, userId);
                    break;
                case 'upgrade':
                    await upgradePropertyCommand(interaction, userId);
                    break;
                default:
                    await showOwnedProperties(interaction, userId);
            }

        } catch (error) {
            console.error('Error in properties command:', error);

            const errorMessage = {
                content: '❌ An error occurred while processing your property request. Please try again.',
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

async function showOwnedProperties(interaction, userId) {
    const ownedProperties = await getUserProperties(userId);

    const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle(`🏢 ${interaction.user.username}'s Properties`)
        .setTimestamp();

    if (ownedProperties.length === 0) {
        embed.setDescription('You don\'t own any properties yet!');
        embed.addFields({
            name: '🛒 Get Started',
            value: 'Use `/properties shop` to browse available properties!',
            inline: false
        });
    } else {
        let totalIncome = 0;
        let totalMaintenance = 0;

        const propertyText = ownedProperties.map(prop => {
            totalIncome += prop.dailyIncome;
            totalMaintenance += prop.dailyMaintenance;

            const upgradeInfo = prop.upgradeLevel > 0 ? ` (⭐ Level ${prop.upgradeLevel})` : '';
            return `${prop.emoji} **${prop.name}**${upgradeInfo}\n` +
                `Daily Income: $${prop.dailyIncome.toLocaleString()} | Maintenance: $${prop.dailyMaintenance.toLocaleString()}\n` +
                `Net: $${prop.netIncome.toLocaleString()}/day`;
        }).join('\n\n');

        embed.setDescription(propertyText);

        embed.addFields(
            {
                name: '💰 Total Daily Income',
                value: `$${totalIncome.toLocaleString()}`,
                inline: true
            },
            {
                name: '🔧 Total Maintenance',
                value: `$${totalMaintenance.toLocaleString()}`,
                inline: true
            },
            {
                name: '💵 Net Daily Profit',
                value: `$${(totalIncome - totalMaintenance).toLocaleString()}`,
                inline: true
            }
        );

        embed.setFooter({ text: 'Use /collect to claim your daily property income!' });
    }

    await interaction.reply({ embeds: [embed] });
}

async function showPropertyShop(interaction, userId) {
    const vipTier = await getUserVIPTier(userId);
    const userVipLevel = vipTier ? vipTier.level : 0;
    const availableProperties = getAllProperties(userVipLevel);
    const allProperties = getAllProperties();
    const userMoney = await getUserMoney(userId);
    const ownedProperties = await getUserProperties(userId);
    const ownedIds = ownedProperties.map(p => p.id);

    const embed = new EmbedBuilder()
        .setColor('#00D9FF')
        .setTitle('🏢 Property Shop')
        .setDescription('Purchase properties to generate passive income!')
        .setFooter({ text: `Your Balance: $${userMoney.toLocaleString()} | VIP Level: ${userVipLevel}` })
        .setTimestamp();

    // Group by category
    const categories = {
        starter: availableProperties.filter(p => p.category === 'starter'),
        bronze: availableProperties.filter(p => p.category === 'bronze'),
        silver: availableProperties.filter(p => p.category === 'silver'),
        gold: availableProperties.filter(p => p.category === 'gold'),
        platinum: availableProperties.filter(p => p.category === 'platinum')
    };

    for (const [category, properties] of Object.entries(categories)) {
        if (properties.length === 0) continue;

        const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
        const propText = properties.map(prop => {
            const affordable = userMoney >= prop.purchasePrice ? '✅' : '❌';
            const owned = ownedIds.includes(prop.id) ? '✅ **OWNED**' : '';
            const locked = prop.vipLevel > userVipLevel ? '🔒 **LOCKED**' : '';

            return `${affordable} ${prop.emoji} **${prop.name}** ${owned}${locked}\n` +
                `*${prop.description}*\n` +
                `Price: $${prop.purchasePrice.toLocaleString()} | Income: $${prop.baseIncome.toLocaleString()}/day | Maintenance: $${prop.baseMaintenance.toLocaleString()}/day`;
        }).join('\n\n');

        embed.addFields({
            name: `${categoryName} Properties`,
            value: propText,
            inline: false
        });
    }

    // Show locked properties
    const lockedProperties = allProperties.filter(p => p.vipLevel > userVipLevel);
    if (lockedProperties.length > 0) {
        const lockedText = lockedProperties.slice(0, 2).map(prop => {
            return `🔒 ${prop.emoji} **${prop.name}**\nRequires: ${prop.vipRequired.charAt(0).toUpperCase() + prop.vipRequired.slice(1)} VIP`;
        }).join('\n\n');

        embed.addFields({
            name: '🔒 Locked Properties',
            value: lockedText + (lockedProperties.length > 2 ? `\n\n...and ${lockedProperties.length - 2} more!` : ''),
            inline: false
        });
    }

    embed.addFields({
        name: '🛒 How to Purchase',
        value: 'Click the buttons below to purchase properties!',
        inline: false
    });

    // Create purchase buttons (max 5 rows, 4 buttons per row)
    const rows = [];
    const itemsPerRow = 4;

    // Only show buttons for properties user can access (not locked, not owned)
    const purchasableProperties = availableProperties.filter(p => {
        return !ownedIds.includes(p.id) && p.vipLevel <= userVipLevel;
    });

    for (let i = 0; i < purchasableProperties.length; i += itemsPerRow) {
        const row = new ActionRowBuilder();
        const chunk = purchasableProperties.slice(i, i + itemsPerRow);

        for (const prop of chunk) {
            const canAfford = userMoney >= prop.purchasePrice;
            const priceLabel = prop.purchasePrice >= 1000000
                ? `$${(prop.purchasePrice / 1000000).toFixed(1)}M`
                : prop.purchasePrice >= 1000
                    ? `$${(prop.purchasePrice / 1000)}k`
                    : `$${prop.purchasePrice}`;

            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`property_buy_${prop.id}`)
                    .setLabel(`${prop.emoji} ${prop.name.split(' ')[0]} - ${priceLabel}`)
                    .setStyle(canAfford ? ButtonStyle.Success : ButtonStyle.Secondary)
                    .setDisabled(!canAfford)
            );
        }

        rows.push(row);

        // Discord limit: max 5 action rows
        if (rows.length >= 5) break;
    }

    await interaction.reply({ embeds: [embed], components: rows });
}

async function buyProperty(interaction, userId) {
    const propertyId = interaction.options.getString('property');

    if (!propertyId) {
        return interaction.reply({
            content: '❌ Please specify a property ID! Example: `/properties buy slot_machine_room`',
            ephemeral: true
        });
    }

    await interaction.deferReply();

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
            }
        )
        .setFooter({ text: 'Use /collect to claim daily income!' })
        .setTimestamp();

    const currentMoney = await getUserMoney(userId);
    embed.addFields({
        name: '💳 New Balance',
        value: `$${currentMoney.toLocaleString()}`,
        inline: true
    });

    await interaction.editReply({ embeds: [embed] });
}

async function upgradePropertyCommand(interaction, userId) {
    const propertyId = interaction.options.getString('property');

    if (!propertyId) {
        return interaction.reply({
            content: '❌ Please specify a property ID! Example: `/properties upgrade slot_machine_room`',
            ephemeral: true
        });
    }

    await interaction.deferReply();

    const result = await upgradeProperty(userId, propertyId);

    if (!result.success) {
        const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Upgrade Failed')
            .setDescription(result.message)
            .setTimestamp();

        return interaction.editReply({ embeds: [errorEmbed] });
    }

    const property = result.property;
    const upgrade = result.upgrade;

    const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('⭐ Property Upgraded!')
        .setDescription(`${property.emoji} **${property.name}**\nUpgraded to Level ${result.newLevel}`)
        .addFields(
            {
                name: '💰 Upgrade Cost',
                value: `$${upgrade.cost.toLocaleString()}`,
                inline: true
            },
            {
                name: '📈 Income Boost',
                value: `+$${upgrade.incomeBoost.toLocaleString()}/day`,
                inline: true
            },
            {
                name: '🔧 Maintenance Increase',
                value: `+$${upgrade.maintenanceIncrease.toLocaleString()}/day`,
                inline: true
            }
        )
        .setTimestamp();

    const currentMoney = await getUserMoney(userId);
    embed.addFields({
        name: '💳 New Balance',
        value: `$${currentMoney.toLocaleString()}`,
        inline: true
    });

    await interaction.editReply({ embeds: [embed] });
}
