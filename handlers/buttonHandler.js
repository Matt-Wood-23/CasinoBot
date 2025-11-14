const { getUserMoney, setUserMoney, recordGameResult } = require('../utils/data');
const { createGameEmbed, sendPlayerCardsDM } = require('../utils/embeds');
const { createButtons } = require('../utils/buttons');
const { applyHolidayWinningsBonus } = require('../utils/holidayEvents');
const { getServerJackpot, resetJackpot } = require('../database/queries');
const { isNaturalBlackjack } = require('../utils/cardHelpers');
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { awardGameXP, awardWagerXP } = require('../utils/guildXP');
const SlotsGame = require('../gameLogic/slotsGame');
const ThreeCardPokerGame = require('../gameLogic/threeCardPokerGame');
const BlackjackGame = require('../gameLogic/blackjackGame');
const RouletteGame = require('../gameLogic/rouletteGame');
const CrapsGame = require('../gameLogic/crapsGame');
const WarGame = require('../gameLogic/warGame');
const CoinFlipGame = require('../gameLogic/coinFlipGame');
const HorseRacingGame = require('../gameLogic/horseRacingGame');
const CrashGame = require('../gameLogic/crashGame');
const BingoGame = require('../gameLogic/bingoGame');
const PokerTournament = require('../gameLogic/pokerTournament');
const HiLoGame = require('../gameLogic/hiLoGame');
const { startNewRoundFromBetting } = require('./modalHandler');
const { recordGameToEvents, getEventNotifications } = require('../utils/eventIntegration');

// Helper functions moved to utils/cardHelpers.js

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

    // Handle craps buttons
    if (customId.startsWith('craps_')) {
        await handleCrapsButtons(interaction, activeGames, user.id, client);
        return;
    }

    // Handle war buttons
    if (customId.startsWith('war_')) {
        await handleWarButtons(interaction, activeGames, user.id, client);
        return;
    }

    // Handle coin flip buttons
    if (customId.startsWith('coinflip_')) {
        await handleCoinFlipButtons(interaction, activeGames, user.id, client);
        return;
    }

    // Handle horse racing buttons
    if (customId.startsWith('race_')) {
        await handleHorseRaceButtons(interaction, activeGames, user.id, client);
        return;
    }

    // Handle crash buttons
    if (customId.startsWith('crash_')) {
        await handleCrashButtons(interaction, activeGames, user.id, client);
        return;
    }

    // Handle bingo buttons
    if (customId.startsWith('bingo_')) {
        await handleBingoButtons(interaction, activeGames, user.id, client);
        return;
    }

    // Handle tournament buttons
    if (customId.startsWith('tournament_')) {
        await handleTournamentButtons(interaction, activeGames, user.id, client);
        return;
    }

    // Handle hi-lo buttons
    if (customId.startsWith('hilo_')) {
        await handleHiLoButtons(interaction, activeGames, user.id, client);
        return;
    }

    // Handle challenge reward claims
    if (customId === 'claim_challenge_rewards') {
        await handleClaimChallengeRewards(interaction, user.id);
        return;
    }

    // Handle shop purchase buttons
    if (customId.startsWith('shop_buy_')) {
        await handleShopPurchase(interaction, user.id);
        return;
    }

    // Handle property purchase buttons
    if (customId.startsWith('property_buy_')) {
        await handlePropertyPurchase(interaction, user.id);
        return;
    }

    // Handle inventory use buttons
    if (customId.startsWith('use_item_')) {
        await handleUseItem(interaction, user.id);
        return;
    }

    // Handle VIP purchase buttons
    if (customId.startsWith('vip_buy_')) {
        await handleVIPPurchase(interaction, user.id);
        return;
    }

    // Handle guild heist join buttons
    if (customId.startsWith('guildheist_join_')) {
        await handleGuildHeistJoin(interaction, user.id);
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

    // Verify this is the correct user's game
    if (game.userId !== userId) {
        return interaction.reply({ content: '❌ This is not your game!', ephemeral: true });
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

        const baseWinnings = game.calculateWinnings();
        const adjustedWinnings = applyHolidayWinningsBonus(baseWinnings.total);
        console.log('Winnings total:', baseWinnings.total);
        console.log('Winnings breakdown:', baseWinnings.breakdown);
        console.log('Game phase:', game.gamePhase);
        const currentMoney = await getUserMoney(userId);
        await setUserMoney(userId, currentMoney + game.anteBet + game.playBet + adjustedWinnings);

        const totalBet = game.anteBet + game.playBet + game.pairPlusBet;
        await recordGameResult(userId, 'three_card_poker', totalBet, adjustedWinnings, adjustedWinnings >= 0 ? 'win' : 'lose');

        // Award guild XP (async, don't wait)
        awardWagerXP(userId, totalBet, 'Three Card Poker').catch(err =>
            console.error('Error awarding wager XP:', err)
        );
        const won = adjustedWinnings >= 0;
        awardGameXP(userId, 'Three Card Poker', won).catch(err =>
            console.error('Error awarding game XP:', err)
        );

        // Record to active guild events (async, don't wait)
        recordGameToEvents(userId, 'Three Card Poker', totalBet, adjustedWinnings > 0 ? adjustedWinnings : 0).catch(err =>
            console.error('Error recording game to events:', err)
        );

        await interaction.deferUpdate();
        const embed = await createGameEmbed(game, userId, client);
        const buttons = await createButtons(game, userId, client);

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

        const baseWinnings = game.calculateWinnings();
        const adjustedWinnings = applyHolidayWinningsBonus(baseWinnings.total);
        const currentMoney = await getUserMoney(userId);
        await setUserMoney(userId, currentMoney + adjustedWinnings);

        const totalBet = game.anteBet + game.pairPlusBet;
        await recordGameResult(userId, 'three_card_poker', totalBet, adjustedWinnings, 'lose');

        // Award guild XP (async, don't wait)
        awardWagerXP(userId, totalBet, 'Three Card Poker').catch(err =>
            console.error('Error awarding wager XP:', err)
        );
        awardGameXP(userId, 'Three Card Poker', false).catch(err =>
            console.error('Error awarding game XP:', err)
        );

        // Record to active guild events (async, don't wait)
        recordGameToEvents(userId, 'Three Card Poker', totalBet, adjustedWinnings > 0 ? adjustedWinnings : 0).catch(err =>
            console.error('Error recording game to events:', err)
        );

        await interaction.deferUpdate();
        const embed = await createGameEmbed(game, userId, client);
        const buttons = await createButtons(game, userId, client);

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
        const buttons = await createButtons(newGame, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });
    }
}

