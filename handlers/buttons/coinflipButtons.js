const { getUserMoney, setUserMoney, recordGameResult } = require('../../utils/data');
const { createGameEmbed } = require('../../utils/embeds');
const { createButtons } = require('../../utils/buttons');
const { applyHolidayWinningsBonus } = require('../../utils/holidayEvents');
const { awardGameXP, awardWagerXP } = require('../../utils/guildXP');
const { recordGameToEvents } = require('../../utils/eventIntegration');
const CoinFlipGame = require('../../gameLogic/coinFlipGame');

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

module.exports = { handleCoinFlipButtons };
