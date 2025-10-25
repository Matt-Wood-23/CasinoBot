const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getUserMoney } = require('../utils/data');

module.exports = {
    data: {
        name: 'horserace',
        description: 'Bet on a horse race!',
        options: [
            {
                name: 'bet',
                description: 'Amount to bet',
                type: 4,
                required: true,
                min_value: 10
            }
        ]
    },

    async execute(interaction) {
        try {
            const bet = interaction.options.getInteger('bet');
            const userMoney = await getUserMoney(interaction.user.id);

            if (bet > userMoney) {
                return interaction.reply({
                    content: `❌ You don't have enough money! You have ${userMoney.toLocaleString()}, but tried to bet ${bet.toLocaleString()}.`,
                    ephemeral: true
                });
            }

            // Horse information
            const horses = [
                { number: 1, name: 'Lightning Bolt', emoji: '🏇', odds: 3, color: '🔴' },
                { number: 2, name: 'Thunder Strike', emoji: '🐎', odds: 4, color: '🔵' },
                { number: 3, name: 'Midnight Runner', emoji: '🏇', odds: 5, color: '⚫' },
                { number: 4, name: 'Golden Flash', emoji: '🐎', odds: 6, color: '🟡' },
                { number: 5, name: 'Storm Chaser', emoji: '🏇', odds: 8, color: '🟢' },
                { number: 6, name: 'Wild Wind', emoji: '🐎', odds: 10, color: '🟣' }
            ];

            // Create selection embed
            const embed = new EmbedBuilder()
                .setTitle('🏇 HORSE RACING 🏇')
                .setDescription(`**Bet:** ${bet.toLocaleString()}\n\nSelect a horse to bet on!\n\nHigher odds = bigger payout but lower chance to win!`)
                .setColor('#FFD700');

            // Add horse fields
            for (const horse of horses) {
                const potentialWin = bet * horse.odds;
                embed.addFields({
                    name: `${horse.color} ${horse.number}. ${horse.name}`,
                    value: `Odds: **${horse.odds}:1**\nPotential Win: **${potentialWin.toLocaleString()}**`,
                    inline: true
                });
            }

            // Create buttons (2 rows of 3)
            const row1 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`race_horse_1_${bet}`)
                        .setLabel('1. Lightning Bolt (3:1)')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`race_horse_2_${bet}`)
                        .setLabel('2. Thunder Strike (4:1)')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`race_horse_3_${bet}`)
                        .setLabel('3. Midnight Runner (5:1)')
                        .setStyle(ButtonStyle.Secondary)
                );

            const row2 = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`race_horse_4_${bet}`)
                        .setLabel('4. Golden Flash (6:1)')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`race_horse_5_${bet}`)
                        .setLabel('5. Storm Chaser (8:1)')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`race_horse_6_${bet}`)
                        .setLabel('6. Wild Wind (10:1)')
                        .setStyle(ButtonStyle.Danger)
                );

            await interaction.reply({
                embeds: [embed],
                components: [row1, row2]
            });

        } catch (error) {
            console.error('Error in horserace command:', error);

            const errorMessage = {
                content: '❌ An error occurred while starting the race. Please try again.',
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
