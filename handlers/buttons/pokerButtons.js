const { getUserMoney, setUserMoney, recordGameResult } = require('../../utils/data');
const { createGameEmbed } = require('../../utils/embeds');
const { createButtons } = require('../../utils/buttons');
const { applyHolidayWinningsBonus } = require('../../utils/holidayEvents');
const { awardGameXP, awardWagerXP } = require('../../utils/guildXP');
const { recordGameToEvents } = require('../../utils/eventIntegration');
const ThreeCardPokerGame = require('../../gameLogic/threeCardPokerGame');

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

module.exports = { handlePokerButtons };
