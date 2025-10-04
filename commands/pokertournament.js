const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const PokerTournament = require('../gameLogic/pokerTournament');
const { getUserMoney, setUserMoney } = require('../utils/data');

module.exports = {
    data: {
        name: 'pokertournament',
        description: 'Start a Texas Hold\'em poker tournament',
        options: [
            {
                type: 4, // INTEGER
                name: 'buyin',
                description: 'Buy-in amount per player (50-500)',
                required: false
            },
            {
                type: 4, // INTEGER
                name: 'max_players',
                description: 'Maximum players (2-8)',
                required: false
            }
        ]
    },

    async execute(interaction, activeGames) {
        try {
            const buyIn = interaction.options.getInteger('buyin') || 100;
            const maxPlayers = interaction.options.getInteger('max_players') || 8;

            if (buyIn < 50 || buyIn > 500) {
                return interaction.reply({
                    content: '❌ Buy-in must be between $50 and $500!',
                    ephemeral: true
                });
            }

            if (maxPlayers < 2 || maxPlayers > 8) {
                return interaction.reply({
                    content: '❌ Max players must be between 2 and 8!',
                    ephemeral: true
                });
            }

            const channelId = interaction.channelId;

            // Check if there's already an active tournament in this channel
            if (activeGames.has(`tournament_${channelId}`)) {
                const existingTournament = activeGames.get(`tournament_${channelId}`);
                if (!existingTournament.tournamentComplete) {
                    return interaction.reply({
                        content: '❌ There is already an active poker tournament in this channel!',
                        ephemeral: true
                    });
                }
            }

            // Create new tournament
            const tournament = new PokerTournament(channelId, buyIn, maxPlayers);
            activeGames.set(`tournament_${channelId}`, tournament);

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle('♠️ Texas Hold\'em Tournament')
                .setColor('#FFD700')
                .setDescription(
                    `🎰 **Tournament Starting Soon!**\n\n` +
                    `💰 **Buy-in:** ${buyIn.toLocaleString()}\n` +
                    `🏆 **Prize Pool:** $0\n` +
                    `👥 **Players:** 0/${maxPlayers}\n` +
                    `💎 **Starting Chips:** 1,000\n\n` +
                    `**Prize Distribution:**\n` +
                    `🥇 1st Place: 50% of pool\n` +
                    `🥈 2nd Place: 30% of pool\n` +
                    `🥉 3rd Place: 20% of pool\n\n` +
                    `**Blinds:** Start at 10/20, increase every 5 hands\n\n` +
                    `Click **Register** to join!`
                )
                .setTimestamp();

            // Create buttons
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('tournament_register')
                        .setLabel('Register')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('🎫'),
                    new ButtonBuilder()
                        .setCustomId('tournament_unregister')
                        .setLabel('Unregister')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🚪'),
                    new ButtonBuilder()
                        .setCustomId('tournament_start')
                        .setLabel('Start Tournament')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('▶️')
                );

            await interaction.reply({
                embeds: [embed],
                components: [row]
            });

        } catch (error) {
            console.error('Error in pokertournament command:', error);
            await interaction.reply({
                content: '❌ An error occurred while creating the tournament. Please try again.',
                ephemeral: true
            });
        }
    }
};
