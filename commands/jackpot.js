const { EmbedBuilder } = require('discord.js');
const { getServerJackpot } = require('../database/queries');
const { applyHolidayTheme } = require('../utils/holidayEvents');

module.exports = {
    data: {
        name: 'jackpot',
        description: 'View the current progressive jackpot'
    },

    async execute(interaction) {
        try {
            const serverId = interaction.guildId;

            if (!serverId) {
                return await interaction.reply({
                    content: '❌ This command can only be used in a server!',
                    ephemeral: true
                });
            }

            // Get jackpot data
            const jackpotData = await getServerJackpot(serverId);

            if (!jackpotData) {
                return await interaction.reply({
                    content: '❌ Unable to fetch jackpot data. Please try again.',
                    ephemeral: true
                });
            }

            // Create embed
            let embed = new EmbedBuilder()
                .setTitle('💎 PROGRESSIVE JACKPOT 💎')
                .setColor('#FFD700')
                .setDescription(
                    `The jackpot grows with every **Slots** and **Blackjack** game played!\n` +
                    `Each bet contributes 0.5% to the jackpot pool.\n\n` +
                    `💰 **Current Jackpot: $${jackpotData.currentAmount.toLocaleString()}**`
                )
                .setTimestamp();

            // Add fields
            embed.addFields({
                name: '🎰 How to Win',
                value: `**Slots:** 0.05% chance on every spin\n**Blackjack:** 0.03% chance on natural blackjack`,
                inline: false
            });

            // Jackpot stats
            let statsText = `💵 Total Contributed: $${jackpotData.totalContributed.toLocaleString()}\n`;
            statsText += `🏆 Times Won: ${jackpotData.timesWon}`;

            embed.addFields({
                name: '📊 Jackpot Stats',
                value: statsText,
                inline: true
            });

            // Last winner info
            if (jackpotData.lastWinnerId && jackpotData.lastWonAt > 0) {
                try {
                    const lastWinner = await interaction.client.users.fetch(jackpotData.lastWinnerId);
                    const timeSinceWin = Date.now() - jackpotData.lastWonAt;
                    const daysSince = Math.floor(timeSinceWin / (24 * 60 * 60 * 1000));
                    const hoursSince = Math.floor((timeSinceWin % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

                    let lastWinText = `🥇 **${lastWinner.username}**\n`;
                    lastWinText += `💰 Won: $${jackpotData.lastWinnerAmount.toLocaleString()}\n`;

                    if (daysSince > 0) {
                        lastWinText += `⏰ ${daysSince} day${daysSince !== 1 ? 's' : ''} ago`;
                    } else if (hoursSince > 0) {
                        lastWinText += `⏰ ${hoursSince} hour${hoursSince !== 1 ? 's' : ''} ago`;
                    } else {
                        lastWinText += `⏰ Just now!`;
                    }

                    embed.addFields({
                        name: '🎉 Last Winner',
                        value: lastWinText,
                        inline: true
                    });
                } catch (error) {
                    console.error('Error fetching last winner:', error);
                }
            } else {
                embed.addFields({
                    name: '🎉 Last Winner',
                    value: 'No winners yet!\nBe the first!',
                    inline: true
                });
            }

            // Apply holiday theme if active
            embed = applyHolidayTheme(embed);

            // Add jackpot progress visualization
            const progressSteps = [1000, 5000, 10000, 25000, 50000, 100000];
            let progressBar = '';
            let currentLevel = 0;

            for (let i = 0; i < progressSteps.length; i++) {
                if (jackpotData.currentAmount >= progressSteps[i]) {
                    currentLevel = i + 1;
                    progressBar += '🟩';
                } else {
                    progressBar += '⬜';
                }
            }

            if (jackpotData.currentAmount < 1000) {
                progressBar = '⬜⬜⬜⬜⬜⬜ (Building up...)';
            }

            embed.addFields({
                name: '📈 Jackpot Growth',
                value: progressBar + `\n Level ${currentLevel}/6`,
                inline: false
            });

            // Tips
            embed.setFooter({
                text: 'Play Slots or Blackjack for a chance to win! Good luck! 🍀'
            });

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in jackpot command:', error);

            const errorMessage = {
                content: '❌ An error occurred while fetching the jackpot. Please try again.',
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
