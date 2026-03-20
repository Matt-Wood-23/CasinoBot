const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getShopItems, purchaseItem, getShopItem } = require('../utils/shop');
const { getUserMoney } = require('../utils/data');

module.exports = {
    data: {
        name: 'shop',
        description: 'Browse and purchase consumable items and power-ups'
    },

    async execute(interaction) {
        try {
            const userId = interaction.user.id;
            const userMoney = await getUserMoney(userId);
            const shopItems = getShopItems();

            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('🏪 Casino Shop')
                .setDescription('Purchase consumable items to boost your gameplay!\n**Note:** Only 1 boost can be active at a time.')
                .setFooter({ text: `Your Balance: $${userMoney.toLocaleString()}` })
                .setTimestamp();

            // Group items by category
            const boosts = shopItems.filter(item => item.category === 'boost');
            const protections = shopItems.filter(item => item.category === 'protection');

            if (boosts.length > 0) {
                const boostText = boosts.map(item => {
                    const affordable = userMoney >= item.price ? '✅' : '❌';
                    return `${affordable} **${item.name}**\n*${item.description}*\nPrice: $${item.price.toLocaleString()}`;
                }).join('\n\n');

                embed.addFields({
                    name: '⚡ Boosts & Multipliers',
                    value: boostText,
                    inline: false
                });
            }

            if (protections.length > 0) {
                const protectionText = protections.map(item => {
                    const affordable = userMoney >= item.price ? '✅' : '❌';
                    return `${affordable} **${item.name}**\n*${item.description}*\nPrice: $${item.price.toLocaleString()}`;
                }).join('\n\n');

                embed.addFields({
                    name: '🛡️ Protection Items',
                    value: protectionText,
                    inline: false
                });
            }

            embed.addFields({
                name: 'How to Purchase',
                value: 'Click the buttons below to buy items, or use `/buy <item_id>`',
                inline: false
            });

            // Create purchase buttons (max 5 per row, 2 rows max)
            const rows = [];
            const itemsPerRow = 3;

            for (let i = 0; i < shopItems.length; i += itemsPerRow) {
                const row = new ActionRowBuilder();
                const chunk = shopItems.slice(i, i + itemsPerRow);

                for (const item of chunk) {
                    const canAfford = userMoney >= item.price;
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`shop_buy_${item.id}`)
                            .setLabel(`${item.name.split(' ')[0]} - $${(item.price / 1000)}k`)
                            .setStyle(canAfford ? ButtonStyle.Success : ButtonStyle.Secondary)
                            .setDisabled(!canAfford)
                    );
                }

                rows.push(row);

                // Discord limit: max 5 action rows
                if (rows.length >= 4) break;
            }

            await interaction.reply({ embeds: [embed], components: rows });

        } catch (error) {
            console.error('Error in shop command:', error);

            const errorMessage = {
                content: '❌ An error occurred while loading the shop. Please try again.',
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
