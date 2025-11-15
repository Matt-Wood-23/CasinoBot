const { getUserMoney, setUserMoney, recordGameResult } = require('../../utils/data');
const { createGameEmbed } = require('../../utils/embeds');
const { createButtons } = require('../../utils/buttons');
const { awardGameXP, awardWagerXP } = require('../../utils/guildXP');
const { recordGameToEvents } = require('../../utils/eventIntegration');
const HiLoGame = require('../../gameLogic/hiLoGame');

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

module.exports = { handleHiLoButtons };
