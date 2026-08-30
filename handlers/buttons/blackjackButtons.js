const { getUserMoney, setUserMoney } = require('../../utils/data');
const BlackjackGame = require('../../gameLogic/blackjackGame');
const { settleBlackjackGame } = require('../../utils/blackjackSettlement');
const { renderBlackjack, wait } = require('../../utils/blackjackRender');
const {
    DEALER_REVEAL_DELAY,
    DEALER_DRAW_DELAY,
    DEALER_RESULT_DELAY,
    INITIAL_DEAL_DELAY
} = require('../../utils/blackjackTiming');

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
        // Search for an active duel game containing this player
        for (const [key, g] of activeGames) {
            if (key.startsWith('duel_game_') && g.isDuel && g.players.has(user.id) && !g.gameOver) {
                game = g;
                isMultiPlayer = true;
                break;
            }
        }
        if (!game) {
            return interaction.reply({ content: '❌ No active game found!', ephemeral: true });
        }
    }

    // Handle play again buttons
    if (customId === 'play_again_single') {
        if (!game || game.isMultiPlayer || user.id !== Array.from(game.players.keys())[0]) {
            return interaction.reply({ content: '❌ No active single-player game found!', ephemeral: true });
        }

        // Guard against replaying a hand that is still in progress — the button
        // can survive on an older message while a new hand is being dealt.
        if (!game.gameOver || game.isDealing || game.isDealerAnimating) {
            return interaction.reply({ content: '❌ Your current hand is still in play!', ephemeral: true });
        }

        const player = game.players.get(user.id);
        const lastBet = Math.floor(player.bet / (player.hasSplit ? 2 : 1));
        const userMoney = await getUserMoney(user.id);

        if (userMoney < lastBet) {
            return interaction.reply({
                content: `❌ You don't have enough money for another game with your previous bet of ${lastBet.toLocaleString()}! You have ${userMoney.toLocaleString()}.`,
                ephemeral: true
            });
        }

        await setUserMoney(user.id, userMoney - lastBet);
        const newGame = new BlackjackGame(interaction.channelId, user.id, lastBet, false);
        // Without this the replayed hand silently drops out of the progressive
        // jackpot: every jackpot check is gated on game.serverId.
        newGame.serverId = game.serverId;
        newGame.interactionStartTime = Date.now();
        activeGames.set(user.id, newGame);

        await interaction.deferUpdate();

        await dealCardsWithDelay(interaction, interaction.message, newGame, user.id, INITIAL_DEAL_DELAY);

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
        // A hand that is mid-animation is not accepting input. Without this a
        // second click while the dealer is drawing starts a second animation
        // loop, so the cards flick past at double speed, the table flips
        // between two renders, and both loops run the payout.
        if (game.gameOver) {
            return interaction.reply({ content: '❌ This hand is already finished!', ephemeral: true });
        }
        if (game.isDealing || game.isDealerAnimating) {
            return interaction.reply({ content: '⏳ Hold on — the cards are still being dealt.', ephemeral: true });
        }

        await interaction.deferUpdate();
        let actionSuccess = false;

        if (customId === 'hit') {
            actionSuccess = game.hit(user.id);
        } else if (customId === 'stand') {
            actionSuccess = game.stand(user.id);
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

        if (!actionSuccess) {
            // Nothing changed, so nothing to redraw.
            return;
        }

        // Show the result of the player's own action before the dealer moves,
        // so the two are never collapsed into one edit.
        if (!await renderBlackjack(interaction.message, game, user.id, client)) {
            await interaction.followUp({
                content: '⚠️ Failed to update the game message.',
                ephemeral: true
            }).catch(() => {});
        }

        // If the dealer's turn has begun, play it out one card at a time.
        if (game.dealer.isDrawing) {
            await animateDealerDrawing(game, interaction, user.id, client);
        }

        if (game.gameOver) {
            if (game.turnTimer) {
                clearTimeout(game.turnTimer);
                game.turnTimer = null;
            }

            // Idempotent: whichever path gets here first pays the hand out.
            try {
                await settleBlackjackGame(game);
            } catch (error) {
                await interaction.followUp({
                    content: '⚠️ Something went wrong settling this hand. Please contact the bot owner before playing again.',
                    ephemeral: true
                });
            }

            // One final redraw, now that payouts, loan deductions and any
            // jackpot are recorded on the game.
            await renderBlackjack(interaction.message, game, user.id, client);
        }

        // Start turn timer for multiplayer
        if (isMultiPlayer && !game.gameOver) {
            startTurnTimer(game, interaction, activeGames, client, dealCardsWithDelay);
        }
    }
}