async function handleRouletteButtons(interaction, activeGames, userId, client, rouletteSessions) {
    const { ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
    const messageId = interaction.message.id;

    // Check if the message was created by this user
    if (interaction.message.interaction && interaction.message.interaction.user.id !== userId) {
        return interaction.reply({
            content: '❌ This is not your game!',
            ephemeral: true
        });
    }

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

        // Award winnings with holiday bonus applied to profit
        const baseProfit = rouletteGame.totalWinnings - session.totalBet;
        const adjustedProfit = applyHolidayWinningsBonus(baseProfit);
        const adjustedTotalWinnings = session.totalBet + adjustedProfit;
        const currentMoney = await getUserMoney(userId);
        await setUserMoney(userId, currentMoney + adjustedTotalWinnings);

        // Record game result
        const gameResult = adjustedTotalWinnings > session.totalBet ? 'win' :
            adjustedTotalWinnings === session.totalBet ? 'push' : 'lose';
        await recordGameResult(userId, 'roulette', session.totalBet, adjustedTotalWinnings, gameResult, {
            winningNumber: rouletteGame.winningNumber,
            betsPlaced: Object.keys(session.bets).length
        });

        // Award guild XP (async, don't wait)
        awardWagerXP(userId, session.totalBet, 'Roulette').catch(err =>
            console.error('Error awarding wager XP:', err)
        );
        const won = gameResult === 'win';
        awardGameXP(userId, 'Roulette', won).catch(err =>
            console.error('Error awarding game XP:', err)
        );

        // Record to active guild events (async, don't wait)
        const winningsAmount = gameResult === 'win' ? adjustedTotalWinnings - session.totalBet : 0;
        recordGameToEvents(userId, 'Roulette', session.totalBet, winningsAmount).catch(err =>
            console.error('Error recording game to events:', err)
        );

        // Store game for play again functionality
        activeGames.set(`roulette_${userId}`, rouletteGame);

        // Clear session
        rouletteSessions.delete(messageId);

        // Create and send response
        await interaction.deferUpdate();
        const embed = await createGameEmbed(rouletteGame, userId, client);
        const buttons = await createButtons(rouletteGame, userId, client);
        
        // Add event notifications to embed
            if (eventResults) {
                const notifications = getEventNotifications(eventResults);
                if (notifications.length > 0) {
                    embed.addFields({
                        name: '🎉 Guild Event Progress',
                        value: notifications.join('\n'),
                        inline: false
                    });
                }
            }

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

        // Award winnings with holiday bonus applied to profit
        const baseProfit = newGame.totalWinnings - totalBet;
        const adjustedProfit = applyHolidayWinningsBonus(baseProfit);
        const adjustedTotalWinnings = totalBet + adjustedProfit;
        const currentMoney = await getUserMoney(userId);
        await setUserMoney(userId, currentMoney + adjustedTotalWinnings);

        // Record game result
        const gameResult = adjustedTotalWinnings > totalBet ? 'win' :
            adjustedTotalWinnings === totalBet ? 'push' : 'lose';
        await recordGameResult(userId, 'roulette', totalBet, adjustedTotalWinnings, gameResult, {
            winningNumber: newGame.winningNumber,
            betsPlaced: Object.keys(newGame.bets).length
        });

        // Award guild XP (async, don't wait)
        awardWagerXP(userId, totalBet, 'Roulette').catch(err =>
            console.error('Error awarding wager XP:', err)
        );
        const won = gameResult === 'win';
        awardGameXP(userId, 'Roulette', won).catch(err =>
            console.error('Error awarding game XP:', err)
        );

        // Record to active guild events (async, don't wait)
        const winningsAmount = gameResult === 'win' ? adjustedTotalWinnings - totalBet : 0;
        recordGameToEvents(userId, 'Roulette', totalBet, winningsAmount).catch(err =>
            console.error('Error recording game to events:', err)
        );

        // Update stored game
        activeGames.set(`roulette_${userId}`, newGame);

        // Update the message
        await interaction.deferUpdate();
        const embed = await createGameEmbed(newGame, userId, client);
        const buttons = await createButtons(newGame, userId, client);

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
    // Check if the message was created by this user (interaction.user must match original command user)
    if (interaction.message.interaction && interaction.message.interaction.user.id !== userId) {
        return interaction.reply({
            content: '❌ This is not your game!',
            ephemeral: true
        });
    }

    let bet = 10; // Default fallback bet

    try {
        const embed = interaction.message.embeds[0];
        const description = embed.description;

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
    const adjustedWinnings = applyHolidayWinningsBonus(slotsGame.winnings);
    await setUserMoney(userId, userMoney - bet + adjustedWinnings);
    await recordGameResult(userId, 'slots', bet, adjustedWinnings, adjustedWinnings > 0 ? 'win' : 'lose');

    // Award guild XP (async, don't wait)
    awardWagerXP(userId, bet, 'Slots').catch(err =>
        console.error('Error awarding wager XP:', err)
    );
    const won = adjustedWinnings > 0;
    awardGameXP(userId, 'Slots', won).catch(err =>
        console.error('Error awarding game XP:', err)
    );

    // Record to active guild events (async, don't wait)
    recordGameToEvents(userId, 'Slots', bet, adjustedWinnings > 0 ? adjustedWinnings : 0).catch(err =>
        console.error('Error recording game to events:', err)
    );

    const embed = await createGameEmbed(slotsGame, userId, client);
    const buttons = await createButtons(slotsGame, userId, client);

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
            const originalBet = currentHand.bet; // Save original bet before doubling
            const userMoney = await getUserMoney(user.id);
            if (userMoney < originalBet) {
                return interaction.followUp({ content: '❌ Not enough money to double!', ephemeral: true });
            }
            actionSuccess = game.double(user.id); // This doubles the bet internally
            if (actionSuccess) {
                // Only deduct the ADDITIONAL bet amount, not the full doubled amount
                await setUserMoney(user.id, userMoney - originalBet);
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
                const baseWinnings = game.getWinnings(user.id);
                const winnings = applyHolidayWinningsBonus(baseWinnings);
                const currentMoney = await getUserMoney(user.id);
                const totalBet = game.getTotalBet(user.id);
                const newMoney = currentMoney + totalBet + winnings;

                let loanInfo = await setUserMoney(user.id, newMoney);
                const results = game.getResult(user.id);
                const result = Array.isArray(results) ?
                    (results.includes('blackjack') ? 'blackjack' :
                        (results.includes('win') ? 'win' :
                            (results.includes('lose') ? 'lose' : 'push'))) : results;

                // Award progressive jackpot on natural blackjack
                // Check if player has natural blackjack regardless of result (even if push)
                let jackpotWon = 0;
                const player = game.players.get(user.id);
                const hasNaturalBJ = player.hands.some(hand => isNaturalBlackjack(hand));

                if (hasNaturalBJ && game.serverId) {
                    try {
                        const jackpotData = await getServerJackpot(game.serverId);
                        if (jackpotData && jackpotData.currentAmount > 0) {
                            jackpotWon = jackpotData.currentAmount;
                            const jackpotLoanInfo = await setUserMoney(user.id, newMoney + jackpotWon);
                            // Update loan info if jackpot was awarded
                            if (jackpotLoanInfo) {
                                loanInfo = jackpotLoanInfo;
                            }
                            await resetJackpot(game.serverId, user.id, jackpotWon);
                            // Store jackpot info for embed display
                            game.jackpotWinner = user.id;
                            game.jackpotAmount = jackpotWon;
                        }
                    } catch (error) {
                        console.error('Error awarding blackjack jackpot:', error);
                    }
                }

                // Store loan deduction info for display
                if (loanInfo) {
                    game.loanDeduction = loanInfo;
                }

                const bet = game.getTotalBet(user.id);
                await recordGameResult(user.id, 'blackjack', bet, winnings, result, {
                    handsPlayed: game.players.get(user.id).hands.length,
                    jackpotWon: jackpotWon
                });

                // Award guild XP (async, don't wait)
                awardWagerXP(user.id, bet, 'Blackjack').catch(err =>
                    console.error('Error awarding wager XP:', err)
                );
                const won = result === 'win' || result === 'blackjack';
                awardGameXP(user.id, 'Blackjack', won).catch(err =>
                    console.error('Error awarding game XP:', err)
                );

                // Record to active guild events (async, don't wait)
                recordGameToEvents(user.id, 'Blackjack', bet, winnings > 0 ? winnings : 0).catch(err =>
                    console.error('Error recording game to events:', err)
                );
            } else {
                let jackpotAwarded = false; // Track if jackpot was already awarded in this game
                game.loanDeductions = game.loanDeductions || new Map(); // Store loan deductions per player

                for (const [playerId] of game.players) {
                    const baseWinnings = game.getWinnings(playerId);
                    const winnings = applyHolidayWinningsBonus(baseWinnings);
                    const currentMoney = await getUserMoney(playerId);
                    const totalBet = game.getTotalBet(playerId);
                    const newMoney = currentMoney + totalBet + winnings;

                    const loanInfo = await setUserMoney(playerId, newMoney);
                    const results = game.getResult(playerId);
                    const result = Array.isArray(results) ?
                        (results.includes('blackjack') ? 'blackjack' :
                            (results.includes('win') ? 'win' :
                                (results.includes('lose') ? 'lose' : 'push'))) : results;

                    // Award progressive jackpot on natural blackjack (only once per game)
                    // Check if player has natural blackjack regardless of result (even if push)
                    let jackpotWon = 0;
                    const player = game.players.get(playerId);
                    const hasNaturalBJ = player.hands.some(hand => isNaturalBlackjack(hand));

                    if (hasNaturalBJ && game.serverId && !jackpotAwarded) {
                        try {
                            const jackpotData = await getServerJackpot(game.serverId);
                            if (jackpotData && jackpotData.currentAmount > 0) {
                                jackpotWon = jackpotData.currentAmount;
                                const jackpotLoanInfo = await setUserMoney(playerId, newMoney + jackpotWon);
                                // Update loan info to include jackpot
                                if (jackpotLoanInfo) {
                                    game.loanDeductions.set(playerId, jackpotLoanInfo);
                                }
                                await resetJackpot(game.serverId, playerId, jackpotWon);
                                jackpotAwarded = true;
                                // Store jackpot info for embed display
                                game.jackpotWinner = playerId;
                                game.jackpotAmount = jackpotWon;
                            }
                        } catch (error) {
                            console.error('Error awarding blackjack jackpot:', error);
                        }
                    } else if (loanInfo) {
                        // Store loan info for non-jackpot winners
                        game.loanDeductions.set(playerId, loanInfo);
                    }

                    const bet = game.getTotalBet(playerId);
                    await recordGameResult(playerId, 'blackjack', bet, winnings, result, {
                        handsPlayed: game.players.get(playerId).hands.length,
                        jackpotWon: jackpotWon
                    });

                    // Award guild XP (async, don't wait)
                    awardWagerXP(playerId, bet, 'Blackjack').catch(err =>
                        console.error('Error awarding wager XP:', err)
                    );
                    const won = result === 'win' || result === 'blackjack';
                    awardGameXP(playerId, 'Blackjack', won).catch(err =>
                        console.error('Error awarding game XP:', err)
                    );

                    // Record to active guild events (async, don't wait)
                    recordGameToEvents(playerId, 'Blackjack', bet, winnings > 0 ? winnings : 0).catch(err =>
                        console.error('Error recording game to events:', err)
                    );
                }
            }
        }

        // Update the game display
        const embed = await createGameEmbed(game, user.id, client);
        const buttons = await createButtons(game, user.id, client);
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
        const buttons = await createButtons(game, interaction.user.id, client, options);
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
            let jackpotAwarded = false; // Track if jackpot was already awarded in this game
            game.loanDeductions = game.loanDeductions || new Map(); // Store loan deductions per player

            for (const [playerId] of game.players) {
                const baseWinnings = game.getWinnings(playerId);
                const winnings = applyHolidayWinningsBonus(baseWinnings);
                const currentMoney = await getUserMoney(playerId);
                const totalBet = game.getTotalBet(playerId);
                const newMoney = currentMoney + totalBet + winnings;
                const loanInfo = await setUserMoney(playerId, newMoney);
                const results = game.getResult(playerId);
                const result = Array.isArray(results) ?
                    (results.includes('blackjack') ? 'blackjack' :
                        (results.includes('win') ? 'win' :
                            (results.includes('lose') ? 'lose' : 'push'))) : results;

                // Award progressive jackpot on natural blackjack (only once per game)
                // Check if player has natural blackjack regardless of result (even if push)
                let jackpotWon = 0;
                const player = game.players.get(playerId);
                const hasNaturalBJ = player.hands.some(hand => isNaturalBlackjack(hand));

                if (hasNaturalBJ && game.serverId && !jackpotAwarded) {
                    try {
                        const jackpotData = await getServerJackpot(game.serverId);
                        if (jackpotData && jackpotData.currentAmount > 0) {
                            jackpotWon = jackpotData.currentAmount;
                            const jackpotLoanInfo = await setUserMoney(playerId, newMoney + jackpotWon);
                            // Update loan info to include jackpot
                            if (jackpotLoanInfo) {
                                game.loanDeductions.set(playerId, jackpotLoanInfo);
                            }
                            await resetJackpot(game.serverId, playerId, jackpotWon);
                            jackpotAwarded = true;
                            // Store jackpot info for embed display
                            game.jackpotWinner = playerId;
                            game.jackpotAmount = jackpotWon;
                        }
                    } catch (error) {
                        console.error('Error awarding blackjack jackpot:', error);
                    }
                } else if (loanInfo) {
                    // Store loan info for non-jackpot winners
                    game.loanDeductions.set(playerId, loanInfo);
                }

                const bet = game.getTotalBet(playerId);
                await recordGameResult(playerId, 'blackjack', bet, winnings, result, {
                    handsPlayed: game.players.get(playerId).hands.length,
                    jackpotWon: jackpotWon
                });

                // Award guild XP (async, don't wait)
                awardWagerXP(playerId, bet, 'Blackjack').catch(err =>
                    console.error('Error awarding wager XP:', err)
                );
                const won = result === 'win' || result === 'blackjack';
                awardGameXP(playerId, 'Blackjack', won).catch(err =>
                    console.error('Error awarding game XP:', err)
                );

                // Record to active guild events (async, don't wait)
                recordGameToEvents(playerId, 'Blackjack', bet, winnings > 0 ? winnings : 0).catch(err =>
                    console.error('Error recording game to events:', err)
                );
            }
        } else {
            game.checkAllPlayersDone();
        }

        try {
            const embed = await createGameEmbed(game, currentPlayerId, client);
            const buttons = await createButtons(game, currentPlayerId, client);
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
    const delay = 1000; // 1 second between each dealer card
    const currentGameId = game.gameId; // Store gameId to detect if game is replaced

    while (game.shouldDealerContinue()) {
        // Check if game was replaced during animation
        if (game.gameId !== currentGameId) {
            console.log(`Game ${currentGameId} was replaced during dealer animation, stopping`);
            return;
        }

        // Wait before drawing next card
        await new Promise(resolve => setTimeout(resolve, delay));

        // Check again after delay in case game was replaced while waiting
        if (game.gameId !== currentGameId) {
            console.log(`Game ${currentGameId} was replaced during dealer animation, stopping`);
            return;
        }

        // Draw one card
        game.dealerPlay();

        // Update display
        const embed = await createGameEmbed(game, userId, client);
        const buttons = await createButtons(game, userId, client);
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

    // Check if game was replaced before final update
    if (game.gameId !== currentGameId) {
        console.log(`Game ${currentGameId} was replaced during dealer animation, stopping`);
        return;
    }

    // Final update after dealer is done to show game over buttons
    if (game.gameOver) {
        const embed = await createGameEmbed(game, userId, client);
        const buttons = await createButtons(game, userId, client);
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
            console.error('Error updating game message after dealer finishes:', error);
        }
    }
}

async function handleCrapsButtons(interaction, activeGames, userId, client) {
    const game = activeGames.get(`craps_${userId}`);
    if (!game) {
        return interaction.reply({ content: '❌ No active craps game found!', ephemeral: true });
    }

    // Verify this is the correct user's game
    if (game.userId !== userId) {
        return interaction.reply({ content: '❌ This is not your game!', ephemeral: true });
    }

    if (interaction.customId === 'craps_roll') {
        // Roll the dice
        game.play();

        const totalBet = game.getTotalBet();
        const baseProfit = game.totalWinnings - totalBet;
        const adjustedProfit = applyHolidayWinningsBonus(baseProfit);
        const adjustedWinnings = totalBet + adjustedProfit;
        const currentMoney = await getUserMoney(userId);
        await setUserMoney(userId, currentMoney + adjustedWinnings);

        const gameResult = adjustedWinnings > totalBet ? 'win' : (adjustedWinnings === totalBet ? 'push' : 'lose');

        if (game.gameComplete) {
            await recordGameResult(userId, 'craps', totalBet, adjustedProfit, gameResult, {
                point: game.point,
                rolls: game.rollHistory.length
            });

            // Award guild XP (async, don't wait)
            awardWagerXP(userId, totalBet, 'Craps').catch(err =>
                console.error('Error awarding wager XP:', err)
            );
            const won = gameResult === 'win';
            awardGameXP(userId, 'Craps', won).catch(err =>
                console.error('Error awarding game XP:', err)
            );

            // Record to active guild events (async, don't wait)
            recordGameToEvents(userId, 'Craps', totalBet, adjustedProfit > 0 ? adjustedProfit : 0).catch(err =>
                console.error('Error recording game to events:', err)
            );
        }

        await interaction.deferUpdate();
        const embed = await createGameEmbed(game, userId, client);
        const buttons = await createButtons(game, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });
    } else if (interaction.customId === 'craps_play_again') {
        const totalBet = game.getTotalBet();
        const userMoney = await getUserMoney(userId);

        if (userMoney < totalBet) {
            return interaction.reply({
                content: `❌ You don't have enough money for the same bets! You have ${userMoney.toLocaleString()}, need ${totalBet.toLocaleString()}.`,
                ephemeral: true
            });
        }

        // Deduct money and create new game
        await setUserMoney(userId, userMoney - totalBet);
        const newGame = new CrapsGame(userId, game.passLineBet, game.dontPassBet, game.fieldBet, game.comeBet);
        activeGames.set(`craps_${userId}`, newGame);

        await interaction.deferUpdate();
        const embed = await createGameEmbed(newGame, userId, client);
        const buttons = await createButtons(newGame, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });
    }
}

