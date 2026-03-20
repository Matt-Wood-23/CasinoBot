const { getUserMoney, setUserMoney, recordGameResult } = require('../../utils/data');
const { createGameEmbed } = require('../../utils/embeds');
const { createButtons } = require('../../utils/buttons');
const { applyHolidayWinningsBonus } = require('../../utils/holidayEvents');
const { awardGameXP, awardWagerXP } = require('../../utils/guildXP');
const { recordGameToEvents } = require('../../utils/eventIntegration');
const CrashGame = require('../../gameLogic/crashGame');

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

module.exports = { handleCrashButtons };
