const { EmbedBuilder } = require('discord.js');
const { isGamblingBanned, initializeHeist } = require('../utils/heist');

module.exports = {
    data: {
        name: 'banstatus',
        description: 'Check your gambling ban status'
    },

    async execute(interaction) {
        try {
            const userId = interaction.user.id;
            const banCheck = isGamblingBanned(userId);
            const heistData = initializeHeist(userId);

            if (!heistData) {
                return await interaction.reply({
                    content: '❌ User data not found!',
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setTimestamp();

            if (banCheck.isBanned) {
                const timeLeft = heistData.gamblingBanUntil - Date.now();
                const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
                const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

                const banExpiry = new Date(heistData.gamblingBanUntil);

                embed
                    .setColor('#FF0000')
                    .setTitle('🚫 Gambling Ban Active')
                    .setDescription(`You are currently banned from gambling!\n\nThis happened because you failed a heist.`)
                    .addFields(
                        {
                            name: '⏰ Time Remaining',
                            value: `${hoursLeft}h ${minutesLeft}m`,
                            inline: true
                        },
                        {
                            name: '📅 Ban Expires',
                            value: banExpiry.toLocaleString(),
                            inline: true
                        },
                        {
                            name: '💡 What You Can Do',
                            value: 'Use `/work` to earn money while you wait!\nCheck your `/stats` to plan your comeback!',
                            inline: false
                        }
                    );

            } else {
                embed
                    .setColor('#00FF00')
                    .setTitle('✅ No Active Ban')
                    .setDescription(`You are not banned from gambling!\n\nYou can play any game or attempt heists.`);

                // Show heist cooldown if applicable
                const now = Date.now();
                if (heistData.cooldownUntil > now) {
                    const cooldownLeft = heistData.cooldownUntil - now;
                    const hoursLeft = Math.floor(cooldownLeft / (60 * 60 * 1000));
                    const minutesLeft = Math.floor((cooldownLeft % (60 * 60 * 1000)) / (60 * 1000));

                    embed.addFields({
                        name: '🎭 Heist Cooldown',
                        value: `Next heist available in: ${hoursLeft}h ${minutesLeft}m`,
                        inline: false
                    });
                } else {
                    embed.addFields({
                        name: '🎭 Heist Available',
                        value: 'You can attempt a heist right now!',
                        inline: false
                    });
                }
            }

            await interaction.reply({ embeds: [embed], ephemeral: true });

        } catch (error) {
            console.error('Error in banstatus command:', error);
            await interaction.reply({
                content: '❌ An error occurred while checking your ban status. Please try again.',
                ephemeral: true
            });
        }
    }
};
