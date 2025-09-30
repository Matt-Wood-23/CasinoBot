const { getUserMoney, setUserMoney, recordGameResult } = require('../utils/data');
const { createGameEmbed } = require('../utils/embeds');
const { createButtons } = require('../utils/buttons');
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const SlotsGame = require('../gameLogic/slotsGame');
const ThreeCardPokerGame = require('../gameLogic/threeCardPokerGame');
const BlackjackGame = require('../gameLogic/blackjackGame');
const RouletteGame = require('../gameLogic/rouletteGame');
const { startNewRoundFromBetting } = require('./modalHandler');

async function handleButtonInteraction(interaction, activeGames, client, dealCardsWithDelay, rouletteSessions) {
    const { customId, user } = interaction;

    // Handle 3 Card Poker buttons
    if (customId.startsWith('poker_')) {
        await handlePokerButtons(interaction, activeGames, customId, user.id, client);
        return;
    }

    // Handle new roulette betting interface buttons
    if (customId.startsWith('roulette_')) {
        await handleRouletteButtons(interaction, activeGames, user.id, client, rouletteSessions);
        return;
    }

    // Handle slots buttons
    if (customId === 'spin_again') {
        await handleSlotsSpinAgain(interaction, user.id, client);
        return;
    }

    // Handle blackjack buttons
    if (['hit', 'stand', 'double', 'split', 'play_again_single', 'continue_playing'].includes(customId)) {
        await handleBlackjackButtons(interaction, activeGames, client, dealCardsWithDelay);
        return;
    }

    // Handle table management buttons
    if (customId.startsWith('join_table') || customId.startsWith('keep_bet') || customId.startsWith('adjust_bet') || customId.startsWith('leave_table')) {
        await handleTableButtons(interaction, activeGames, client, dealCardsWithDelay);
        return;
    }

    // Handle disabled/info buttons
    if (['not_your_game', 'inactive', 'not_in_game'].includes(customId)) {
        await interaction.reply({
            content: '❌ This button is not available to you right now.',
            ephemeral: true
        });
        return;
    }
}

async function handlePokerButtons(interaction, activeGames, customId, userId, client) {
    const game = activeGames.get(`poker_${userId}`);
    if (!game) {
        return interaction.reply({ content: '❌ No active poker game found!', ephemeral: true });
    }

    if (customId === 'poker_play') {
        if (game.gamePhase !== 'decision') {
            console.log(`Poker game phase: ${game.gamePhase}, expected: decision`);
            return interaction.reply({ content: '❌ Not in decision phase!', ephemeral: true });
        }

        const userMoney = await getUserMoney(userId);
        if (userMoney < game.anteBet) {
            return interaction.reply({
                content: `❌ You don't have enough money for the play bet! You have ${userMoney.toLocaleString()}, need ${game.anteBet.toLocaleString()}.`,
                ephemeral: true
            });
        }

        await setUserMoney(userId, userMoney - game.anteBet);
        game.makeDecision('play');

        const winnings = game.calculateWinnings();
        console.log('Winnings total:', winnings.total);
        console.log('Winnings breakdown:', winnings.breakdown);
        console.log('Game phase:', game.gamePhase);
        const currentMoney = await getUserMoney(userId);
        await setUserMoney(userId, currentMoney + game.anteBet + game.playBet + winnings.total);

        const totalBet = game.anteBet + game.playBet + game.pairPlusBet;
        await recordGameResult(userId, 'three_card_poker', totalBet, winnings.total, winnings.total >= 0 ? 'win' : 'lose');

        await interaction.deferUpdate();
        const embed = await createGameEmbed(game, userId, client);
        const buttons = createButtons(game, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });
    } else if (customId === 'poker_fold') {
        if (game.gamePhase !== 'decision') {
            console.log(`Poker game phase: ${game.gamePhase}, expected: decision`);
            return interaction.reply({ content: '❌ Not in decision phase!', ephemeral: true });
        }

        game.makeDecision('fold');

        const winnings = game.calculateWinnings();
        const currentMoney = await getUserMoney(userId);
        await setUserMoney(userId, currentMoney + winnings.total);

        const totalBet = game.anteBet + game.pairPlusBet;
        await recordGameResult(userId, 'three_card_poker', totalBet, winnings.total, 'lose');

        await interaction.deferUpdate();
        const embed = await createGameEmbed(game, userId, client);
        const buttons = createButtons(game, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });
    } else if (customId === 'poker_play_again') {
        if (game.gamePhase !== 'complete') {
            return interaction.reply({ content: '❌ Game not complete!', ephemeral: true });
        }

        const anteBet = game.anteBet;
        const pairPlusBet = game.pairPlusBet;
        const totalBet = anteBet + pairPlusBet;
        const userMoney = await getUserMoney(userId);

        if (userMoney < totalBet) {
            return interaction.reply({
                content: `❌ You don't have enough money for another game! You have ${userMoney.toLocaleString()}, need ${totalBet.toLocaleString()}.`,
                ephemeral: true
            });
        }

        await setUserMoney(userId, userMoney - totalBet);
        const newGame = new ThreeCardPokerGame(userId, anteBet, pairPlusBet);
        activeGames.delete(`poker_${userId}`);
        activeGames.set(`poker_${userId}`, newGame);

        await interaction.deferUpdate();
        const embed = await createGameEmbed(newGame, userId, client);
        const buttons = createButtons(newGame, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });
    }
}

