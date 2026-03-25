const { EmbedBuilder } = require('discord.js');

async function handleGuildHeistJoin(interaction, userId) {
    const { joinGuildHeist, getActiveGuildHeist } = require('../../utils/heist');

    try {
        const guildId = interaction.customId.replace('guildheist_join_', '');

        const result = await joinGuildHeist(guildId, userId);

        if (!result.success) {
            return interaction.reply({
                content: `❌ ${result.message}`,
                ephemeral: true
            });
        }

        // Update the message to show new participant count
        const heist = getActiveGuildHeist(guildId);

        if (heist) {
            const originalEmbed = interaction.message.embeds[0];
            const updatedEmbed = new EmbedBuilder(originalEmbed.data)
                .setDescription(originalEmbed.description.replace(
                    /\*\*Current Participants:\*\* \d+/,
                    `**Current Participants:** ${heist.participants.length}`
                ));

            await interaction.message.edit({ embeds: [updatedEmbed] });
        }

        await interaction.reply({
            content: `✅ You've joined the guild heist! **${result.participantCount}** members are now participating.`,
            ephemeral: true
        });

    } catch (error) {
        console.error('Error handling guild heist join:', error);
        await interaction.reply({
            content: '❌ An error occurred while joining the heist. Please try again.',
            ephemeral: true
        });
    }
}

module.exports = { handleGuildHeistJoin };
