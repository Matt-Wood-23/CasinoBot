const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getUserInventory, getActiveBoosts, getInventoryCount } = require('../utils/shop');

module.exports = {
    data: {
        name: 'inventory',
        description: 'View your purchased items and active boosts'
    },

    async execute(interaction) {
        try {
            const userId = interaction.user.id;
            const inventory = getUserInventory(userId);
            const activeBoosts = getActiveBoosts(userId);
            const inventoryCounts = getInventoryCount(userId);

            const embed = new EmbedBuilder()
                .setColor('#00D9FF')
                .setTitle(`🎒 ${interaction.user.username}'s Inventory`)
                .setTimestamp();

            // Show active boosts
            if (activeBoosts.length > 0) {
                const activeText = activeBoosts.map(boost => {
                    const { SHOP_ITEMS } = require('../utils/shop');
                    const item = SHOP_ITEMS[boost.itemType];
                    if (!item) return '';

                    const activatedDate = new Date(boost.activatedAt);
                    return `${item.name}\n*${item.description}*\nActivated: ${activatedDate.toLocaleString()}`;
                }).filter(text => text).join('\n\n');

                embed.addFields({
                    name: '✨ Active Boosts',
                    value: activeText || 'None',
                    inline: false
                });
            } else {
                embed.addFields({
                    name: '✨ Active Boosts',
                    value: 'No active boosts. Use `/use` to activate an item!',
                    inline: false
                });
            }

            // Show inventory items
            if (inventory.length > 0) {
                const { SHOP_ITEMS } = require('../utils/shop');
                const inventoryText = Object.entries(inventoryCounts).map(([itemType, count]) => {
                    const item = SHOP_ITEMS[itemType];
                    if (!item) return '';

                    return `${item.name} x${count}\n*${item.description}*`;
                }).filter(text => text).join('\n\n');

                embed.addFields({
                    name: `📦 Items (${inventory.length} total)`,
                    value: inventoryText || 'No items',
                    inline: false
                });
            } else {
                embed.addFields({
                    name: '📦 Items',
                    value: 'Your inventory is empty. Visit `/shop` to purchase items!',
                    inline: false
                });
            }

            embed.setFooter({ text: 'Use /use <item_name> to activate an item' });

            // Add "Use Item" buttons for inventory items (max 5)
            const rows = [];
            if (inventory.length > 0 && activeBoosts.length === 0) {
                const uniqueItems = [...new Set(inventory.map(item => {
                    return item.id.split('_')[0] + '_' + item.id.split('_')[1];
                }))];

                const row = new ActionRowBuilder();
                const itemsToShow = uniqueItems.slice(0, 5);

                for (const itemType of itemsToShow) {
                    const { SHOP_ITEMS } = require('../utils/shop');
                    const item = SHOP_ITEMS[itemType];
                    if (!item) continue;

                    const count = inventoryCounts[itemType];
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`use_item_${itemType}`)
                            .setLabel(`Use ${item.name.split(' ')[0]} (${count})`)
                            .setStyle(ButtonStyle.Primary)
                    );
                }

                if (row.components.length > 0) {
                    rows.push(row);
                }
            }

            await interaction.reply({ embeds: [embed], components: rows });

        } catch (error) {
            console.error('Error in inventory command:', error);
            await interaction.reply({
                content: '❌ An error occurred while loading your inventory. Please try again.',
                ephemeral: true
            });
        }
    }
};
