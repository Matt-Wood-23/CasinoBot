const { EmbedBuilder } = require('discord.js');
const { openMysteryBox, getAllBoxTiers } = require('../utils/mysterybox');
const { getUserMoney } = require('../utils/data');
const { isGamblingBanned, getGamblingBanTime } = require('../database/queries');

module.exports = {
    data: {
        name: 'mysterybox',
        description: 'Open a mystery box for random rewards!',
        options: [
            {
                name: 'tier',
                description: 'The mystery box tier to open',
                type: 3, // STRING
                required: true,
                choices: [
                    { name: '📦 Basic ($5,000)', value: 'basic' },
                    { name: '💎 Premium ($15,000)', value: 'premium' },
                    { name: '⭐ Legendary ($50,000)', value: 'legendary' }
                ]
            }
        ]
    },

    async execute(interaction) {
        try {
            const userId = interaction.user.id;
            const tierId = interaction.options.getString('tier');

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

            // Show opening animation
            await interaction.deferReply();

            // Create opening embed
            const openingEmbed = new EmbedBuilder()
                .setColor('#808080')
                .setTitle('🎁 Opening Mystery Box...')
                .setDescription('✨ The box begins to glow...')
                .setTimestamp();

            await interaction.editReply({ embeds: [openingEmbed] });

            // Wait for dramatic effect
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Update with spinning animation
            const spinningEmbed = new EmbedBuilder()
                .setColor('#9B59B6')
                .setTitle('🎁 Opening Mystery Box...')
                .setDescription('🌟 Light bursts from the box!')
                .setTimestamp();

            await interaction.editReply({ embeds: [spinningEmbed] });

            // Wait again
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Open the box
            const result = await openMysteryBox(userId, tierId);

            if (!result.success) {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Failed to Open Box')
                    .setDescription(result.message)
                    .setTimestamp();

                return interaction.editReply({ embeds: [errorEmbed] });
            }

            // Show reward
            const rewardEmbed = new EmbedBuilder()
                .setColor(result.tier.color)
                .setTitle(`${result.tier.emoji} ${result.tier.name} - Opened!`)
                .setTimestamp();

            if (result.reward.type === 'money') {
                rewardEmbed.setDescription(`🎉 **Congratulations!**\n\nYou won ${result.reward.emoji} **${result.reward.description}**!`);
                rewardEmbed.addFields({
                    name: '💰 Money Reward',
                    value: `You received **$${result.reward.amount.toLocaleString()}**!`,
                    inline: false
                });
            } else {
                rewardEmbed.setDescription(`🎉 **Congratulations!**\n\nYou won ${result.reward.emoji} **${result.reward.description}**!`);
                rewardEmbed.addFields({
                    name: '🎁 Item Reward',
                    value: `**${result.reward.description}** has been added to your inventory!\nUse \`/inventory\` to see your items.`,
                    inline: false
                });
            }

            const currentMoney = await getUserMoney(userId);
            rewardEmbed.setFooter({ text: `Current Balance: $${currentMoney.toLocaleString()}` });

            await interaction.editReply({ embeds: [rewardEmbed] });

        } catch (error) {
            console.error('Error in mysterybox command:', error);

            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('An error occurred while opening the mystery box. Please try again.')
                .setTimestamp();

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};
