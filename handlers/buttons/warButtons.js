const { getUserMoney, setUserMoney, recordGameResult } = require('../../utils/data');
const { createGameEmbed } = require('../../utils/embeds');
const { createButtons } = require('../../utils/buttons');
const { applyHolidayWinningsBonus } = require('../../utils/holidayEvents');
const { awardGameXP, awardWagerXP } = require('../../utils/guildXP');
const { recordGameToEvents } = require('../../utils/eventIntegration');
const WarGame = require('../../gameLogic/warGame');

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

module.exports = { handleWarButtons };