async function handleRouletteButtons(interaction, activeGames, userId, client, rouletteSessions) {
    const { ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
    const messageId = interaction.message.id;

    // Handle chip selection
    if (interaction.customId.startsWith('roulette_chip_')) {
        const chipValue = parseInt(interaction.customId.replace('roulette_chip_', ''));

        // Initialize or get session
        if (!rouletteSessions.has(messageId)) {
            rouletteSessions.set(messageId, {
                userId: userId,
                bets: {},
                currentChip: chipValue,
                totalBet: 0
            });
        }

        const session = rouletteSessions.get(messageId);

        // Only allow the person who started the game to interact
        if (session.userId !== userId) {
            return interaction.reply({
                content: '❌ This is not your betting session!',
                ephemeral: true
            });
        }

        session.currentChip = chipValue;

        await updateBettingInterface(interaction, session);
        return;
    }

    // Handle bet placement
    if (interaction.customId.startsWith('roulette_bet_')) {
        const betType = interaction.customId.replace('roulette_bet_', '');

        const session = rouletteSessions.get(messageId);
        if (!session || session.userId !== userId) {
            return interaction.reply({
                content: '❌ This is not your betting session!',
                ephemeral: true
            });
        }

        // Handle number betting with modal
        if (betType === 'number') {
            const modal = new ModalBuilder()
                .setCustomId('roulette_number_bet')
                .setTitle('Pick a Number')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('number_input')
                            .setLabel('Enter number (0-36 or 00)')
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                            .setPlaceholder('e.g., 7, 00, 0')
                    )
                );

            return interaction.showModal(modal);
        }

        // Add chip value to bet type
        if (!session.bets[betType]) {
            session.bets[betType] = 0;
        }
        session.bets[betType] += session.currentChip;
        session.totalBet += session.currentChip;

        await updateBettingInterface(interaction, session);
        return;
    }

    // Handle clear bets
    if (interaction.customId === 'roulette_clear_bets') {
        const session = rouletteSessions.get(messageId);
        if (!session || session.userId !== userId) {
            return interaction.reply({
                content: '❌ This is not your betting session!',
                ephemeral: true
            });
        }

        session.bets = {};
        session.totalBet = 0;

        await updateBettingInterface(interaction, session);
        return;
    }

    // Handle spin
    if (interaction.customId === 'roulette_spin') {
        const session = rouletteSessions.get(messageId);
        if (!session || session.userId !== userId) {
            return interaction.reply({
                content: '❌ This is not your betting session!',
                ephemeral: true
            });
        }

        if (session.totalBet === 0) {
            return interaction.reply({
                content: '❌ You must place at least one bet!',
                ephemeral: true
            });
        }

        const userMoney = await getUserMoney(userId);
        if (userMoney < session.totalBet) {
            return interaction.reply({
                content: `❌ You don't have enough money! You have ${userMoney.toLocaleString()}, but need ${session.totalBet.toLocaleString()}.`,
                ephemeral: true
            });
        }

        // Deduct money
        await setUserMoney(userId, userMoney - session.totalBet);

        // Create and play the game
        const rouletteGame = new RouletteGame(userId, session.bets);

        // Award winnings
        const currentMoney = await getUserMoney(userId);
        await setUserMoney(userId, currentMoney + rouletteGame.totalWinnings);

        // Record game result
        const gameResult = rouletteGame.totalWinnings > session.totalBet ? 'win' :
            rouletteGame.totalWinnings === session.totalBet ? 'push' : 'lose';
        await recordGameResult(userId, 'roulette', session.totalBet, rouletteGame.totalWinnings, gameResult, {
            winningNumber: rouletteGame.winningNumber,
            betsPlaced: Object.keys(session.bets).length
        });

        // Store game for play again functionality
        activeGames.set(`roulette_${userId}`, rouletteGame);

        // Clear session
        rouletteSessions.delete(messageId);

        // Create and send response
        await interaction.deferUpdate();
        const embed = await createGameEmbed(rouletteGame, userId, client);
        const buttons = createButtons(rouletteGame, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });
        return;
    }

    // Handle play again
    if (interaction.customId === 'roulette_play_again') {
        const game = activeGames.get(`roulette_${userId}`);
        if (!game) {
            return interaction.reply({ content: '❌ No previous roulette game found!', ephemeral: true });
        }

        const totalBet = game.getTotalBet();
        const userMoney = await getUserMoney(userId);

        if (userMoney < totalBet) {
            return interaction.reply({
                content: `❌ You don't have enough money for the same bets! You have ${userMoney.toLocaleString()}, need ${totalBet.toLocaleString()}.`,
                ephemeral: true
            });
        }

        // Deduct money
        await setUserMoney(userId, userMoney - totalBet);

        // Create new game with same bets
        const newGame = new RouletteGame(userId, game.bets);

        // Award winnings
        const currentMoney = await getUserMoney(userId);
        await setUserMoney(userId, currentMoney + newGame.totalWinnings);

        // Record game result
        const gameResult = newGame.totalWinnings > totalBet ? 'win' :
            newGame.totalWinnings === totalBet ? 'push' : 'lose';
        await recordGameResult(userId, 'roulette', totalBet, newGame.totalWinnings, gameResult, {
            winningNumber: newGame.winningNumber,
            betsPlaced: Object.keys(newGame.bets).length
        });

        // Update stored game
        activeGames.set(`roulette_${userId}`, newGame);

        // Update the message
        await interaction.deferUpdate();
        const embed = await createGameEmbed(newGame, userId, client);
        const buttons = createButtons(newGame, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });
    }
}