async function updateBettingDisplay(game, interaction, client, options = {}) {
    const ok = await renderBlackjack(interaction.message, game, interaction.user.id, client, options);
    if (!ok) {
        await interaction.followUp({
            content: '⚠️ Failed to update the game message. Your bet was adjusted, but the table may not reflect it.',
            ephemeral: true
        }).catch(() => {});
    }
}

function startTurnTimer(game, interaction, activeGames, client, dealCardsWithDelay) {
    if (!game.isMultiPlayer || game.gameOver) return;

    // Each action used to schedule another timeout without cancelling the
    // previous one, so a player who acted twice was force-stood 30s after their
    // FIRST action rather than their most recent one.
    if (game.turnTimer) clearTimeout(game.turnTimer);

    const currentPlayerId = Array.from(game.players.keys())[game.currentPlayerIndex];

    game.turnTimer = setTimeout(async () => {
        game.turnTimer = null;

        if (activeGames.get(interaction.channelId) !== game) return;
        if (game.gameOver || game.isDealing || game.isDealerAnimating) return;

        const player = game.players.get(currentPlayerId);
        if (!player || player.stood) return;

        if (!game.stand(currentPlayerId)) return;

        try {
            await renderBlackjack(interaction.message, game, currentPlayerId, client);

            // Standing may have handed the table to the dealer. Play that out
            // here too — the old timeout path never did, which left the hand
            // stuck with the dealer mid-draw and no way to finish it.
            if (game.dealer.isDrawing) {
                await animateDealerDrawing(game, interaction, currentPlayerId, client);
            }

            if (game.gameOver) {
                await settleBlackjackGame(game);
                await renderBlackjack(interaction.message, game, currentPlayerId, client);
            } else {
                startTurnTimer(game, interaction, activeGames, client, dealCardsWithDelay);
            }
        } catch (error) {
            console.error('Error resolving turn timeout:', error);
        }
    }, 30000); // 30 seconds
}

/**
 * Play the dealer's turn out at a readable pace: a beat, the hole card, then
 * one card at a time.
 *
 * Only one of these may run per game. Two concurrent loops (which a double
 * click on Stand used to produce) both draw and both redraw, which is what made
 * the dealer's cards appear to flip past almost instantly.
 */
async function animateDealerDrawing(game, interaction, userId, client) {
    if (game.isDealerAnimating) return;
    game.isDealerAnimating = true;

    const currentGameId = game.gameId; // Detect the game being replaced mid-animation
    const stillCurrent = () => {
        if (game.gameId !== currentGameId) {
            console.log(`Game ${currentGameId} was replaced during dealer animation, stopping`);
            return false;
        }
        return true;
    };

    try {
        // Beat before the flip, so the reveal reads as its own moment rather
        // than arriving in the same edit as the player's last action.
        if (game.hasHiddenDealerCard()) {
            await wait(DEALER_REVEAL_DELAY);
            if (!stillCurrent()) return;

            game.revealDealerHoleCard();
            if (!await renderBlackjack(interaction.message, game, userId, client)) return;
        }

        while (game.shouldDealerContinue()) {
            if (!stillCurrent()) return;

            await wait(DEALER_DRAW_DELAY);
            if (!stillCurrent()) return;

            game.drawDealerCard();

            if (!await renderBlackjack(interaction.message, game, userId, client)) return;
        }

        // Let the dealer's final hand sit for a moment before the result
        // replaces it.
        if (game.gameOver) await wait(DEALER_RESULT_DELAY);
    } finally {
        game.isDealerAnimating = false;
    }
}

module.exports = { handleBlackjackButtons, updateBettingDisplay, startTurnTimer, animateDealerDrawing };
