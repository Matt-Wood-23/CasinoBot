const { EmbedBuilder } = require('discord.js');
const { useItem, getUserInventory, SHOP_ITEMS } = require('../utils/shop');

module.exports = {
    data: {
        name: 'use',
        description: 'Use a consumable item from your inventory',
        options: [
            {
                name: 'item',
                description: 'The item to use (luck_boost, insurance, double_daily, etc.)',
                type: 3, // STRING
                required: true,
                choices: [
                    { name: '🍀 Luck Boost', value: 'luck_boost' },
                    { name: '🛡️ Bet Insurance', value: 'insurance' },
                    { name: '💎 Double Daily', value: 'double_daily' },
                    { name: '🔥 Win Streak Shield', value: 'win_streak_protector' },
                    { name: '💸 High Roller Pass', value: 'big_spender_pass' },
                    { name: '⭐ Win Multiplier', value: 'xp_boost' }
                ]
            }
        ]
    },

    async execute(interaction) {
        try {
            const userId = interaction.user.id;
            const itemType = interaction.options.getString('item');
            const inventory = getUserInventory(userId);

            // Find the first item of this type in inventory
            const item = inventory.find(invItem => {
                const invItemType = invItem.id.split('_')[0] + '_' + invItem.id.split('_')[1];
                return invItemType === itemType;
            });

            if (!item) {
                const shopItem = SHOP_ITEMS[itemType];
                return interaction.reply({
                    content: `❌ You don't have any **${shopItem?.name || itemType}** in your inventory! Purchase one from \`/shop\` first.`,
                    ephemeral: true
                });
            }

            // Use the item
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
            console.error('Error in use command:', error);
            await interaction.reply({
                content: '❌ An error occurred while using the item. Please try again.',
                ephemeral: true
            });
        }
    }
};
