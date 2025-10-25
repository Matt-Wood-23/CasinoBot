const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const BingoGame = require('../gameLogic/bingoGame');
const { getUserMoney, setUserMoney } = require('../utils/data');

module.exports = {
    data: {
        name: 'bingo',
        description: 'Start a Bingo hall for multiplayer bingo games',
        options: [
            {
                type: 4, // INTEGER
                name: 'entry_fee',
                description: 'Entry fee per player (10-1000)',
                required: false
            }
        ]
    },

    async execute(interaction, activeGames) {
        try {
            const entryFee = interaction.options.getInteger('entry_fee') || 50;

            if (entryFee < 10 || entryFee > 1000) {
                return interaction.reply({
                    content: '❌ Entry fee must be between $10 and $1,000!',
                    ephemeral: true
                });
            }

            const channelId = interaction.channelId;

            // Check if there's already an active bingo game in this channel
            if (activeGames.has(`bingo_${channelId}`)) {
                const existingGame = activeGames.get(`bingo_${channelId}`);
                if (!existingGame.gameComplete) {
                    return interaction.reply({
                        content: '❌ There is already an active Bingo game in this channel!',
                        ephemeral: true
                    });
                }
            }

            // Create new bingo game
            const bingoGame = new BingoGame(channelId, entryFee);
            activeGames.set(`bingo_${channelId}`, bingoGame);

            // Create embed
            const embed = new EmbedBuilder()
                .setTitle('🎱 Bingo Hall - Waiting for Players')
                .setColor('#FFD700')
                .setDescription(
                    `Welcome to the Bingo Hall!\n\n` +
                    `💰 **Entry Fee:** ${entryFee.toLocaleString()}\n` +
                    `👥 **Players:** 0/${bingoGame.maxPlayers}\n` +
                    `💵 **Prize Pool:** $0\n\n` +
                    `**Prizes:**\n` +
                    `🥇 1st Bingo: 50% of pool\n` +
                    `🥈 2nd Bingo: 30% of pool\n` +
                    `🥉 3rd Bingo: 20% of pool\n\n` +
                    `Click **Join Game** to enter!`
                )
                .setTimestamp();

            // Create buttons
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('bingo_join')
                        .setLabel('Join Game')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('🎫'),
                    new ButtonBuilder()
                        .setCustomId('bingo_leave')
                        .setLabel('Leave Game')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🚪'),
                    new ButtonBuilder()
                        .setCustomId('bingo_start')
                        .setLabel('Start Game')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('▶️')
                );

            await interaction.reply({
                embeds: [embed],
                components: [row]
            });

        } catch (error) {
            console.error('Error in bingo command:', error);

            const errorMessage = {
                content: '❌ An error occurred while creating the Bingo hall. Please try again.',
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
