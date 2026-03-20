const { getUserMoney, setUserMoney, recordGameResult } = require('../../utils/data');
const { createGameEmbed } = require('../../utils/embeds');
const { createButtons } = require('../../utils/buttons');
const { applyHolidayWinningsBonus } = require('../../utils/holidayEvents');
const { awardGameXP, awardWagerXP } = require('../../utils/guildXP');
const { recordGameToEvents } = require('../../utils/eventIntegration');
const CrapsGame = require('../../gameLogic/crapsGame');

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

module.exports = { handleCrapsButtons };