async function handleWarButtons(interaction, activeGames, userId, client) {
    const game = activeGames.get(`war_${userId}`);
    if (!game) {
        return interaction.reply({ content: '❌ No active war game found!', ephemeral: true });
    }

    // Verify this is the correct user's game
    if (game.userId !== userId) {
        return interaction.reply({ content: '❌ This is not your game!', ephemeral: true });
    }

    if (interaction.customId === 'war_surrender') {
        // Surrender - get half bet back
        game.surrender();

        // Apply holiday bonus (surrender gives back half bet, so profit is negative)
        const baseProfit = game.getProfit();
        const adjustedProfit = applyHolidayWinningsBonus(baseProfit);
        const adjustedWinnings = game.bet + adjustedProfit;

        const currentMoney = await getUserMoney(userId);
        await setUserMoney(userId, currentMoney + adjustedWinnings);

        await recordGameResult(userId, 'war', game.bet, adjustedProfit, 'surrender');

        // Award guild XP (async, don't wait)
        awardWagerXP(userId, game.bet, 'War').catch(err =>
            console.error('Error awarding wager XP:', err)
        );
        awardGameXP(userId, 'War', false).catch(err =>
            console.error('Error awarding game XP:', err)
        );

        // Record to active guild events (async, don't wait)
        recordGameToEvents(userId, 'War', game.bet, 0).catch(err =>
            console.error('Error recording game to events:', err)
        );

        await interaction.deferUpdate();
        const embed = await createGameEmbed(game, userId, client);
        const buttons = await createButtons(game, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });
    } else if (interaction.customId === 'war_go_to_war') {
        // Check if user has enough for war bet
        const currentMoney = await getUserMoney(userId);
        if (currentMoney < game.bet) {
            return interaction.reply({
                content: `❌ You don't have enough money to go to war! You need ${game.bet.toLocaleString()}, you have ${currentMoney.toLocaleString()}.`,
                ephemeral: true
            });
        }

        // Deduct war bet
        await setUserMoney(userId, currentMoney - game.bet);

        // Go to war
        game.goToWar();

        // Apply holiday bonus to profit
        const baseProfit = game.getProfit();
        const adjustedProfit = applyHolidayWinningsBonus(baseProfit);
        const adjustedWinnings = game.getTotalBet() + adjustedProfit;

        // Award winnings if any
        if (adjustedWinnings > 0) {
            const newMoney = await getUserMoney(userId);
            await setUserMoney(userId, newMoney + adjustedWinnings);
        }

        const gameResult = game.result.includes('win') ? 'win' : 'lose';
        await recordGameResult(userId, 'war', game.getTotalBet(), adjustedProfit, gameResult);

        // Award guild XP (async, don't wait)
        awardWagerXP(userId, game.getTotalBet(), 'War').catch(err =>
            console.error('Error awarding wager XP:', err)
        );
        const won = gameResult === 'win';
        awardGameXP(userId, 'War', won).catch(err =>
            console.error('Error awarding game XP:', err)
        );

        // Record to active guild events (async, don't wait)
        recordGameToEvents(userId, 'War', game.getTotalBet(), adjustedProfit > 0 ? adjustedProfit : 0).catch(err =>
            console.error('Error recording game to events:', err)
        );

        await interaction.deferUpdate();
        const embed = await createGameEmbed(game, userId, client);
        const buttons = await createButtons(game, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });
    } else if (interaction.customId === 'war_play_again') {
        const bet = game.bet;
        const userMoney = await getUserMoney(userId);

        if (userMoney < bet) {
            return interaction.reply({
                content: `❌ You don't have enough money for another game! You have ${userMoney.toLocaleString()}, need ${bet.toLocaleString()}.`,
                ephemeral: true
            });
        }

        // Deduct bet and create new game
        await setUserMoney(userId, userMoney - bet);
        const newGame = new WarGame(userId, bet);
        activeGames.set(`war_${userId}`, newGame);

        await interaction.deferUpdate();
        const embed = await createGameEmbed(newGame, userId, client);
        const buttons = await createButtons(newGame, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });
    }
}

