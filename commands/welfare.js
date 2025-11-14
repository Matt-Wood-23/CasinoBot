const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserMoney, setUserMoney } = require('../database/queries');
const { recordTransaction, TransactionTypes } = require('../utils/transactions');

// Welfare cooldown: 6 hours (in milliseconds)
const WELFARE_COOLDOWN = 6 * 60 * 60 * 1000;
const WELFARE_AMOUNT = 100;

// Store last welfare claim times
const welfareClaimTimes = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('welfare')
        .setDescription('Claim emergency funds if you\'re broke (6 hour cooldown)'),

    async execute(interaction) {
        const userId = interaction.user.id;

        try {
            // Check current balance
            const currentMoney = await getUserMoney(userId);

            // Only allow welfare if user has $0 or less
            if (currentMoney > 0) {
                const embed = new EmbedBuilder()
                    .setColor(0xFF6B6B)
                    .setTitle('❌ Welfare Not Available')
                    .setDescription('You still have money! Welfare is only for players with $0.')
                    .addFields(
                        { name: 'Your Balance', value: `$${currentMoney.toLocaleString()}`, inline: true }
                    )
                    .setFooter({ text: 'Try /work or /daily to earn more money!' })
                    .setTimestamp();

                await interaction.reply({ embeds: [embed], ephemeral: true });
                return;
            }

            // Check cooldown
            const lastClaim = welfareClaimTimes.get(userId);
            const now = Date.now();

            if (lastClaim) {
                const timeSinceLastClaim = now - lastClaim;
                const timeRemaining = WELFARE_COOLDOWN - timeSinceLastClaim;

                if (timeRemaining > 0) {
                    // Still on cooldown
                    const hours = Math.floor(timeRemaining / (60 * 60 * 1000));
                    const minutes = Math.floor((timeRemaining % (60 * 60 * 1000)) / (60 * 1000));

                    const embed = new EmbedBuilder()
                        .setColor(0xFFAA00)
                        .setTitle('⏰ Welfare On Cooldown')
                        .setDescription('You\'ve recently claimed welfare. Please wait before claiming again.')
                        .addFields(
                            {
                                name: 'Time Remaining',
                                value: `${hours}h ${minutes}m`,
                                inline: true
                            }
                        )
                        .setFooter({ text: 'In the meantime, try /work or /daily!' })
                        .setTimestamp();

                    await interaction.reply({ embeds: [embed], ephemeral: true });
                    return;
                }
            }

            // Grant welfare
            const newBalance = currentMoney + WELFARE_AMOUNT;
            await setUserMoney(userId, newBalance);
            welfareClaimTimes.set(userId, now);

            // Record transaction
            await recordTransaction({
                userId: userId,
                type: TransactionTypes.WELFARE,
                amount: WELFARE_AMOUNT,
                balanceAfter: newBalance,
                description: 'Emergency welfare funds claimed'
            });

            const embed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Welfare Claimed!')
                .setDescription('You\'ve received emergency funds to help you get back on your feet.')
                .addFields(
                    { name: 'Amount Received', value: `$${WELFARE_AMOUNT.toLocaleString()}`, inline: true },
                    { name: 'New Balance', value: `$${newBalance.toLocaleString()}`, inline: true }
                )
                .addFields(
                    {
                        name: '💡 Getting Back on Track',
                        value: '• Use `/work` to earn steady income\n' +
                               '• Claim `/daily` bonus for free money\n' +
                               '• Start with small bets to build your bankroll\n' +
                               '• Check `/help economy` for money-making tips\n' +
                               '• Join a guild for extra support and bonuses',
                        inline: false
                    }
                )
                .setFooter({ text: 'Good luck! Gamble responsibly.' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in welfare command:', error);

            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ Error')
                .setDescription('An error occurred while processing your welfare claim.')
                .setFooter({ text: 'Please try again later.' })
                .setTimestamp();

            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
};
