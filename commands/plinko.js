const { EmbedBuilder } = require('discord.js');
const { getUserMoney, setUserMoney, recordGameResult } = require('../utils/data');
const { isGamblingBanned, getGamblingBanTime } = require('../database/queries');
const { validateBet } = require('../utils/vip');
const PlinkoGame = require('../gameLogic/plinkoGame');

module.exports = {
    data: {
        name: 'plinko',
        description: 'Drop a ball down the Plinko board for prizes!',
        options: [
            {
                name: 'bet',
                description: 'Amount to bet (VIP gets higher limits!)',
                type: 4,
                required: true,
                min_value: 1,
                max_value: 20000
            },
            {
                name: 'risk',
                description: 'Risk level (affects multiplier distribution)',
                type: 3,
                required: false,
                choices: [
                    { name: '🟢 Low Risk (safer payouts)', value: 'low' },
                    { name: '🟡 Medium Risk (balanced)', value: 'medium' },
                    { name: '🔴 High Risk (extreme payouts)', value: 'high' }
                ]
            }
        ]
    },

    async execute(interaction) {
        try {
            const bet = interaction.options.getInteger('bet');
            const risk = interaction.options.getString('risk') || 'medium';
            const userId = interaction.user.id;

            // Validate bet against VIP limits
            const betValidation = await validateBet(userId, bet, 1, 10000);
            if (!betValidation.valid) {
                return await interaction.reply({
                    content: betValidation.message,
                    ephemeral: true
                });
            }

            // Check if user is gambling banned
            const isBanned = await isGamblingBanned(userId);
            if (isBanned) {
                const banUntil = await getGamblingBanTime(userId);
                const timeLeft = banUntil - Date.now();
                const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
                const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

                return await interaction.reply({
                    content: `🚫 You're banned from gambling after a failed heist!\nBan expires in: ${hoursLeft}h ${minutesLeft}m`,
                    ephemeral: true
                });
            }

            const userMoney = await getUserMoney(userId);

            // Check if user has enough money
            if (userMoney < bet) {
                return await interaction.reply({
                    content: `❌ You don't have enough money! You have ${userMoney.toLocaleString()}.`,
                    ephemeral: true
                });
            }

            // Deduct bet
            await setUserMoney(userId, userMoney - bet);

            // Create game
            const game = new PlinkoGame(userId, bet, risk);

            // Create initial embed
            const initialEmbed = new EmbedBuilder()
                .setTitle('💰 PLINKO 💰')
                .setColor('#0099FF')
                .setDescription(`${game.getRiskEmoji()} **Risk Level:** ${risk.toUpperCase()}\n💵 **Bet:** ${bet.toLocaleString()}\n\n🔴 Dropping ball...`)
                .addFields(
                    { name: '🎯 Current Position', value: 'Starting...', inline: true },
                    { name: '🎲 Progress', value: '0%', inline: true }
                )
                .setFooter({ text: `${interaction.user.username}'s Plinko Game` })
                .setTimestamp();

            const message = await interaction.reply({
                embeds: [initialEmbed],
                fetchReply: true
            });

            // Animate the ball dropping
            await animatePlinko(message, game, interaction.user);

            // Calculate final winnings
            const finalMoney = userMoney - bet + game.winnings;
            await setUserMoney(userId, finalMoney);

            // Record game result
            await recordGameResult(
                userId,
                'plinko',
                bet,
                game.winnings,
                game.winnings >= bet ? 'win' : 'lose'
            );

            // Create final embed
            const finalEmbed = new EmbedBuilder()
                .setTitle('💰 PLINKO - GAME OVER 💰')
                .setColor(game.getResultColor())
                .setDescription(`${game.getRiskEmoji()} **Risk Level:** ${risk.toUpperCase()}\n\n${game.getBoardState(game.getTotalSteps() - 1)}\n\n${game.getResultMessage()}`)
                .addFields(
                    { name: '💵 Bet', value: `${bet.toLocaleString()}`, inline: true },
                    { name: '🎰 Multiplier', value: `${game.multiplier}x`, inline: true },
                    { name: '💰 New Balance', value: `${finalMoney.toLocaleString()}`, inline: true }
                )
                .setFooter({ text: `${interaction.user.username}'s Plinko Game` })
                .setTimestamp();

            await message.edit({ embeds: [finalEmbed] });

        } catch (error) {
            console.error('Error in plinko command:', error);

            // Try to send error message
            const errorMessage = '❌ An error occurred while playing Plinko. Please try again.';

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ content: errorMessage, embeds: [] }).catch(() => {});
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true }).catch(() => {});
            }
        }
    }
};

async function animatePlinko(message, game, user) {
    const totalSteps = game.getTotalSteps();
    const animationDelay = 400; // milliseconds between updates

    for (let step = 0; step < totalSteps; step++) {
        const progress = Math.floor((step / (totalSteps - 1)) * 100);
        const rowText = `Row ${step}/${game.rows}`;

        const embed = new EmbedBuilder()
            .setTitle('💰 PLINKO 💰')
            .setColor('#0099FF')
            .setDescription(`${game.getRiskEmoji()} **Risk Level:** ${game.riskLevel.toUpperCase()}\n\n${game.getBoardState(step)}`)
            .addFields(
                { name: '🎯 Current Position', value: rowText, inline: true },
                { name: '🎲 Progress', value: `${progress}%`, inline: true }
            )
            .setFooter({ text: `${user.username}'s Plinko Game` })
            .setTimestamp();

        try {
            await message.edit({ embeds: [embed] });
        } catch (error) {
            console.error('Error updating plinko animation:', error);
            break;
        }

        // Wait before next update (except on last step)
        if (step < totalSteps - 1) {
            await new Promise(resolve => setTimeout(resolve, animationDelay));
        }
    }

    // Small pause before showing final result
    await new Promise(resolve => setTimeout(resolve, 800));
}