async function handleCoinFlipButtons(interaction, activeGames, userId, client) {
    // Check if this is the user's game
    if (interaction.message.interaction && interaction.message.interaction.user.id !== userId) {
        return interaction.reply({
            content: '❌ This is not your game!',
            ephemeral: true
        });
    }

    // Handle play again
    if (interaction.customId.startsWith('coinflip_play_again_')) {
        const game = activeGames.get(`coinflip_${userId}`);
        if (!game) {
            return interaction.reply({ content: '❌ No previous coin flip found!', ephemeral: true });
        }

        const bet = game.bet;
        const userMoney = await getUserMoney(userId);

        if (userMoney < bet) {
            return interaction.reply({
                content: `❌ You don't have enough money for another flip! You have ${userMoney.toLocaleString()}, need ${bet.toLocaleString()}.`,
                ephemeral: true
            });
        }

        // Deduct bet and create new game with same choice
        await setUserMoney(userId, userMoney - bet);
        const newGame = new CoinFlipGame(userId, bet, game.choice);

        // Apply holiday bonus to profit
        const baseProfit = newGame.winnings - bet;
        const adjustedProfit = applyHolidayWinningsBonus(baseProfit);
        const adjustedWinnings = bet + adjustedProfit;

        // Award winnings
        if (adjustedWinnings > 0) {
            const currentMoney = await getUserMoney(userId);
            await setUserMoney(userId, currentMoney + adjustedWinnings);
        }

        // Record result
        const gameResult = newGame.won ? 'win' : 'lose';
        await recordGameResult(userId, 'coinflip', bet, adjustedProfit, gameResult, {
            choice: newGame.choice,
            result: newGame.result
        });

        // Award guild XP (async, don't wait)
        awardWagerXP(userId, bet, 'Coinflip').catch(err =>
            console.error('Error awarding wager XP:', err)
        );
        awardGameXP(userId, 'Coinflip', newGame.won).catch(err =>
            console.error('Error awarding game XP:', err)
        );

        // Record to active guild events (async, don't wait)
        recordGameToEvents(userId, 'Coinflip', bet, adjustedProfit > 0 ? adjustedProfit : 0).catch(err =>
            console.error('Error recording game to events:', err)
        );

        // Update stored game
        activeGames.set(`coinflip_${userId}`, newGame);

        await interaction.deferUpdate();
        const embed = await createGameEmbed(newGame, userId, client);
        const buttons = await createButtons(newGame, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });
        return;
    }

    // Parse button - format: coinflip_{choice}_{bet}
    const parts = interaction.customId.split('_');
    const choice = parts[1]; // 'heads' or 'tails'
    const bet = parseInt(parts[2]);

    const userMoney = await getUserMoney(userId);
    if (userMoney < bet) {
        return interaction.reply({
            content: `❌ You don't have enough money! You have ${userMoney.toLocaleString()}.`,
            ephemeral: true
        });
    }

    // Deduct bet
    await setUserMoney(userId, userMoney - bet);

    // Play game
    const game = new CoinFlipGame(userId, bet, choice);

    // Apply holiday bonus to profit
    const baseProfit = game.winnings - bet;
    const adjustedProfit = applyHolidayWinningsBonus(baseProfit);
    const adjustedWinnings = bet + adjustedProfit;

    // Award winnings
    if (adjustedWinnings > 0) {
        const currentMoney = await getUserMoney(userId);
        await setUserMoney(userId, currentMoney + adjustedWinnings);
    }

    // Record result
    const gameResult = game.won ? 'win' : 'lose';
    await recordGameResult(userId, 'coinflip', bet, adjustedProfit, gameResult, {
        choice: game.choice,
        result: game.result
    });

    // Award guild XP (async, don't wait)
    awardWagerXP(userId, bet, 'Coinflip').catch(err =>
        console.error('Error awarding wager XP:', err)
    );
    awardGameXP(userId, 'Coinflip', game.won).catch(err =>
        console.error('Error awarding game XP:', err)
    );

    // Record to active guild events (async, don't wait)
    recordGameToEvents(userId, 'Coinflip', bet, adjustedProfit > 0 ? adjustedProfit : 0).catch(err =>
        console.error('Error recording game to events:', err)
    );

    // Store game for play again
    activeGames.set(`coinflip_${userId}`, game);

    // Create result embed
    await interaction.deferUpdate();
    const embed = await createGameEmbed(game, userId, client);
    const buttons = await createButtons(game, userId, client);

    await interaction.editReply({
        embeds: [embed],
        components: buttons ? [buttons] : []
    });
}

async function handleHorseRaceButtons(interaction, activeGames, userId, client) {
    // Check if this is the user's game
    if (interaction.message.interaction && interaction.message.interaction.user.id !== userId) {
        return interaction.reply({
            content: '❌ This is not your game!',
            ephemeral: true
        });
    }

    // Handle race again
    if (interaction.customId.startsWith('race_again_')) {
        const game = activeGames.get(`race_${userId}`);
        if (!game) {
            return interaction.reply({ content: '❌ No previous race found!', ephemeral: true });
        }

        const bet = game.bet;
        const horseNumber = game.betOnHorse;
        const userMoney = await getUserMoney(userId);

        if (userMoney < bet) {
            return interaction.reply({
                content: `❌ You don't have enough money for another race! You have ${userMoney.toLocaleString()}, need ${bet.toLocaleString()}.`,
                ephemeral: true
            });
        }

        // Deduct bet and create new game
        await setUserMoney(userId, userMoney - bet);
        const newGame = new HorseRacingGame(userId, bet, horseNumber);
        newGame.race();

        // Apply holiday bonus to profit
        const baseProfit = newGame.getProfit();
        const adjustedProfit = applyHolidayWinningsBonus(baseProfit);
        const adjustedWinnings = bet + adjustedProfit;

        // Award winnings
        if (adjustedWinnings > 0) {
            const currentMoney = await getUserMoney(userId);
            await setUserMoney(userId, currentMoney + adjustedWinnings);
        }

        // Record result
        const gameResult = adjustedProfit > 0 ? 'win' : 'lose';
        await recordGameResult(userId, 'horserace', bet, adjustedProfit, gameResult, {
            horseNumber: newGame.betOnHorse,
            winnerNumber: newGame.winner.number,
            horseName: newGame.getBetHorse().name,
            winnerName: newGame.winner.name
        });

        // Award guild XP (async, don't wait)
        awardWagerXP(userId, bet, 'Horse Race').catch(err =>
            console.error('Error awarding wager XP:', err)
        );
        const won = adjustedProfit > 0;
        awardGameXP(userId, 'Horse Race', won).catch(err =>
            console.error('Error awarding game XP:', err)
        );

        // Record to active guild events (async, don't wait)
        recordGameToEvents(userId, 'Horse Race', bet, adjustedProfit > 0 ? adjustedProfit : 0).catch(err =>
            console.error('Error recording game to events:', err)
        );

        // Update stored game
        activeGames.set(`race_${userId}`, newGame);

        // Show race animation, then final result
        await interaction.deferUpdate();

        // Show race frames
        for (let i = 0; i < newGame.racePositions.length; i++) {
            const embed = await createGameEmbed(newGame, userId, client, { frame: i });
            await interaction.editReply({
                embeds: [embed],
                components: []
            });
            await new Promise(resolve => setTimeout(resolve, 800));
        }

        // Show final result with buttons
        const finalEmbed = await createGameEmbed(newGame, userId, client);
        const buttons = await createButtons(newGame, userId, client);

        await interaction.editReply({
            embeds: [finalEmbed],
            components: buttons ? [buttons] : []
        });
        return;
    }

    // Parse button - format: race_horse_{number}_{bet}
    const parts = interaction.customId.split('_');
    const horseNumber = parseInt(parts[2]);
    const bet = parseInt(parts[3]);

    const userMoney = await getUserMoney(userId);
    if (userMoney < bet) {
        return interaction.reply({
            content: `❌ You don't have enough money! You have ${userMoney.toLocaleString()}.`,
            ephemeral: true
        });
    }

    // Deduct bet
    await setUserMoney(userId, userMoney - bet);

    // Create and run race
    const game = new HorseRacingGame(userId, bet, horseNumber);
    game.race();

    // Apply holiday bonus to profit
    const baseProfit = game.getProfit();
    const adjustedProfit = applyHolidayWinningsBonus(baseProfit);
    const adjustedWinnings = bet + adjustedProfit;

    // Award winnings
    if (adjustedWinnings > 0) {
        const currentMoney = await getUserMoney(userId);
        await setUserMoney(userId, currentMoney + adjustedWinnings);
    }

    // Record result
    const gameResult = adjustedProfit > 0 ? 'win' : 'lose';
    await recordGameResult(userId, 'horserace', bet, adjustedProfit, gameResult, {
        horseNumber: game.betOnHorse,
        winnerNumber: game.winner.number,
        horseName: game.getBetHorse().name,
        winnerName: game.winner.name
    });

    // Award guild XP (async, don't wait)
    awardWagerXP(userId, bet, 'Horse Race').catch(err =>
        console.error('Error awarding wager XP:', err)
    );
    const won = adjustedProfit > 0;
    awardGameXP(userId, 'Horse Race', won).catch(err =>
        console.error('Error awarding game XP:', err)
    );

    // Record to active guild events (async, don't wait)
    recordGameToEvents(userId, 'Horse Race', bet, adjustedProfit > 0 ? adjustedProfit : 0).catch(err =>
        console.error('Error recording game to events:', err)
    );

    // Store game for race again
    activeGames.set(`race_${userId}`, game);

    // Show race animation
    await interaction.deferUpdate();

    // Show race frames
    for (let i = 0; i < game.racePositions.length; i++) {
        const embed = await createGameEmbed(game, userId, client, { frame: i });
        await interaction.editReply({
            embeds: [embed],
            components: []
        });
        await new Promise(resolve => setTimeout(resolve, 800));
    }

    // Show final result with buttons
    const finalEmbed = await createGameEmbed(game, userId, client);
    const buttons = await createButtons(game, userId, client);

    await interaction.editReply({
        embeds: [finalEmbed],
        components: buttons ? [buttons] : []
    });
}