// Helper function to update the betting interface
async function updateBettingInterface(interaction, session) {
    const { ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
    const userMoney = await getUserMoney(session.userId);

    // Create updated embed
    let betsDisplay = '';
    for (const [betType, amount] of Object.entries(session.bets)) {
        const displayName = RouletteGame.getBetTypeDisplayName ? RouletteGame.getBetTypeDisplayName(betType) : betType;
        betsDisplay += `${displayName}: ${amount.toLocaleString()}\n`;
    }

    if (!betsDisplay) {
        betsDisplay = 'No bets placed yet';
    }

    const embed = new EmbedBuilder()
        .setTitle('🎰 American Roulette - Place Your Bets')
        .setDescription(`Select your chip value, then click betting areas below.\n\n**Current Chip:** ${session.currentChip}\n**Total Bet:** ${session.totalBet.toLocaleString()}\n**Your Balance:** ${userMoney.toLocaleString()}`)
        .setColor('#FFD700')
        .addFields(
            {
                name: '🎯 Your Bets',
                value: betsDisplay,
                inline: false
            }
        );

    // Rebuild buttons with updated chip selection
    const chip10Btn = new ButtonBuilder()
        .setCustomId('roulette_chip_10')
        .setLabel('$10')
        .setStyle(session.currentChip === 10 ? ButtonStyle.Success : ButtonStyle.Primary);
    if (session.currentChip === 10) chip10Btn.setEmoji('🪙');

    const chipRow = new ActionRowBuilder()
        .addComponents(
            chip10Btn,
            new ButtonBuilder()
                .setCustomId('roulette_chip_25')
                .setLabel('$25')
                .setStyle(session.currentChip === 25 ? ButtonStyle.Success : ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('roulette_chip_50')
                .setLabel('$50')
                .setStyle(session.currentChip === 50 ? ButtonStyle.Success : ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('roulette_chip_100')
                .setLabel('$100')
                .setStyle(session.currentChip === 100 ? ButtonStyle.Success : ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('roulette_chip_500')
                .setLabel('$500')
                .setStyle(session.currentChip === 500 ? ButtonStyle.Success : ButtonStyle.Primary)
        );

    const colorRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('roulette_bet_red')
                .setLabel('Red (2:1)')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('roulette_bet_black')
                .setLabel('Black (2:1)')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('roulette_bet_green')
                .setLabel('Green (17:1)')
                .setStyle(ButtonStyle.Success)
        );

    const evenMoneyRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('roulette_bet_odd')
                .setLabel('Odd (2:1)')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('roulette_bet_even')
                .setLabel('Even (2:1)')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('roulette_bet_low')
                .setLabel('1-18 (2:1)')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('roulette_bet_high')
                .setLabel('19-36 (2:1)')
                .setStyle(ButtonStyle.Primary)
        );

    const dozenRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('roulette_bet_1st12')
                .setLabel('1st 12 (3:1)')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('roulette_bet_2nd12')
                .setLabel('2nd 12 (3:1)')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('roulette_bet_3rd12')
                .setLabel('3rd 12 (3:1)')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('roulette_bet_number')
                .setLabel('Pick Number (35:1)')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🔢')
        );

    const actionRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('roulette_clear_bets')
                .setLabel('Clear Bets')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🗑️'),
            new ButtonBuilder()
                .setCustomId('roulette_spin')
                .setLabel('SPIN!')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🎰')
                .setDisabled(session.totalBet === 0)
        );

    await interaction.deferUpdate();
    await interaction.editReply({
        embeds: [embed],
        components: [chipRow, colorRow, evenMoneyRow, dozenRow, actionRow]
    });
}

