const { EmbedBuilder } = require('discord.js');
const { attemptHeist, getHeistStats, HEIST_COST } = require('../utils/heist');
const { getUserMoney } = require('../utils/data');

module.exports = {
    data: {
        name: 'heist',
        description: 'Attempt a casino heist! High risk, high reward ($10,000 entry)'
    },

    async execute(interaction) {
        try {
            const userId = interaction.user.id;

            // Show initial embed
            await interaction.deferReply();

            const planningEmbed = new EmbedBuilder()
                .setColor('#808080')
                .setTitle('🎭 Casino Heist')
                .setDescription('💼 Planning the heist...\n\n🗺️ Studying the blueprints...')
                .setFooter({ text: 'Entry: $10k | Success: 30% | Cooldown: 24hrs | Fail Penalty: 8hr ban' })
                .setTimestamp();

            await interaction.editReply({ embeds: [planningEmbed] });

            // Wait for dramatic effect
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Show preparation
            const prepEmbed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('🎭 Casino Heist')
                .setDescription('👥 Assembling the crew...\n\n🔫 Loading equipment...\n\n🚗 Vehicle ready!')
                .setFooter({ text: 'Entry: $10k | Success: 30% | Cooldown: 24hrs | Fail Penalty: 8hr ban' })
                .setTimestamp();

            await interaction.editReply({ embeds: [prepEmbed] });

            // Wait again
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Show infiltration
            const infiltrateEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🎭 Casino Heist - IN PROGRESS')
                .setDescription('🚨 Infiltrating the casino...\n\n⏰ Bypassing security systems...\n\n💰 Approaching the vault...')
                .setFooter({ text: 'No turning back now!' })
                .setTimestamp();

            await interaction.editReply({ embeds: [infiltrateEmbed] });

            // Wait for final suspense
            await new Promise(resolve => setTimeout(resolve, 2500));

            // Attempt the heist
            const result = await attemptHeist(userId);

            if (!result.success) {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Heist Cancelled')
                    .setDescription(result.message)
                    .setTimestamp();

                return interaction.editReply({ embeds: [errorEmbed] });
            }

            if (result.heistSuccess) {
                // SUCCESS!
                const successEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ HEIST SUCCESSFUL!')
                    .setDescription('🎉 You pulled it off! The crew escaped with the loot!\n\n💰 **THE SCORE**')
                    .addFields(
                        {
                            name: '💸 Multiplier',
                            value: `${result.multiplier}x`,
                            inline: true
                        },
                        {
                            name: '💵 Winnings',
                            value: `$${result.winnings.toLocaleString()}`,
                            inline: true
                        },
                        {
                            name: '📊 Net Profit',
                            value: `$${result.netProfit.toLocaleString()}`,
                            inline: true
                        }
                    )
                    .setFooter({ text: 'The perfect crime!' })
                    .setTimestamp();

                const currentMoney = await getUserMoney(userId);
                successEmbed.addFields({
                    name: '💳 New Balance',
                    value: `$${currentMoney.toLocaleString()}`,
                    inline: false
                });

                await interaction.editReply({ embeds: [successEmbed] });

            } else {
                // FAILURE!
                const failureEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('🚨 HEIST FAILED!')
                    .setDescription('❌ The alarm went off! Security caught you!\n\n⚠️ **CONSEQUENCES**')
                    .addFields(
                        {
                            name: '💸 Entry Fee Lost',
                            value: `$${HEIST_COST.toLocaleString()}`,
                            inline: true
                        },
                        {
                            name: '⚖️ Fine Added',
                            value: `$${result.debtAdded.toLocaleString()}`,
                            inline: true
                        },
                        {
                            name: '📊 Total Loss',
                            value: `$${result.totalLoss.toLocaleString()}`,
                            inline: true
                        },
                        {
                            name: '🚔 Consequences',
                            value: `⏰ Next heist: 24 hours\n🚫 Gambling banned: ${result.gamblingBanHours} hours`,
                            inline: false
                        }
                    )
                    .setFooter({ text: 'Better luck next time!' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [failureEmbed] });
            }

        } catch (error) {
            console.error('Error in heist command:', error);

            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('The heist was compromised! Try again later.')
                .setTimestamp();

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};