async function handleCrashButtons(interaction, activeGames, userId, client) {
    // Check if this is the user's game
    if (interaction.message.interaction && interaction.message.interaction.user.id !== userId) {
        return interaction.reply({
            content: '❌ This is not your game!',
            ephemeral: true
        });
    }

    const game = activeGames.get(`crash_${userId}`);
    if (!game) {
        return interaction.reply({ content: '❌ No active crash game found!', ephemeral: true });
    }

    // Verify this is the correct user's game
    if (game.userId !== userId) {
        return interaction.reply({ content: '❌ This is not your game!', ephemeral: true });
    }

    if (interaction.customId === 'crash_continue') {
        if (!game.canContinue()) {
            return interaction.reply({ content: '❌ Game is already complete!', ephemeral: true });
        }

        // Step the game forward
        game.step();

        // Update the display
        await interaction.deferUpdate();
        const embed = await createGameEmbed(game, userId, client);
        const buttons = await createButtons(game, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });

        // If game just completed (crashed), record result
        if (game.gameComplete) {
            // Apply holiday bonus to profit
            const baseProfit = game.totalWinnings - game.betAmount;
            const adjustedProfit = applyHolidayWinningsBonus(baseProfit);
            const adjustedTotalWinnings = game.betAmount + adjustedProfit;

            const currentMoney = await getUserMoney(userId);
            await setUserMoney(userId, currentMoney + adjustedTotalWinnings);

            const gameResult = game.result === 'win' ? 'win' : 'lose';
            await recordGameResult(userId, 'crash', game.betAmount, adjustedProfit, gameResult, {
                crashMultiplier: game.crashMultiplier,
                cashedOutAt: game.result === 'win' ? game.currentMultiplier : null
            });

            // Award guild XP (async, don't wait)
            awardWagerXP(userId, game.betAmount, 'Crash').catch(err =>
                console.error('Error awarding wager XP:', err)
            );
            const won = game.result === 'win';
            awardGameXP(userId, 'Crash', won).catch(err =>
                console.error('Error awarding game XP:', err)
            );

            // Record to active guild events (async, don't wait)
            recordGameToEvents(userId, 'Crash', game.betAmount, adjustedProfit > 0 ? adjustedProfit : 0).catch(err =>
                console.error('Error recording game to events:', err)
            );
        }
    } else if (interaction.customId === 'crash_cashout') {
        if (!game.canContinue()) {
            return interaction.reply({ content: '❌ Game is already complete!', ephemeral: true });
        }

        // Cash out at current multiplier
        game.cashOut();

        // Apply holiday bonus to profit
        const baseProfit = game.totalWinnings - game.betAmount;
        const adjustedProfit = applyHolidayWinningsBonus(baseProfit);
        const adjustedTotalWinnings = game.betAmount + adjustedProfit;

        // Award winnings
        const currentMoney = await getUserMoney(userId);
        await setUserMoney(userId, currentMoney + adjustedTotalWinnings);

        // Record result
        await recordGameResult(userId, 'crash', game.betAmount, adjustedProfit, 'win', {
            crashMultiplier: game.crashMultiplier,
            cashedOutAt: game.currentMultiplier
        });

        // Award guild XP (async, don't wait)
        awardWagerXP(userId, game.betAmount, 'Crash').catch(err =>
            console.error('Error awarding wager XP:', err)
        );
        awardGameXP(userId, 'Crash', true).catch(err =>
            console.error('Error awarding game XP:', err)
        );

        // Record to active guild events (async, don't wait)
        recordGameToEvents(userId, 'Crash', game.betAmount, adjustedProfit > 0 ? adjustedProfit : 0).catch(err =>
            console.error('Error recording game to events:', err)
        );

        // Update the display
        await interaction.deferUpdate();
        const embed = await createGameEmbed(game, userId, client);
        const buttons = await createButtons(game, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });
    } else if (interaction.customId === 'crash_play_again') {
        const bet = game.betAmount;
        const userMoney = await getUserMoney(userId);

        if (userMoney < bet) {
            return interaction.reply({
                content: `❌ You don't have enough money for another game! You have ${userMoney.toLocaleString()}, need ${bet.toLocaleString()}.`,
                ephemeral: true
            });
        }

        // Deduct bet and create new game
        await setUserMoney(userId, userMoney - bet);
        const newGame = new CrashGame(userId, bet);
        activeGames.set(`crash_${userId}`, newGame);

        await interaction.deferUpdate();
        const embed = await createGameEmbed(newGame, userId, client);
        const buttons = await createButtons(newGame, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });
    }
}

