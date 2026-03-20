const { getUserMoney, setUserMoney } = require('../../utils/data');
const { updateBettingDisplay, startTurnTimer } = require('./blackjackButtons');
const BlackjackGame = require('../../gameLogic/blackjackGame');

async function handleTableButtons(interaction, activeGames, client, dealCardsWithDelay) {
    const { customId, user } = interaction;

    // Extract playerId from customId for player-specific buttons
    let targetPlayerId = user.id;
    if (customId.includes('_')) {
        const parts = customId.split('_');
        targetPlayerId = parts[parts.length - 1];
    }

    const game = activeGames.get(interaction.channelId);
    if (!game) {
        console.log(`Join table failed: No game found for channel ${interaction.channelId}`);
        return interaction.reply({ content: '❌ No active table found!', ephemeral: true });
    }
    if (!game.isMultiPlayer) {
        console.log(`Join table failed: Game is not multiplayer, channel ${interaction.channelId}`);
        return interaction.reply({ content: '❌ This is not a multiplayer table!', ephemeral: true });
    }

    if (customId.startsWith('join_table')) {
        if (game.dealingPhase > 0) {
            console.log(`Join attempt failed: Game in dealing phase, dealingPhase=${game.dealingPhase}`);
            return interaction.reply({ content: '❌ Game has already started! Please wait for the next round.', ephemeral: true });
        }
        if (game.players.has(user.id)) {
            console.log(`Join attempt failed: User ${user.id} already in game`);
            return interaction.reply({ content: '❌ You’re already in the game!', ephemeral: true });
        }
        if (game.players.size >= 7) { // Assuming a max of 7 players per table
            console.log(`Join attempt failed: Table full, player count=${game.players.size}`);
            return interaction.reply({ content: '❌ The table is full (max 7 players)!', ephemeral: true });
        }
        if (activeGames.has(user.id)) {
            console.log(`Removing user ${user.id} from single-player game`);
            activeGames.delete(user.id);
        }

        console.log(`Showing join table modal for user ${user.id}`);
        const modal = new ModalBuilder()
            .setCustomId('submit_bet')
            .setTitle('Join Blackjack Table')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('bet_amount')
                        .setLabel('Enter your bet (10-500,000)')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setPlaceholder('100')
                )
            );
        await interaction.showModal(modal);
        return;
    }

    // Verify the interacting user is the target player
    if (targetPlayerId !== user.id) {
        console.log(`User ${user.id} attempted to interact with buttons for ${targetPlayerId}`);
        return interaction.reply({ content: '❌ You cannot interact with another player’s buttons!', ephemeral: true });
    }

    if (customId.startsWith('keep_bet')) {
        if (!game.bettingPhase) {
            console.log(`Keep bet failed: Not in betting phase, current phase=${game.bettingPhase}`);
            return interaction.reply({ content: '❌ No active betting phase found!', ephemeral: true });
        }
        if (!game.players.has(targetPlayerId)) {
            console.log(`Keep bet failed: Player ${targetPlayerId} not in game`);
            return interaction.reply({ content: '❌ You are not part of this game!', ephemeral: true });
        }

        const player = game.players.get(targetPlayerId);
        const currentBet = player.bet / (player.hasSplit ? 2 : 1);
        console.log(`Player ${targetPlayerId} confirming bet: ${currentBet}`);
        game.confirmBet(targetPlayerId, currentBet);

        await interaction.reply({ content: `✅ You kept your bet of ${currentBet.toLocaleString()}!`, ephemeral: true });

        if (game.allPlayersReady()) {
            console.log(`All players ready, starting new round`);
            await startNewRoundFromBetting(game, interaction, activeGames, client, dealCardsWithDelay);
        } else {
            console.log(`Updating betting display, players ready: ${game.readyPlayers.size}/${game.players.size}`);
            await updateBettingDisplay(game, interaction, client, { bettingPhaseActive: true });
        }
        return;
    }

    if (customId.startsWith('adjust_bet')) {
        if (!game.bettingPhase) {
            console.log(`Adjust bet failed: Not in betting phase, current phase=${game.bettingPhase}`);
            return interaction.reply({ content: '❌ No active betting phase found!', ephemeral: true });
        }
        if (!game.players.has(targetPlayerId)) {
            console.log(`Adjust bet failed: Player ${targetPlayerId} not in game`);
            return interaction.reply({ content: '❌ You are not part of this game!', ephemeral: true });
        }

        console.log(`Showing adjust bet modal for player ${targetPlayerId}`);
        const modal = new ModalBuilder()
            .setCustomId('submit_adjusted_bet')
            .setTitle('Adjust Your Bet')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('bet_amount')
                        .setLabel('Enter your new bet (10-500,000)')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setPlaceholder('100')
                )
            );
        await interaction.showModal(modal);
        return;
    }

    if (customId.startsWith('leave_table')) {
        if (!game.bettingPhase) {
            console.log(`Leave table failed: Not in betting phase, current phase=${game.bettingPhase}`);
            return interaction.reply({ content: '❌ No active betting phase found!', ephemeral: true });
        }
        if (!game.players.has(targetPlayerId)) {
            console.log(`Leave table failed: Player ${targetPlayerId} not in game`);
            return interaction.reply({ content: '❌ You are not part of this game!', ephemeral: true });
        }

        const player = game.players.get(targetPlayerId);
        const refund = player.bet / (player.hasSplit ? 2 : 1);
        const userMoney = await getUserMoney(targetPlayerId);
        await setUserMoney(targetPlayerId, userMoney + refund);
        game.removePlayer(targetPlayerId);

        console.log(`Player ${targetPlayerId} left table, refunded: ${refund}`);
        await interaction.reply({ content: `🚪 You left the table. ${refund.toLocaleString()} has been refunded.`, ephemeral: true });

        if (game.players.size === 0) {
            console.log(`No players remaining, closing table`);
            activeGames.delete(interaction.channelId);
            await interaction.message.edit({
                embeds: [new EmbedBuilder()
                    .setTitle('🃏 Blackjack Table')
                    .setDescription('Table closed: No players remaining.')
                    .setColor('#FF0000')],
                components: []
            });
            return;
        }

        await updateBettingDisplay(game, interaction, client, { bettingPhaseActive: true });
        return;
    }
}

module.exports = { handleTableButtons };
