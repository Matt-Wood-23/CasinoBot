const { EmbedBuilder } = require('discord.js');
const { getUserGuild } = require('../utils/guilds');
const {
    getShopItems,
    getContributionPoints,
    purchaseShopItem,
    getUserPurchases,
    getGuildWithLevel
} = require('../database/queries');

module.exports = {
    data: {
        name: 'guild-shop',
        description: 'Browse and purchase items from the guild shop',
        options: [
            {
                name: 'action',
                description: 'Shop action',
                type: 3, // STRING
                required: true,
                choices: [
                    { name: 'Browse - View available items', value: 'browse' },
                    { name: 'Buy - Purchase an item', value: 'buy' },
                    { name: 'Inventory - View your purchased items', value: 'inventory' },
                    { name: 'Balance - Check your contribution points', value: 'balance' }
                ]
            },
            {
                name: 'item',
                description: 'Item to purchase (use item key from browse)',
                type: 3, // STRING
                required: false
            },
            {
                name: 'category',
                description: 'Filter by category',
                type: 3, // STRING
                required: false,
                choices: [
                    { name: 'All Items', value: 'all' },
                    { name: 'Boosts', value: 'boost' },
                    { name: 'Cosmetics', value: 'cosmetic' },
                    { name: 'Consumables', value: 'consumable' }
                ]
            }
        ]
    },

    async execute(interaction) {
        try {
            const userId = interaction.user.id;
            const action = interaction.options.getString('action');

            switch (action) {
                case 'browse':
                    await browseShopCommand(interaction, userId);
                    break;
                case 'buy':
                    await buyItemCommand(interaction, userId);
                    break;
                case 'inventory':
                    await viewInventoryCommand(interaction, userId);
                    break;
                case 'balance':
                    await checkBalanceCommand(interaction, userId);
                    break;
                default:
                    await interaction.reply({
                        content: '❌ Invalid action!',
                        ephemeral: true
                    });
            }
        } catch (error) {
            console.error('Error in guild-shop command:', error);
            await interaction.reply({
                content: '❌ An error occurred while processing your request.',
                ephemeral: true
            });
        }
    }
};

// Browse shop items
async function browseShopCommand(interaction, userId) {
    const category = interaction.options.getString('category') || 'all';

    const userGuild = await getUserGuild(userId);

    if (!userGuild) {
        return interaction.reply({
            content: '❌ You\'re not in a guild! Use `/guild create` or `/guild join` to get started.',
            ephemeral: true
        });
    }

    const guild = await getGuildWithLevel(userGuild.guildId);
    const items = await getShopItems(guild.level || 1);
    const points = await getContributionPoints(userGuild.guildId, userId);

    // Filter by category
    const filteredItems = category === 'all'
        ? items
        : items.filter(item => item.itemType === category);

    if (filteredItems.length === 0) {
        return interaction.reply({
            content: `❌ No items found in the ${category} category!`,
            ephemeral: true
        });
    }

    // Group items by type
    const itemsByType = {
        boost: [],
        cosmetic: [],
        consumable: []
    };

    for (const item of filteredItems) {
        itemsByType[item.itemType]?.push(item);
    }

    const embed = new EmbedBuilder()
        .setColor('#F39C12')
        .setTitle(`🏪 ${guild.name} - Guild Shop`)
        .setDescription(`Browse exclusive items and spend your contribution points!\n\n**Your Points:** ${points.toLocaleString()} 🎖️`)
        .setTimestamp();

    // Add boosts
    if (itemsByType.boost.length > 0) {
        const boostText = itemsByType.boost.map(item => {
            const duration = item.durationHours ? ` (${item.durationHours}h)` : '';
            const canAfford = points >= item.cost ? '✅' : '❌';
            return `${canAfford} **${item.itemName}**${duration}\n   ${item.description}\n   Cost: **${item.cost}** points | Key: \`${item.itemKey}\``;
        }).join('\n\n');

        embed.addFields({
            name: '⚡ Boosts',
            value: boostText,
            inline: false
        });
    }

    // Add cosmetics
    if (itemsByType.cosmetic.length > 0) {
        const cosmeticText = itemsByType.cosmetic.map(item => {
            const canAfford = points >= item.cost ? '✅' : '❌';
            return `${canAfford} **${item.itemName}**\n   ${item.description}\n   Cost: **${item.cost}** points | Key: \`${item.itemKey}\``;
        }).join('\n\n');

        embed.addFields({
            name: '✨ Cosmetics',
            value: cosmeticText,
            inline: false
        });
    }

    // Add consumables
    if (itemsByType.consumable.length > 0) {
        const consumableText = itemsByType.consumable.map(item => {
            const canAfford = points >= item.cost ? '✅' : '❌';
            return `${canAfford} **${item.itemName}**\n   ${item.description}\n   Cost: **${item.cost}** points | Key: \`${item.itemKey}\``;
        }).join('\n\n');

        embed.addFields({
            name: '🎁 Consumables',
            value: consumableText,
            inline: false
        });
    }

    embed.setFooter({ text: 'Use /guild-shop buy item:<key> to purchase | ✅ = Can afford' });

    await interaction.reply({ embeds: [embed] });
}