async function handleBingoButtons(interaction, activeGames, userId, client) {
    const channelId = interaction.channelId;
    const game = activeGames.get(`bingo_${channelId}`);

    if (!game) {
        return interaction.reply({ content: '❌ No active bingo game found in this channel!', ephemeral: true });
    }

    if (interaction.customId === 'bingo_join') {
        // Check if user has enough money
        const userMoney = await getUserMoney(userId);
        if (userMoney < game.entryFee) {
            return interaction.reply({
                content: `❌ You don't have enough money! Entry fee is ${game.entryFee.toLocaleString()}, you have ${userMoney.toLocaleString()}.`,
                ephemeral: true
            });
        }

        // Add player
        const result = game.addPlayer(userId);
        if (!result.success) {
            return interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
        }

        // Deduct entry fee
        await setUserMoney(userId, userMoney - game.entryFee);

        // Send player their card via DM
        try {
            const user = await client.users.fetch(userId);
            const cardDisplay = game.getCardDisplay(userId);
            const dmEmbed = new EmbedBuilder()
                .setTitle('🎱 Your Bingo Card')
                .setDescription(`Here's your bingo card for the game!\n\n${cardDisplay}\n\n[X] = Marked\nXX = Free Space`)
                .setColor('#FFD700');

            const dmMessage = await user.send({ embeds: [dmEmbed] });

            // Store the DM message ID for later editing
            const playerData = game.players.get(userId);
            if (playerData) {
                playerData.dmMessageId = dmMessage.id;
            }
        } catch (error) {
            console.log(`Could not DM bingo card to ${userId}`);
        }

        await interaction.reply({
            content: `✅ You joined the game! Check your DMs for your bingo card.`,
            ephemeral: true
        });

        // Update lobby display
        await updateBingoLobby(game, interaction, client);

    } else if (interaction.customId === 'bingo_leave') {
        const result = game.removePlayer(userId);
        if (!result.success) {
            return interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
        }

        // Refund entry fee
        const userMoney = await getUserMoney(userId);
        await setUserMoney(userId, userMoney + game.entryFee);

        await interaction.reply({
            content: `✅ You left the game. ${game.entryFee.toLocaleString()} has been refunded.`,
            ephemeral: true
        });

        // Update lobby display
        await updateBingoLobby(game, interaction, client);

    } else if (interaction.customId === 'bingo_start') {
        const result = game.startGame();
        if (!result.success) {
            return interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
        }

        await interaction.deferUpdate();

        // Start the game
        const embed = await createGameEmbed(game, userId, client);
        const buttons = await createButtons(game, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });

    } else if (interaction.customId === 'bingo_call') {
        // Only allow calling if game has started
        if (!game.gameStarted) {
            return interaction.reply({ content: '❌ Game has not started yet!', ephemeral: true });
        }

        const result = game.callNumber();
        if (!result.success) {
            return interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
        }

        await interaction.deferUpdate();

        // Update all players' cards via DM
        for (const [playerId] of game.players) {
            try {
                const user = await client.users.fetch(playerId);
                const cardDisplay = game.getCardDisplay(playerId);
                const playerData = game.players.get(playerId);

                let cardMessage = `**Last Called:** ${BingoGame.getLetterForNumber(game.currentNumber)}-${game.currentNumber}\n\n`;
                cardMessage += cardDisplay + '\n\n';

                if (playerData.hasBingo) {
                    cardMessage += `🎉 **BINGO!** You got ${playerData.bingoType}!\n`;
                }

                const dmEmbed = new EmbedBuilder()
                    .setTitle('🎱 Your Bingo Card')
                    .setDescription(cardMessage)
                    .setColor(playerData.hasBingo ? '#00FF00' : '#FFD700');

                // Edit the existing DM if we have a message ID, otherwise send a new one
                if (playerData.dmMessageId) {
                    try {
                        const dmChannel = await user.createDM();
                        const dmMessage = await dmChannel.messages.fetch(playerData.dmMessageId);
                        await dmMessage.edit({ embeds: [dmEmbed] });
                    } catch (editError) {
                        // If editing fails, send a new message and update the ID
                        const newDmMessage = await user.send({ embeds: [dmEmbed] });
                        playerData.dmMessageId = newDmMessage.id;
                    }
                } else {
                    // No message ID stored, send a new message
                    const newDmMessage = await user.send({ embeds: [dmEmbed] });
                    playerData.dmMessageId = newDmMessage.id;
                }
            } catch (error) {
                console.log(`Could not DM update to ${playerId}`);
            }
        }

        // Update main display
        const embed = await createGameEmbed(game, userId, client);
        const buttons = await createButtons(game, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });

        // If game is complete, award prizes
        if (game.gameComplete) {
            const prizes = game.calculatePrizes();
            for (const prize of prizes) {
                const currentMoney = await getUserMoney(prize.userId);
                await setUserMoney(prize.userId, currentMoney + prize.prize);

                // Record game result
                await recordGameResult(prize.userId, 'bingo', game.entryFee, prize.prize - game.entryFee, 'win', {
                    place: prize.place,
                    prizePool: game.prizePool
                });

                // Award guild XP (async, don't wait)
                awardWagerXP(prize.userId, game.entryFee, 'Bingo').catch(err =>
                    console.error('Error awarding wager XP:', err)
                );
                awardGameXP(prize.userId, 'Bingo', true).catch(err =>
                    console.error('Error awarding game XP:', err)
                );

                // Record to active guild events (async, don't wait)
                const winningsAmount = prize.prize - game.entryFee;
                recordGameToEvents(prize.userId, 'Bingo', game.entryFee, winningsAmount > 0 ? winningsAmount : 0).catch(err =>
                    console.error('Error recording game to events:', err)
                );
            }

            // Record losses for non-winners
            for (const [playerId] of game.players) {
                const isWinner = prizes.some(p => p.userId === playerId);
                if (!isWinner) {
                    await recordGameResult(playerId, 'bingo', game.entryFee, -game.entryFee, 'lose', {
                        prizePool: game.prizePool
                    });

                    // Award guild XP (async, don't wait)
                    awardWagerXP(playerId, game.entryFee, 'Bingo').catch(err =>
                        console.error('Error awarding wager XP:', err)
                    );
                    awardGameXP(playerId, 'Bingo', false).catch(err =>
                        console.error('Error awarding game XP:', err)
                    );

                    // Record to active guild events (async, don't wait)
                    recordGameToEvents(playerId, 'Bingo', game.entryFee, 0).catch(err =>
                        console.error('Error recording game to events:', err)
                    );
                }
            }
        }
    }
}

async function updateBingoLobby(game, interaction, client) {
    const playerList = [];
    for (const [playerId] of game.players) {
        try {
            const user = await client.users.fetch(playerId);
            playerList.push(user.username);
        } catch (error) {
            playerList.push(`User ${playerId}`);
        }
    }

    const embed = new EmbedBuilder()
        .setTitle('🎱 Bingo Hall - Waiting for Players')
        .setColor('#FFD700')
        .setDescription(
            `Welcome to the Bingo Hall!\n\n` +
            `💰 **Entry Fee:** ${game.entryFee.toLocaleString()}\n` +
            `👥 **Players:** ${game.players.size}/${game.maxPlayers}\n` +
            `💵 **Prize Pool:** ${game.prizePool.toLocaleString()}\n\n` +
            `**Prizes:**\n` +
            `🥇 1st Bingo: 50% of pool (${Math.floor(game.prizePool * 0.50).toLocaleString()})\n` +
            `🥈 2nd Bingo: 30% of pool (${Math.floor(game.prizePool * 0.30).toLocaleString()})\n` +
            `🥉 3rd Bingo: 20% of pool (${Math.floor(game.prizePool * 0.20).toLocaleString()})\n\n` +
            `**Players:** ${playerList.length > 0 ? playerList.join(', ') : 'None yet'}\n\n` +
            `Click **Join Game** to enter!`
        )
        .setTimestamp();

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
                .setDisabled(game.players.size < 2)
        );

    await interaction.message.edit({
        embeds: [embed],
        components: [row]
    });
}

async function handleTournamentButtons(interaction, activeGames, userId, client) {
    const channelId = interaction.channelId;
    const tournament = activeGames.get(`tournament_${channelId}`);

    if (!tournament) {
        return interaction.reply({ content: '❌ No active tournament found in this channel!', ephemeral: true });
    }

    if (interaction.customId === 'tournament_register') {
        // Check if user has enough money
        const userMoney = await getUserMoney(userId);
        if (userMoney < tournament.buyIn) {
            return interaction.reply({
                content: `❌ You don't have enough money! Buy-in is ${tournament.buyIn.toLocaleString()}, you have ${userMoney.toLocaleString()}.`,
                ephemeral: true
            });
        }

        // Register player
        const result = tournament.addPlayer(userId);
        if (!result.success) {
            return interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
        }

        // Deduct buy-in
        await setUserMoney(userId, userMoney - tournament.buyIn);

        await interaction.reply({
            content: `✅ You registered for the tournament! Starting chips: 1,000`,
            ephemeral: true
        });

        // Update lobby display
        await updateTournamentLobby(tournament, interaction, client);

    } else if (interaction.customId === 'tournament_unregister') {
        const result = tournament.removePlayer(userId);
        if (!result.success) {
            return interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
        }

        // Refund buy-in
        const userMoney = await getUserMoney(userId);
        await setUserMoney(userId, userMoney + tournament.buyIn);

        await interaction.reply({
            content: `✅ You unregistered. ${tournament.buyIn.toLocaleString()} has been refunded.`,
            ephemeral: true
        });

        // Update lobby display
        await updateTournamentLobby(tournament, interaction, client);

    } else if (interaction.customId === 'tournament_start') {
        const result = tournament.startTournament();
        if (!result.success) {
            return interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
        }

        await interaction.deferUpdate();

        // Send player cards via DM
        await sendPlayerCardsDM(tournament, client);

        // Start the tournament
        const embed = await createGameEmbed(tournament, userId, client);
        const buttons = await createButtons(tournament, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });

    } else if (interaction.customId === 'tournament_fold') {
        if (tournament.getCurrentPlayer() !== userId) {
            return interaction.reply({ content: '❌ It\'s not your turn!', ephemeral: true });
        }

        tournament.fold(userId);

        await interaction.deferUpdate();
        const embed = await createGameEmbed(tournament, userId, client);
        const buttons = await createButtons(tournament, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });

        // Check if hand/tournament is complete after fold
        if (tournament.phase === 'handComplete') {
            // Wait 3 seconds then start next hand
            setTimeout(async () => {
                tournament.startNewHand();

                // Send player cards via DM for the new hand
                await sendPlayerCardsDM(tournament, client);

                const newEmbed = await createGameEmbed(tournament, userId, client);
                const newButtons = await createButtons(tournament, userId, client);

                await interaction.message.edit({
                    embeds: [newEmbed],
                    components: newButtons ? [newButtons] : []
                });
            }, 3000);
        } else if (tournament.tournamentComplete) {
            // Award prizes
            const prizes = tournament.winners;
            for (const prize of prizes) {
                const currentMoney = await getUserMoney(prize.userId);
                await setUserMoney(prize.userId, currentMoney + prize.prize);

                await recordGameResult(prize.userId, 'poker_tournament', tournament.buyIn, prize.prize - tournament.buyIn, 'win', {
                    place: prize.place,
                    prizePool: tournament.prizePool
                });

                // Award guild XP (async, don't wait)
                awardWagerXP(prize.userId, tournament.buyIn, 'Poker Tournament').catch(err =>
                    console.error('Error awarding wager XP:', err)
                );
                awardGameXP(prize.userId, 'Poker Tournament', true).catch(err =>
                    console.error('Error awarding game XP:', err)
                );

                // Record to active guild events (async, don't wait)
                const winningsAmount = prize.prize - tournament.buyIn;
                recordGameToEvents(prize.userId, 'Poker Tournament', tournament.buyIn, winningsAmount > 0 ? winningsAmount : 0).catch(err =>
                    console.error('Error recording game to events:', err)
                );
            }

            // Record losses for non-winners
            for (const [playerId] of tournament.players) {
                const isWinner = prizes.some(p => p.userId === playerId);
                if (!isWinner) {
                    await recordGameResult(playerId, 'poker_tournament', tournament.buyIn, -tournament.buyIn, 'lose', {
                        prizePool: tournament.prizePool
                    });

                    // Award guild XP (async, don't wait)
                    awardWagerXP(playerId, tournament.buyIn, 'Poker Tournament').catch(err =>
                        console.error('Error awarding wager XP:', err)
                    );
                    awardGameXP(playerId, 'Poker Tournament', false).catch(err =>
                        console.error('Error awarding game XP:', err)
                    );

                    // Record to active guild events (async, don't wait)
                    recordGameToEvents(playerId, 'Poker Tournament', tournament.buyIn, 0).catch(err =>
                        console.error('Error recording game to events:', err)
                    );
                }
            }
        }

    } else if (interaction.customId === 'tournament_check_call') {
        if (tournament.getCurrentPlayer() !== userId) {
            return interaction.reply({ content: '❌ It\'s not your turn!', ephemeral: true });
        }

        const player = tournament.players.get(userId);
        const callAmount = tournament.currentBet - player.bet;

        // Determine if this is a check or call
        if (callAmount === 0) {
            // Check
            const success = tournament.check(userId);
            if (!success) {
                return interaction.reply({ content: '❌ Cannot check!', ephemeral: true });
            }
        } else {
            // Call
            tournament.call(userId);
        }

        await interaction.deferUpdate();
        const embed = await createGameEmbed(tournament, userId, client);
        const buttons = await createButtons(tournament, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });

        // Check if hand/tournament is complete
        if (tournament.phase === 'handComplete') {
            // Wait 3 seconds then start next hand
            setTimeout(async () => {
                tournament.startNewHand();

                // Send player cards via DM for the new hand
                await sendPlayerCardsDM(tournament, client);

                const newEmbed = await createGameEmbed(tournament, userId, client);
                const newButtons = await createButtons(tournament, userId, client);

                await interaction.message.edit({
                    embeds: [newEmbed],
                    components: newButtons ? [newButtons] : []
                });
            }, 3000);
        } else if (tournament.tournamentComplete) {
            // Award prizes
            const prizes = tournament.winners;
            for (const prize of prizes) {
                const currentMoney = await getUserMoney(prize.userId);
                await setUserMoney(prize.userId, currentMoney + prize.prize);

                await recordGameResult(prize.userId, 'poker_tournament', tournament.buyIn, prize.prize - tournament.buyIn, 'win', {
                    place: prize.place,
                    prizePool: tournament.prizePool
                });

                // Award guild XP (async, don't wait)
                awardWagerXP(prize.userId, tournament.buyIn, 'Poker Tournament').catch(err =>
                    console.error('Error awarding wager XP:', err)
                );
                awardGameXP(prize.userId, 'Poker Tournament', true).catch(err =>
                    console.error('Error awarding game XP:', err)
                );

                // Record to active guild events (async, don't wait)
                const winningsAmount = prize.prize - tournament.buyIn;
                recordGameToEvents(prize.userId, 'Poker Tournament', tournament.buyIn, winningsAmount > 0 ? winningsAmount : 0).catch(err =>
                    console.error('Error recording game to events:', err)
                );
            }

            // Record losses for non-winners
            for (const [playerId] of tournament.players) {
                const isWinner = prizes.some(p => p.userId === playerId);
                if (!isWinner) {
                    await recordGameResult(playerId, 'poker_tournament', tournament.buyIn, -tournament.buyIn, 'lose', {
                        prizePool: tournament.prizePool
                    });

                    // Award guild XP (async, don't wait)
                    awardWagerXP(playerId, tournament.buyIn, 'Poker Tournament').catch(err =>
                        console.error('Error awarding wager XP:', err)
                    );
                    awardGameXP(playerId, 'Poker Tournament', false).catch(err =>
                        console.error('Error awarding game XP:', err)
                    );
                }
            }
        }

    } else if (interaction.customId === 'tournament_raise') {
        if (tournament.getCurrentPlayer() !== userId) {
            return interaction.reply({ content: '❌ It\'s not your turn!', ephemeral: true });
        }

        // Show modal for raise amount
        const modal = new ModalBuilder()
            .setCustomId('tournament_raise_amount')
            .setTitle('Raise Amount')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('raise_amount')
                        .setLabel('How much to raise?')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setPlaceholder('50')
                )
            );

        await interaction.showModal(modal);

    } else if (interaction.customId === 'tournament_next_hand') {
        if (tournament.phase !== 'handComplete') {
            return interaction.reply({ content: '❌ Hand is not complete!', ephemeral: true });
        }

        tournament.startNewHand();

        await interaction.deferUpdate();

        // Send player cards via DM for the new hand
        await sendPlayerCardsDM(tournament, client);

        const embed = await createGameEmbed(tournament, userId, client);
        const buttons = await createButtons(tournament, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });
    }
}

