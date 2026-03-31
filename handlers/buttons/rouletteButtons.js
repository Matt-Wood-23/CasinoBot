const { getUserMoney, setUserMoney, recordGameResult } = require('../../utils/data');
const { createGameEmbed } = require('../../utils/embeds');
const { createButtons } = require('../../utils/buttons');
const { applyHolidayWinningsBonus } = require('../../utils/holidayEvents');
const { awardGameXP, awardWagerXP } = require('../../utils/guildXP');
const { recordGameToEvents } = require('../../utils/eventIntegration');
const { ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const RouletteGame = require('../../gameLogic/rouletteGame');

async function handleRouletteButtons(interaction, activeGames, userId, client, rouletteSessions) {
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

module.exports = { handleRouletteButtons };
