const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getUserMoney } = require('../utils/data');
const { validateBet } = require('../utils/vip');
const { checkGamblingBan, checkCooldown, setCooldown } = require('../utils/guardChecks');
const { recordGameToEvents, getEventNotifications } = require('../utils/eventIntegration');

module.exports = {
    data: {
        name: 'coinflip',
        description: 'Flip a coin - heads or tails!',
        options: [
            {
                name: 'bet',
                description: 'Amount to bet (VIP gets higher limits!)',
                type: 4,
                required: true,
                min_value: 10,
                max_value: 20000
            }
        ]
    },

    async execute(interaction) {
        try {
            // Cooldown: 3 seconds between flips
            if (checkCooldown(interaction, 'coinflip', 3000)) return;

            // Check if user is gambling banned
            if (await checkGamblingBan(interaction)) return;

            const bet = interaction.options.getInteger('bet');

            // Validate bet against VIP limits
            const betValidation = await validateBet(interaction.user.id, bet, 10, 10000);
            if (!betValidation.valid) {
                return await interaction.reply({
                    content: betValidation.message,
                    ephemeral: true
                });
            }

            const userMoney = await getUserMoney(interaction.user.id);

            if (bet > userMoney) {
                return interaction.reply({
                    content: `❌ You don't have enough money! You have ${userMoney.toLocaleString()}, but tried to bet ${bet.toLocaleString()}.`,
                    ephemeral: true
                });
            }

            // All checks passed — set cooldown
            setCooldown(interaction, 'coinflip', 3000);

            // Create selection embed
            const embed = new EmbedBuilder()
                .setTitle('🪙 Coin Flip')
                .setDescription(`**Bet:** ${bet.toLocaleString()}\n\nChoose heads or tails!`)
                .setColor('#FFD700')
                .addFields(
                    {
                        name: '👑 Heads',
                        value: 'Classic heads side',
                        inline: true
                    },
                    {
                        name: '🦅 Tails',
                        value: 'The eagle side',
                        inline: true
                    },
                    {
                        name: '💰 Payout',
                        value: '1:1 (Double your bet)',
                        inline: false
                    }
                );

            const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`coinflip_heads_${bet}`)
                        .setLabel('Heads')
                        .setEmoji('👑')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`coinflip_tails_${bet}`)
                        .setLabel('Tails')
                        .setEmoji('🦅')
                        .setStyle(ButtonStyle.Primary)
                );

            await interaction.reply({
                embeds: [embed],
                components: [buttons]
            });

        } catch (error) {
            console.error('Error in coinflip command:', error);

            const errorMessage = {
                content: '❌ An error occurred while starting coin flip. Please try again.',
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
