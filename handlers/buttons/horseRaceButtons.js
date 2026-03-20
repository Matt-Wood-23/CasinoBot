const { getUserMoney, setUserMoney, recordGameResult } = require('../../utils/data');
const { createGameEmbed } = require('../../utils/embeds');
const { createButtons } = require('../../utils/buttons');
const { applyHolidayWinningsBonus } = require('../../utils/holidayEvents');
const { awardGameXP, awardWagerXP } = require('../../utils/guildXP');
const { recordGameToEvents } = require('../../utils/eventIntegration');
const HorseRacingGame = require('../../gameLogic/horseRacingGame');

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

module.exports = { handleHorseRaceButtons };