async function updateTournamentLobby(tournament, interaction, client) {
    const playerList = [];
    for (const [playerId] of tournament.players) {
        try {
            const user = await client.users.fetch(playerId);
            playerList.push(user.username);
        } catch (error) {
            playerList.push(`User ${playerId}`);
        }
    }

    const embed = new EmbedBuilder()
        .setTitle('♠️ Texas Hold\'em Tournament')
        .setColor('#FFD700')
        .setDescription(
            `🎰 **Tournament Starting Soon!**\n\n` +
            `💰 **Buy-in:** ${tournament.buyIn.toLocaleString()}\n` +
            `🏆 **Prize Pool:** ${tournament.prizePool.toLocaleString()}\n` +
            `👥 **Players:** ${tournament.players.size}/${tournament.maxPlayers}\n` +
            `💎 **Starting Chips:** 1,000\n\n` +
            `**Prize Distribution:**\n` +
            `🥇 1st Place: 50% of pool (${Math.floor(tournament.prizePool * 0.50).toLocaleString()})\n` +
            `🥈 2nd Place: 30% of pool (${Math.floor(tournament.prizePool * 0.30).toLocaleString()})\n` +
            `🥉 3rd Place: 20% of pool (${Math.floor(tournament.prizePool * 0.20).toLocaleString()})\n\n` +
            `**Blinds:** Start at 10/20, increase every 5 hands\n\n` +
            `**Registered Players:** ${playerList.length > 0 ? playerList.join(', ') : 'None yet'}\n\n` +
            `Click **Register** to join!`
        )
        .setTimestamp();

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
                .setDisabled(tournament.players.size < 2)
        );

    await interaction.message.edit({
        embeds: [embed],
        components: [row]
    });
}

async function handleHiLoButtons(interaction, activeGames, userId, client) {
    const game = activeGames.get(`hilo_${userId}`);
    if (!game) {
        return interaction.reply({ content: '❌ No active Hi-Lo game found!', ephemeral: true });
    }

    // Verify this is the correct user's game
    if (game.userId !== userId) {
        return interaction.reply({ content: '❌ This is not your game!', ephemeral: true });
    }

    if (interaction.customId === 'hilo_higher') {
        const result = game.guess('higher');

        await interaction.deferUpdate();
        const embed = await createGameEmbed(game, userId, client);
        const buttons = await createButtons(game, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });

        // If game just completed, award winnings and record result
        if (game.gameComplete) {
            const currentMoney = await getUserMoney(userId);
            await setUserMoney(userId, currentMoney + game.currentWinnings);

            const gameResult = game.result === 'win' ? 'win' : 'lose';
            await recordGameResult(userId, 'hilo', game.initialBet, game.currentWinnings - game.initialBet, gameResult, {
                streak: game.streak,
                multiplier: game.multiplier
            });

            // Award guild XP (async, don't wait)
            awardWagerXP(userId, game.initialBet, 'HiLo').catch(err =>
                console.error('Error awarding wager XP:', err)
            );
            const won = game.result === 'win';
            awardGameXP(userId, 'HiLo', won).catch(err =>
                console.error('Error awarding game XP:', err)
            );

            // Record to active guild events (async, don't wait)
            const winningsAmount = game.currentWinnings - game.initialBet;
            recordGameToEvents(userId, 'HiLo', game.initialBet, winningsAmount > 0 ? winningsAmount : 0).catch(err =>
                console.error('Error recording game to events:', err)
            );
        }

    } else if (interaction.customId === 'hilo_lower') {
        const result = game.guess('lower');

        await interaction.deferUpdate();
        const embed = await createGameEmbed(game, userId, client);
        const buttons = await createButtons(game, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });

        // If game just completed, award winnings and record result
        if (game.gameComplete) {
            const currentMoney = await getUserMoney(userId);
            await setUserMoney(userId, currentMoney + game.currentWinnings);

            const gameResult = game.result === 'win' ? 'win' : 'lose';
            await recordGameResult(userId, 'hilo', game.initialBet, game.currentWinnings - game.initialBet, gameResult, {
                streak: game.streak,
                multiplier: game.multiplier
            });

            // Award guild XP (async, don't wait)
            awardWagerXP(userId, game.initialBet, 'HiLo').catch(err =>
                console.error('Error awarding wager XP:', err)
            );
            const won = game.result === 'win';
            awardGameXP(userId, 'HiLo', won).catch(err =>
                console.error('Error awarding game XP:', err)
            );

            // Record to active guild events (async, don't wait)
            const winningsAmount = game.currentWinnings - game.initialBet;
            recordGameToEvents(userId, 'HiLo', game.initialBet, winningsAmount > 0 ? winningsAmount : 0).catch(err =>
                console.error('Error recording game to events:', err)
            );
        }

    } else if (interaction.customId === 'hilo_cashout') {
        const result = game.cashOut();
        if (!result.success) {
            return interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
        }

        // Award winnings
        const currentMoney = await getUserMoney(userId);
        await setUserMoney(userId, currentMoney + game.currentWinnings);

        // Record game result
        await recordGameResult(userId, 'hilo', game.initialBet, game.currentWinnings - game.initialBet, 'win', {
            streak: game.streak,
            multiplier: game.multiplier
        });

        // Award guild XP (async, don't wait)
        awardWagerXP(userId, game.initialBet, 'HiLo').catch(err =>
            console.error('Error awarding wager XP:', err)
        );
        awardGameXP(userId, 'HiLo', true).catch(err =>
            console.error('Error awarding game XP:', err)
        );

        // Record to active guild events (async, don't wait)
        const winningsAmount = game.currentWinnings - game.initialBet;
        recordGameToEvents(userId, 'HiLo', game.initialBet, winningsAmount > 0 ? winningsAmount : 0).catch(err =>
            console.error('Error recording game to events:', err)
        );

        await interaction.deferUpdate();
        const embed = await createGameEmbed(game, userId, client);
        const buttons = await createButtons(game, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });

    } else if (interaction.customId === 'hilo_play_again') {
        const bet = game.initialBet;
        const userMoney = await getUserMoney(userId);

        if (userMoney < bet) {
            return interaction.reply({
                content: `❌ You don't have enough money for another game! You have ${userMoney.toLocaleString()}, need ${bet.toLocaleString()}.`,
                ephemeral: true
            });
        }

        // Deduct bet and create new game
        await setUserMoney(userId, userMoney - bet);
        const newGame = new HiLoGame(userId, bet);
        activeGames.set(`hilo_${userId}`, newGame);

        await interaction.deferUpdate();
        const embed = await createGameEmbed(newGame, userId, client);
        const buttons = await createButtons(newGame, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });
    }
}

