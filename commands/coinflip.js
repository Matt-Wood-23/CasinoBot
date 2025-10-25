const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getUserMoney } = require('../utils/data');

module.exports = {
    data: {
        name: 'coinflip',
        description: 'Flip a coin - heads or tails!',
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