async function handleSlotsSpinAgain(interaction, userId, client) {
    let bet = 10; // Default fallback bet

    try {
        const description = interaction.message.embeds[0].description;
        const betMatch = description.match(/Bet: (\d+)/);
        if (betMatch && betMatch[1]) {
            bet = Number(betMatch[1]);
        } else {
            console.error('Could not parse bet from embed description:', description);
        }
    } catch (error) {
        console.error('Error parsing slots bet:', error);
    }

    const userMoney = await getUserMoney(userId);

    if (userMoney < bet) {
        return interaction.reply({
            content: `❌ You don't have enough money! You have ${userMoney.toLocaleString()}.`,
            ephemeral: true
        });
    }

    await setUserMoney(userId, userMoney - bet);
    const slotsGame = new SlotsGame(userId, bet);
    await setUserMoney(userId, userMoney - bet + slotsGame.winnings);
    await recordGameResult(userId, 'slots', bet, slotsGame.winnings, slotsGame.winnings > 0 ? 'win' : 'lose');

    const embed = await createGameEmbed(slotsGame, userId, client);
    const buttons = createButtons(slotsGame, userId, client);

    await interaction.update({
        embeds: [embed],
        components: buttons ? [buttons] : []
    });
}


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

async function handleBlackjackButtons(interaction, activeGames, client, dealCardsWithDelay) {
    const { customId, user } = interaction;
    let game;
    let isMultiPlayer = false;

    // Find the game
    if (activeGames.has(user.id)) {
        game = activeGames.get(user.id);
    } else if (activeGames.has(interaction.channelId)) {
        game = activeGames.get(interaction.channelId);
        isMultiPlayer = game.isMultiPlayer;
    } else {
        return interaction.reply({ content: '❌ No active game found!', ephemeral: true });
    }

    // Handle play again buttons
    if (customId === 'play_again_single') {
        if (!game || game.isMultiPlayer || user.id !== Array.from(game.players.keys())[0]) {
            return interaction.reply({ content: '❌ No active single-player game found!', ephemeral: true });
        }

        const player = game.players.get(user.id);
        const lastBet = player.bet / (player.hasSplit ? 2 : 1);
        const userMoney = await getUserMoney(user.id);

        if (userMoney < lastBet) {
            return interaction.reply({
                content: `❌ You don't have enough money for another game with your previous bet of ${lastBet.toLocaleString()}! You have ${userMoney.toLocaleString()}.`,
                ephemeral: true
            });
        }

        await setUserMoney(user.id, userMoney - lastBet);
        const newGame = new BlackjackGame(interaction.channelId, user.id, lastBet, false);
        newGame.interactionStartTime = Date.now();
        activeGames.delete(user.id);
        activeGames.set(user.id, newGame);

        await interaction.deferUpdate();
        const message = interaction.message;

        const embed = await createGameEmbed(newGame, user.id, client);
        const buttons = createButtons(newGame, user.id, client);
        let components = [];
        if (buttons) {
            if (Array.isArray(buttons)) {
                components = buttons;
            } else {
                components = [buttons];
            }
        }

        await message.edit({
            embeds: [embed],
            components: components
        });

        await dealCardsWithDelay(interaction, message, newGame, user.id, 1000);
        return;
    }

    if (customId === 'continue_playing') {
        if (!game || !game.isMultiPlayer || !game.gameOver) {
            return interaction.reply({ content: '❌ No active or finished multi-player game found!', ephemeral: true });
        }
        if (!game.players.has(user.id)) {
            return interaction.reply({ content: '❌ You were not part of the previous game!', ephemeral: true });
        }

        game.startBettingPhase();
        await interaction.deferUpdate();
        await updateBettingDisplay(game, interaction, client, { bettingPhaseActive: true });
        return;
    }

    // Check if it's the user's turn for multiplayer
    if (isMultiPlayer && user.id !== Array.from(game.players.keys())[game.currentPlayerIndex]) {
        return interaction.reply({
            content: `❌ Its not your turn! Waiting for ${client.users.cache.get(Array.from(game.players.keys())[game.currentPlayerIndex])?.username || 'another player'}.`,
            ephemeral: true
        });
    }

    // Check if it's the user's game for single player
    if (!isMultiPlayer && user.id !== Array.from(game.players.keys())[0]) {
        return interaction.reply({ content: '❌ This is not your game!', ephemeral: true });
    }

    // Handle game actions
    if (['hit', 'stand', 'double', 'split'].includes(customId)) {
        await interaction.deferUpdate();
        let actionSuccess = false;

        if (customId === 'hit') {
            actionSuccess = game.hit(user.id);
        } else if (customId === 'stand') {
            game.stand(user.id);
            actionSuccess = true;
        } else if (customId === 'double') {
            const currentHand = game.getCurrentHand(user.id);
            if (!currentHand) {
                return interaction.followUp({ content: '❌ No active hand found!', ephemeral: true });
            }
            const userMoney = await getUserMoney(user.id);
            if (userMoney < currentHand.bet) {
                return interaction.followUp({ content: '❌ Not enough money to double!', ephemeral: true });
            }
            actionSuccess = game.double(user.id);
            if (actionSuccess) {
                await setUserMoney(user.id, userMoney - currentHand.bet);
            } else {
                return interaction.followUp({ content: '❌ Cannot double this hand!', ephemeral: true });
            }
        } else if (customId === 'split') {
            const userMoney = await getUserMoney(user.id);
            const player = game.players.get(user.id);
            if (userMoney < player.bet) {
                return interaction.followUp({ content: '❌ Not enough money to split!', ephemeral: true });
            }
            if (!game.canSplit(user.id)) {
                return interaction.followUp({ content: '❌ Cannot split these cards!', ephemeral: true });
            }
            await setUserMoney(user.id, userMoney - player.bet);
            actionSuccess = game.split(user.id);
        }

        // If dealer needs to draw cards, animate them
        if (actionSuccess && game.dealer.isDrawing) {
            await animateDealerDrawing(game, interaction, user.id, client);
        }

        // Handle game completion
        if (actionSuccess && game.gameOver) {
            if (!isMultiPlayer) {
                const winnings = game.getWinnings(user.id);
                const currentMoney = await getUserMoney(user.id);
                await setUserMoney(user.id, currentMoney + game.getTotalBet(user.id) + winnings);
                const results = game.getResult(user.id);
                const result = Array.isArray(results) ?
                    (results.includes('blackjack') ? 'blackjack' :
                        (results.includes('win') ? 'win' :
                            (results.includes('lose') ? 'lose' : 'push'))) : results;
                const bet = game.getTotalBet(user.id);
                await recordGameResult(user.id, 'blackjack', bet, winnings, result, {
                    handsPlayed: game.players.get(user.id).hands.length
                });
            } else {
                for (const [playerId] of game.players) {
                    const winnings = game.getWinnings(playerId);
                    const currentMoney = await getUserMoney(playerId);
                    await setUserMoney(playerId, currentMoney + game.getTotalBet(playerId) + winnings);
                    const results = game.getResult(playerId);
                    const result = Array.isArray(results) ?
                        (results.includes('blackjack') ? 'blackjack' :
                            (results.includes('win') ? 'win' :
                                (results.includes('lose') ? 'lose' : 'push'))) : results;
                    const bet = game.getTotalBet(playerId);
                    await recordGameResult(playerId, 'blackjack', bet, winnings, result, {
                        handsPlayed: game.players.get(playerId).hands.length
                    });
                }
            }
        }

        // Update the game display
        const embed = await createGameEmbed(game, user.id, client);
        const buttons = createButtons(game, user.id, client);
        let components = [];
        if (buttons) {
            if (Array.isArray(buttons)) {
                components = buttons;
            } else {
                components = [buttons];
            }
        }

        try {
            await interaction.message.edit({
                embeds: [embed],
                components: components
            });
        } catch (error) {
            console.error('Error updating game message:', error);
            await interaction.followUp({
                content: '⚠️ Failed to update the game message.',
                ephemeral: true
            });
        }

        // Start turn timer for multiplayer
        if (isMultiPlayer && actionSuccess && !game.gameOver) {
            startTurnTimer(game, interaction, activeGames, client, dealCardsWithDelay);
        }
    }
}