async function handleClaimChallengeRewards(interaction, userId) {
    const { getUserChallenges, awardChallengeReward } = require('../utils/challenges');
    const { markChallengeClaimedDB } = require('../utils/data');

    try {
        const challenges = await getUserChallenges(userId);
        if (!challenges) {
            return interaction.reply({
                content: '❌ Unable to load your challenges.',
                ephemeral: true
            });
        }

        // Find all completed but not yet claimed challenges
        const completedChallenges = [...challenges.daily, ...challenges.weekly].filter(c => c.completed && !c.claimed);

        if (completedChallenges.length === 0) {
            return interaction.reply({
                content: '❌ You have no completed challenges to claim!',
                ephemeral: true
            });
        }

        // Award all rewards
        let totalReward = 0;
        const claimedChallenges = [];

        for (const challenge of completedChallenges) {
            const reward = await awardChallengeReward(userId, challenge);
            totalReward += reward;
            claimedChallenges.push(`${challenge.emoji} **${challenge.name}** - $${reward.toLocaleString()}`);

            // Mark challenge as claimed in the database
            await markChallengeClaimedDB(userId, challenge.id);
        }

        // Challenges remain in DB as "completed & claimed" until reset period expires

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('🎉 Challenge Rewards Claimed!')
            .setDescription(`You've earned a total of **$${totalReward.toLocaleString()}**!`)
            .addFields({
                name: 'Completed Challenges',
                value: claimedChallenges.join('\n'),
                inline: false
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('Error claiming challenge rewards:', error);
        await interaction.reply({
            content: '❌ An error occurred while claiming your rewards. Please try again.',
            ephemeral: true
        });
    }
}

async function handleShopPurchase(interaction, userId) {
    const { purchaseItem, getShopItem } = require('../utils/shop');

    try {
        const itemId = interaction.customId.replace('shop_buy_', '');
        const result = await purchaseItem(userId, itemId);

        if (!result.success) {
            return interaction.reply({
                content: `❌ ${result.message}`,
                ephemeral: true
            });
        }

        const item = getShopItem(itemId);
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ Purchase Successful!')
            .setDescription(result.message)
            .addFields(
                { name: 'Item', value: item.name, inline: true },
                { name: 'Effect', value: item.description, inline: false }
            )
            .setFooter({ text: 'Use /inventory to view your items' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('Error handling shop purchase:', error);
        await interaction.reply({
            content: '❌ An error occurred while processing your purchase. Please try again.',
            ephemeral: true
        });
    }
}

async function handlePropertyPurchase(interaction, userId) {
    const { purchaseProperty } = require('../utils/properties');
    const { getUserMoney } = require('../utils/data');

    try {
        await interaction.deferReply();

        const propertyId = interaction.customId.replace('property_buy_', '');
        const result = await purchaseProperty(userId, propertyId);

        if (!result.success) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Purchase Failed')
                .setDescription(result.message)
                .setTimestamp();

            return interaction.editReply({ embeds: [errorEmbed] });
        }

        const property = result.property;
        const currentMoney = await getUserMoney(userId);

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ Property Purchased!')
            .setDescription(`${property.emoji} **${property.name}**\n*${property.description}*`)
            .addFields(
                {
                    name: '💰 Purchase Price',
                    value: `$${property.purchasePrice.toLocaleString()}`,
                    inline: true
                },
                {
                    name: '💵 Daily Income',
                    value: `$${property.baseIncome.toLocaleString()}`,
                    inline: true
                },
                {
                    name: '🔧 Daily Maintenance',
                    value: `$${property.baseMaintenance.toLocaleString()}`,
                    inline: true
                },
                {
                    name: '📊 Net Daily Profit',
                    value: `$${(property.baseIncome - property.baseMaintenance).toLocaleString()}`,
                    inline: false
                },
                {
                    name: '💳 New Balance',
                    value: `$${currentMoney.toLocaleString()}`,
                    inline: true
                }
            )
            .setFooter({ text: 'Use /collect to claim daily income!' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error('Error handling property purchase:', error);

        const errorMessage = {
            content: '❌ An error occurred while processing your property purchase. Please try again.',
            ephemeral: true
        };

        if (interaction.deferred) {
            await interaction.editReply(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
}

async function handleUseItem(interaction, userId) {
    const { useItem, getUserInventory, SHOP_ITEMS } = require('../utils/shop');

    try {
        const itemType = interaction.customId.replace('use_item_', '');
        const inventory = getUserInventory(userId);

        // Find the first item of this type
        const item = inventory.find(invItem => {
            const invItemType = invItem.id.split('_')[0] + '_' + invItem.id.split('_')[1];
            return invItemType === itemType;
        });

        if (!item) {
            return interaction.reply({
                content: '❌ Item not found in your inventory!',
                ephemeral: true
            });
        }

        const result = await useItem(userId, item.id);

        if (!result.success) {
            return interaction.reply({
                content: `❌ ${result.message}`,
                ephemeral: true
            });
        }

        const shopItem = SHOP_ITEMS[itemType];
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ Item Activated!')
            .setDescription(result.message)
            .addFields(
                { name: 'Effect', value: shopItem.description, inline: false },
                { name: 'Status', value: '⚡ Active - Will be consumed on your next applicable action', inline: false }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('Error handling item use:', error);
        await interaction.reply({
            content: '❌ An error occurred while using the item. Please try again.',
            ephemeral: true
        });
    }
}

async function handleVIPPurchase(interaction, userId) {
    const { purchaseVIP, getVIPTierById } = require('../utils/vip');
    const { getUserMoney } = require('../utils/data');

    try {
        const tierId = interaction.customId.replace('vip_buy_', '');

        await interaction.deferReply();

        const result = await purchaseVIP(userId, tierId);

        if (!result.success) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Purchase Failed')
                .setDescription(result.message)
                .setTimestamp();

            return interaction.editReply({ embeds: [errorEmbed] });
        }

        const tier = result.tier;
        const actionType = result.isUpgrade ? 'Upgraded' : (result.isRenewal ? 'Renewed' : 'Purchased');

        const embed = new EmbedBuilder()
            .setColor(tier.color)
            .setTitle(`✅ VIP ${actionType}!`)
            .setDescription(`${tier.emoji} **${tier.name}**`)
            .addFields(
                {
                    name: '💰 Cost',
                    value: `$${tier.price.toLocaleString()}`,
                    inline: true
                },
                {
                    name: '⏰ Duration',
                    value: '30 days',
                    inline: true
                },
                {
                    name: '✨ Your Perks',
                    value: tier.perks.description.join('\n'),
                    inline: false
                }
            )
            .setTimestamp();

        const expiryDate = new Date(result.expiresAt);
        embed.setFooter({ text: `Expires on ${expiryDate.toLocaleDateString()}` });

        const currentMoney = await getUserMoney(userId);
        embed.addFields({
            name: '💵 New Balance',
            value: `$${currentMoney.toLocaleString()}`,
            inline: true
        });

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error('Error handling VIP purchase:', error);
        await interaction.reply({
            content: '❌ An error occurred while processing your VIP purchase. Please try again.',
            ephemeral: true
        });
    }
}

async function handleGuildHeistJoin(interaction, userId) {
    const { joinGuildHeist, getActiveGuildHeist } = require('../utils/heist');

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

module.exports = { handleButtonInteraction, handleBlackjackButtons, handleTableButtons, updateBettingDisplay, startTurnTimer, handleRouletteButtons, animateDealerDrawing, handleCrapsButtons, handleWarButtons, handleCoinFlipButtons, handleHorseRaceButtons, handleCrashButtons, handleBingoButtons, handleTournamentButtons, handleHiLoButtons, handleClaimChallengeRewards, handleShopPurchase, handlePropertyPurchase, handleUseItem, handleVIPPurchase, handleGuildHeistJoin };