// Buy an item
async function buyItemCommand(interaction, userId) {
    const itemKey = interaction.options.getString('item');

    if (!itemKey) {
        return interaction.reply({
            content: '❌ Please specify an item to buy! Example: `/guild-shop buy item:personal_xp_boost_24h`\nUse `/guild-shop browse` to see available items.',
            ephemeral: true
        });
    }

    const userGuild = await getUserGuild(userId);

    if (!userGuild) {
        return interaction.reply({
            content: '❌ You\'re not in a guild!',
            ephemeral: true
        });
    }

    const guild = await getGuildWithLevel(userGuild.guildId);
    const points = await getContributionPoints(userGuild.guildId, userId);

    // Get all items and find the requested one
    const items = await getShopItems(guild.level || 1);
    const item = items.find(i => i.itemKey === itemKey);

    if (!item) {
        return interaction.reply({
            content: `❌ Item not found! Use \`/guild-shop browse\` to see available items.`,
            ephemeral: true
        });
    }

    if (points < item.cost) {
        return interaction.reply({
            content: `❌ You don't have enough contribution points!\n\n**Item:** ${item.itemName}\n**Cost:** ${item.cost} points\n**Your Points:** ${points} points\n**Need:** ${item.cost - points} more points`,
            ephemeral: true
        });
    }

    // Purchase the item
    const result = await purchaseShopItem(userGuild.guildId, userId, itemKey, item.cost);

    if (!result.success) {
        return interaction.reply({
            content: `❌ Failed to purchase item: ${result.error}`,
            ephemeral: true
        });
    }

    const durationText = item.durationHours ? ` for **${item.durationHours} hours**` : '';
    const expiryText = result.purchase.expiresAt
        ? `\n⏰ Expires: <t:${Math.floor(result.purchase.expiresAt / 1000)}:R>`
        : '';

    const embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle('✅ Purchase Successful!')
        .setDescription(`You purchased **${item.itemName}**${durationText}!\n\n${item.description}${expiryText}`)
        .addFields(
            {
                name: '💰 Cost',
                value: `${item.cost} points`,
                inline: true
            },
            {
                name: '🎖️ Remaining Points',
                value: `${points - item.cost} points`,
                inline: true
            }
        )
        .setTimestamp()
        .setFooter({ text: 'Use /guild-shop inventory to view your items' });

    await interaction.reply({ embeds: [embed] });
}

// View inventory
async function viewInventoryCommand(interaction, userId) {
    const userGuild = await getUserGuild(userId);

    if (!userGuild) {
        return interaction.reply({
            content: '❌ You\'re not in a guild!',
            ephemeral: true
        });
    }

    const purchases = await getUserPurchases(userId, userGuild.guildId, false);

    if (purchases.length === 0) {
        return interaction.reply({
            content: '📦 Your inventory is empty! Use `/guild-shop browse` to see available items.',
            ephemeral: true
        });
    }

    const guild = await getGuildWithLevel(userGuild.guildId);

    const embed = new EmbedBuilder()
        .setColor('#9B59B6')
        .setTitle(`📦 ${guild.name} - Your Inventory`)
        .setDescription('Your active guild shop items:')
        .setTimestamp();

    // Group by type
    const itemsByType = {
        boost: [],
        cosmetic: [],
        consumable: []
    };

    for (const purchase of purchases) {
        itemsByType[purchase.itemType]?.push(purchase);
    }

    // Add each type
    for (const [type, items] of Object.entries(itemsByType)) {
        if (items.length === 0) continue;

        const typeEmoji = type === 'boost' ? '⚡' : type === 'cosmetic' ? '✨' : '🎁';
        const itemsText = items.map(item => {
            const expiryText = item.expiresAt
                ? ` - Expires <t:${Math.floor(item.expiresAt / 1000)}:R>`
                : '';
            const usesText = item.maxUses
                ? ` - ${item.timesUsed}/${item.maxUses} uses`
                : '';
            return `**${item.itemName}**${expiryText}${usesText}`;
        }).join('\n');

        embed.addFields({
            name: `${typeEmoji} ${type.charAt(0).toUpperCase() + type.slice(1)}s`,
            value: itemsText,
            inline: false
        });
    }

    embed.setFooter({ text: 'Active items will be automatically applied to your games' });

    await interaction.reply({ embeds: [embed] });
}

// Check balance
async function checkBalanceCommand(interaction, userId) {
    const userGuild = await getUserGuild(userId);

    if (!userGuild) {
        return interaction.reply({
            content: '❌ You\'re not in a guild!',
            ephemeral: true
        });
    }

    const guild = await getGuildWithLevel(userGuild.guildId);
    const points = await getContributionPoints(userGuild.guildId, userId);

    const embed = new EmbedBuilder()
        .setColor('#F39C12')
        .setTitle(`${guild.name} - Contribution Points`)
        .setDescription('Contribution points are earned through guild activities and can be spent in the guild shop!')
        .addFields({
            name: '🎖️ Your Contribution Points',
            value: `**${points.toLocaleString()}** points`,
            inline: false
        })
        .addFields({
            name: '📊 How to Earn Points',
            value: '• **1 point** per game played\n• **1 point** per $500 wagered\n• **5 points** per $10,000 donated\n• **10 points** for failed heists\n• **25 points** for successful heists\n• **50 points** per weekly challenge',
            inline: false
        })
        .setTimestamp()
        .setFooter({ text: 'Use /guild-shop browse to spend your points!' });

    await interaction.reply({ embeds: [embed] });
}
