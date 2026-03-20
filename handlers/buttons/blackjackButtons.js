const { getUserMoney, setUserMoney, recordGameResult } = require('../../utils/data');
const { createGameEmbed } = require('../../utils/embeds');
const { createButtons } = require('../../utils/buttons');
const { applyHolidayWinningsBonus } = require('../../utils/holidayEvents');
const { getServerJackpot, resetJackpot } = require('../../database/queries');
const { isNaturalBlackjack } = require('../../utils/cardHelpers');
const { awardGameXP, awardWagerXP } = require('../../utils/guildXP');
const { recordGameToEvents } = require('../../utils/eventIntegration');
const BlackjackGame = require('../../gameLogic/blackjackGame');

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

module.exports = { handleBlackjackButtons, updateBettingDisplay, startTurnTimer, animateDealerDrawing };