async function updateBettingDisplay(game, interaction, client, options = {}) {
    try {
        const embed = await createGameEmbed(game, interaction.user.id, client);
        const buttons = createButtons(game, interaction.user.id, client, options);
        let components = [];
        if (buttons) {
            if (Array.isArray(buttons)) {
                components = buttons;
            } else {
                components = [buttons];
            }
        }
        await interaction.message.edit({
            embeds: [embed],
            components: components
        });
    } catch (error) {
        console.error('Error updating betting display:', error);
        await interaction.followUp({
            content: '⚠️ Failed to update the game message. Your bet was adjusted, but the table may not reflect it.',
            ephemeral: true
        });
    }
}

function startTurnTimer(game, interaction, activeGames, client, dealCardsWithDelay) {
    if (!game.isMultiPlayer || game.gameOver) return;

    const currentPlayerId = Array.from(game.players.keys())[game.currentPlayerIndex];

    setTimeout(async () => {
        if (!activeGames.get(interaction.channelId) || activeGames.get(interaction.channelId) !== game) return;

        const player = game.players.get(currentPlayerId);
        if (!player || player.stood) return;

        game.stand(currentPlayerId);

        if (game.gameOver) {
            for (const [playerId] of game.players) {
                const winnings = game.getWinnings(playerId);
                const currentMoney = await getUserMoney(playerId);
                await setUserMoney(playerId, currentMoney + game.getTotalBet(playerId) + winnings);
                const results = game.getResult(playerId);
                const result = Array.isArray(results) ?
                    (results.includes('blackjack') ? 'blackjack' :
                        (results.includes('win') ? 'win' :
                            (results.includes('lose') ? 'lose' : 'push'))) : results;
                const bet = game.getTotalBet(playerId);
                await recordGameResult(playerId, 'blackjack', bet, winnings, result, {
                    handsPlayed: game.players.get(playerId).hands.length
                });
            }
        } else {
            game.checkAllPlayersDone();
        }

        try {
            const embed = await createGameEmbed(game, currentPlayerId, client);
            const buttons = createButtons(game, currentPlayerId, client);
            let components = [];
            if (buttons) {
                if (Array.isArray(buttons)) {
                    components = buttons;
                } else {
                    components = [buttons];
                }
            }

            await interaction.message.edit({
                embeds: [embed],
                components: components
            });

            if (!game.gameOver) {
                startTurnTimer(game, interaction, activeGames, client, dealCardsWithDelay);
            }
        } catch (error) {
            console.error('Error updating game message after timeout:', error);
        }
    }, 30000); // 30 seconds
}

// Animate dealer drawing cards one at a time
async function animateDealerDrawing(game, interaction, userId, client) {
    const delay = 2500; // 2.5 seconds between each dealer card

    while (game.shouldDealerContinue()) {
        // Wait before drawing next card
        await new Promise(resolve => setTimeout(resolve, delay));

        // Draw one card
        game.dealerPlay();

        // Update display
        const embed = await createGameEmbed(game, userId, client);
        const buttons = createButtons(game, userId, client);
        let components = [];
        if (buttons) {
            if (Array.isArray(buttons)) {
                components = buttons;
            } else {
                components = [buttons];
            }
        }

        try {
            await interaction.message.edit({
                embeds: [embed],
                components: components
            });
        } catch (error) {
            console.error('Error updating game message during dealer draw:', error);
            break;
        }
    }
}

module.exports = { handleButtonInteraction, handleBlackjackButtons, handleTableButtons, updateBettingDisplay, startTurnTimer, handleRouletteButtons, animateDealerDrawing };