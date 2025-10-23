const { EmbedBuilder } = require('discord.js');
const { ADMIN_USER_ID } = require('../config');
const { cancelGuildHeist, getAllActiveGuildHeists, cleanupExpiredGuildHeists } = require('../utils/heist');
const { getUserGuild } = require('../utils/guilds');

module.exports = {
    data: {
        name: 'clearguildheist',
        description: '[ADMIN ONLY] Clear stuck guild heists',
        options: [
            {
                name: 'action',
                description: 'What to do',
                type: 3, // STRING
                required: true,
                choices: [
                    { name: 'List - Show all active guild heists', value: 'list' },
                    { name: 'Clear All - Clear all expired heists', value: 'cleanup' },
                    { name: 'Force Clear User - Clear heist for your guild', value: 'clear' }
                ]
            },
            {
                name: 'user',
                description: 'User in the guild (for force clear)',
                type: 6, // USER
                required: false
            }
        ]
    },

    async execute(interaction) {
        try {
            // Check if user is admin
            if (interaction.user.id !== ADMIN_USER_ID) {
                return await interaction.reply({
                    content: '❌ You do not have permission to use this command!',
                    ephemeral: true
                });
            }

            const action = interaction.options.getString('action');

            if (action === 'list') {
                // List all active guild heists
                const activeHeists = getAllActiveGuildHeists();

                if (activeHeists.length === 0) {
                    return await interaction.reply({
                        content: 'ℹ️ No active guild heists found.',
                        ephemeral: true
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('🎭 Active Guild Heists')
                    .setDescription(`Found **${activeHeists.length}** active guild heist(s):`)
                    .setTimestamp();

                const now = Date.now();
                for (const heist of activeHeists) {
                    const timeLeft = heist.expiresAt - now;
                    const secondsLeft = Math.max(0, Math.floor(timeLeft / 1000));
                    const status = timeLeft > 0 ? `Expires in ${secondsLeft}s` : '⚠️ EXPIRED';

                    embed.addFields({
                        name: `Guild: ${heist.guildName}`,
                        value: `Participants: ${heist.participants.length}\nStatus: ${status}\nGuild ID: \`${heist.guildId}\``,
                        inline: false
                    });
                }

                await interaction.reply({ embeds: [embed], ephemeral: true });

            } else if (action === 'cleanup') {
                // Clean up all expired heists
                const before = getAllActiveGuildHeists().length;
                cleanupExpiredGuildHeists();
                const after = getAllActiveGuildHeists().length;
                const cleaned = before - after;

                const embed = new EmbedBuilder()
                    .setColor(cleaned > 0 ? '#00FF00' : '#FFA500')
                    .setTitle(cleaned > 0 ? '✅ Cleanup Complete' : 'ℹ️ Nothing to Clean')
                    .setDescription(cleaned > 0
                        ? `Removed **${cleaned}** expired guild heist(s).\n\nRemaining active: **${after}**`
                        : 'No expired guild heists found.')
                    .setTimestamp();

                await interaction.reply({ embeds: [embed], ephemeral: true });

            } else if (action === 'clear') {
                // Force clear a specific guild heist
                const targetUser = interaction.options.getUser('user');

                if (!targetUser) {
                    return await interaction.reply({
                        content: '❌ Please specify a user in the guild you want to clear!',
                        ephemeral: true
                    });
                }

                const guild = getUserGuild(targetUser.id);

                if (!guild) {
                    return await interaction.reply({
                        content: `❌ **${targetUser.username}** is not in a guild!`,
                        ephemeral: true
                    });
                }

                const result = cancelGuildHeist(guild.id);

                const embed = new EmbedBuilder()
                    .setColor(result.success ? '#00FF00' : '#FF0000')
                    .setTitle(result.success ? '✅ Guild Heist Cleared' : '❌ No Active Heist')
                    .setDescription(result.success
                        ? `Cleared active guild heist for **${guild.name}**.\n\nThey can now start a new heist.`
                        : `No active guild heist found for **${guild.name}**.`)
                    .setTimestamp();

                await interaction.reply({ embeds: [embed], ephemeral: true });

                // Log the admin action
                if (result.success) {
                    console.log(`Admin ${interaction.user.username} (${interaction.user.id}) cleared guild heist for guild ${guild.name} (${guild.id})`);
                }
            }

        } catch (error) {
            console.error('Error in clearguildheist command:', error);
            await interaction.reply({
                content: '❌ An error occurred while managing guild heists. Please try again.',
                ephemeral: true
            });
        }
    }
};
