const { EmbedBuilder } = require('discord.js');
const { collectPropertyIncome } = require('../utils/properties');
const { getUserMoney } = require('../utils/data');

module.exports = {
    data: {
        name: 'collect',
        description: 'Collect daily income from your properties'
    },

    async execute(interaction) {
        try {
            const userId = interaction.user.id;

            const result = await collectPropertyIncome(userId);

            if (!result.success) {
                return interaction.reply({
                    content: `❌ ${result.message}`,
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('💰 Property Income Collected!')
                .setDescription(`Successfully collected income from **${result.propertyCount}** ${result.propertyCount === 1 ? 'property' : 'properties'}!`)
                .addFields(
                    {
                        name: '💵 Total Income',
                        value: `$${result.totalIncome.toLocaleString()}`,
                        inline: true
                    },
                    {
                        name: '🔧 Maintenance Costs',
                        value: `-$${result.totalMaintenance.toLocaleString()}`,
                        inline: true
                    },
                    {
                        name: '📊 Net Profit',
                        value: `$${result.netIncome.toLocaleString()}`,
                        inline: true
                    }
                )
                .setFooter({ text: 'You can collect again in 24 hours' })
                .setTimestamp();

            const currentMoney = await getUserMoney(userId);
            embed.addFields({
                name: '💳 New Balance',
                value: `$${currentMoney.toLocaleString()}`,
                inline: false
            });

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in collect command:', error);
            await interaction.reply({
                content: '❌ An error occurred while collecting your property income. Please try again.',
                ephemeral: true
            });
        }
    }
};
