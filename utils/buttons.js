const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getUserData } = require('./data');

function createButtons(game, userId, client, options = {}) {
    // Three Card Poker buttons
    if (game.constructor.name === 'ThreeCardPokerGame') {
        return createPokerButtons(game);
    }

    // Slots buttons
    if (game.constructor.name === 'SlotsGame') {
        return createSlotsButtons(game);
    }

    // Blackjack buttons
    if (game.constructor.name === 'BlackjackGame') {
        return createBlackjackButtons(game, userId, client, options);
    }

    // Craps buttons
    if (game.constructor.name === 'CrapsGame') {
        return createCrapsButtons(game);
    }

    // War buttons
    if (game.constructor.name === 'WarGame') {
        return createWarButtons(game);
    }

    // Coin flip buttons
    if (game.constructor.name === 'CoinFlipGame') {
        return createCoinFlipButtons(game);
    }

    // Horse racing buttons
    if (game.constructor.name === 'HorseRacingGame') {
        return createHorseRaceButtons(game);
    }

    // Crash buttons
    if (game.constructor.name === 'CrashGame') {
        return createCrashButtons(game);
    }

    // Bingo buttons
    if (game.constructor.name === 'BingoGame') {
        return createBingoButtons(game);
    }

    // Tournament buttons
    if (game.constructor.name === 'PokerTournament') {
        return createTournamentButtons(game, userId);
    }

    // Hi-Lo buttons
    if (game.constructor.name === 'HiLoGame') {
        return createHiLoButtons(game);
    }

    // Handle Roulette buttons
    if (game.constructor.name === 'RouletteGame') {
        if (game.gameComplete) {
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('roulette_play_again')
                        .setLabel('🎰 Play Again')
                        .setStyle(ButtonStyle.Primary)
                );
            return row;
        }
        return null; // No buttons during game play
    }

    return null;
}

function createPokerButtons(game) {
    if (game.gamePhase === 'decision') {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('poker_play')
                    .setLabel(`Play (${game.anteBet})`)
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎲'),
                new ButtonBuilder()
                    .setCustomId('poker_fold')
                    .setLabel('Fold')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🚫')
            );
    } else if (game.gamePhase === 'complete') {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('poker_play_again')
                    .setLabel('Play Again')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔄')
            );
    } else {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('poker_calculating')
                    .setLabel('Calculating...')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
            );
    }
}

function createSlotsButtons(game) {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('spin_again')
                .setLabel('Spin Again')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎰')
        );
}

function createBlackjackButtons(game, userId, client, options = {}) {
    // Betting phase buttons
    if (game.bettingPhase) {
        return createBettingPhaseButtons(game, userId, client, options);
    }
    
    // Game over buttons
    if (game.gameOver) {
        return createGameOverButtons(game, userId);
    }
    
    // Main game buttons
    return createMainGameButtons(game, userId, client);
}

function createBettingPhaseButtons(game, userId, client, options = {}) {
    const { bettingPhaseActive = true } = options; // Default to true
    
    const actionRows = [];
    
    // Sort players for consistent order
    const playerIds = Array.from(game.players.keys()).sort();
    
    for (const playerId of playerIds) {
        const player = game.players.get(playerId);
        const hasConfirmedBet = game.readyPlayers.has(playerId);
        
        let username = 'Player';
        try {
            const user = client.users.cache.get(playerId);
            username = user ? user.username : 'Player';
        } catch (error) {
            console.error(`Error fetching username for ${playerId}:`, error);
        }
        
        const buttons = [
            new ButtonBuilder()
                .setCustomId(`keep_bet_${playerId}`)
                .setLabel(`Keep Bet (${player.bet}) - ${username}`)
                .setStyle(ButtonStyle.Primary)
                .setEmoji('✅'),
            new ButtonBuilder()
                .setCustomId(`adjust_bet_${playerId}`)
                .setLabel(`Adjust Bet - ${username}`)
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('✏️'),
            new ButtonBuilder()
                .setCustomId(`leave_table_${playerId}`)
                .setLabel(`Leave Table - ${username}`)
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🚪')
        ];
        
        if (hasConfirmedBet || !bettingPhaseActive) {
            buttons.forEach(button => {
                button.setDisabled(true);
                if (button.data.custom_id.startsWith('keep_bet')) {
                    button.setLabel(`Ready (${game.readyPlayers.get(playerId)}) - ${username}`);
                }
            });
        }
        
        actionRows.push(new ActionRowBuilder().addComponents(buttons));
    }
    
    // If no rows (unlikely), return a disabled row
    if (actionRows.length === 0) {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('not_in_game')
                    .setLabel('Not in Game')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
            );
    }
    
    return actionRows;
}

function createGameOverButtons(game, userId) {
    if (game.isMultiPlayer) {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('continue_playing')
                    .setLabel('Continue Playing')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔄')
            );
    } else {
        if (userId !== Array.from(game.players.keys())[0]) {
            return new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('not_your_game')
                        .setLabel('Not Your Game')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true)
                );
        }
        
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('play_again_single')
                    .setLabel('Play Again')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔄')
            );
    }
}

function createMainGameButtons(game, userId, client) {
    let targetPlayerId;
    
    if (game.isMultiPlayer) {
        targetPlayerId = Array.from(game.players.keys())[game.currentPlayerIndex];
    } else {
        targetPlayerId = Array.from(game.players.keys())[0];
        if (userId !== targetPlayerId) {
            return new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('not_your_game')
                        .setLabel('Not Your Game')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true)
                );
        }
    }

    const player = game.players.get(targetPlayerId);
    if (!player || player.stood || !player.hands[player.currentHandIndex]) {
        let labelText = 'No Active Hand';
        if (game.isMultiPlayer) {
            try {
                const user = client.users.cache.get(targetPlayerId);
                labelText = user ? `${user.username}'s Turn` : "Player's Turn";
            } catch (error) {
                labelText = "Player's Turn";
            }
        }
        
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('inactive')
                    .setLabel(labelText)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
            );
    }

    let username = 'Player';
    if (game.isMultiPlayer) {
        try {
            const user = client.users.cache.get(targetPlayerId);
            username = user ? user.username : 'Player';
        } catch (error) {
            console.error(`Error fetching username for ${targetPlayerId}:`, error);
        }
    }

    const currentHand = player.hands[player.currentHandIndex];
    const userData = getUserData(targetPlayerId);
    const userMoney = userData ? userData.money : 500;
    const currentScore = game.getHandScore(targetPlayerId, player.currentHandIndex);

    // Disable hit if score is 21 or busted
    const canHit = currentScore < 21;

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('hit')
                .setLabel(game.isMultiPlayer ? `Hit (${username})` : 'Hit')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🃏')
                .setDisabled(!canHit),
            new ButtonBuilder()
                .setCustomId('stand')
                .setLabel(game.isMultiPlayer ? `Stand (${username})` : 'Stand')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('✋')
        );

    // Double button
    if (currentHand.cards.length === 2 && !currentHand.doubled && userMoney >= currentHand.bet) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('double')
                .setLabel(game.isMultiPlayer ? `Double (${username})` : 'Double')
                .setStyle(ButtonStyle.Success)
                .setEmoji('💰')
        );
    }

    // Split button
    if (game.canSplit(targetPlayerId) && userMoney >= player.bet) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId('split')
                .setLabel(game.isMultiPlayer ? `Split (${username})` : 'Split')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('✂️')
        );
    }

    return row;
}

// Utility function for creating join table button
function createJoinTableButton() {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('join_table')
                .setLabel('Join Table')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('➕')
        );
}

// Utility function for creating disabled buttons during transitions
function createLoadingButton(message = 'Loading...') {
    return new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('loading')
                .setLabel(message)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true)
        );
}

function createCrapsButtons(game) {
    if (game.gameComplete) {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('craps_play_again')
                    .setLabel('Play Again')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔄')
            );
    } else {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('craps_roll')
                    .setLabel('Roll Dice')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🎲')
            );
    }
}

function createWarButtons(game) {
    if (game.gamePhase === 'tied') {
        // Player can choose to surrender or go to war
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('war_surrender')
                    .setLabel('Surrender (Get Half Back)')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🏳️'),
                new ButtonBuilder()
                    .setCustomId('war_go_to_war')
                    .setLabel('Go to War!')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('⚔️')
            );
    } else if (game.isComplete()) {
        // Game over - show play again button
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('war_play_again')
                    .setLabel('Play Again')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔄')
            );
    }

    return null;
}

function createCoinFlipButtons(game) {
    if (game.gameComplete) {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`coinflip_play_again_${game.bet}`)
                    .setLabel('Flip Again')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🔄')
            );
    }
    return null;
}

function createHorseRaceButtons(game) {
    if (game.gameComplete) {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`race_again_${game.bet}`)
                    .setLabel('Race Again')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🏇')
            );
    }
    return null;
}

function createCrashButtons(game) {
    if (!game.gameComplete) {
        // Show "Continue" and "Cash Out" buttons during the game
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('crash_continue')
                    .setLabel('🚀 Continue')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('crash_cashout')
                    .setLabel(`💰 Cash Out (${Math.floor(game.betAmount * game.currentMultiplier).toLocaleString()})`)
                    .setStyle(ButtonStyle.Success)
            );
        return row;
    } else {
        // Show "Play Again" button when game is complete
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('crash_play_again')
                    .setLabel('🚀 Play Again')
                    .setStyle(ButtonStyle.Primary)
            );
        return row;
    }
}

function createBingoButtons(game) {
    if (game.gameComplete) {
        // No buttons when game is complete
        return null;
    }

    if (game.gameStarted) {
        // Show "Call Number" button during game
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('bingo_call')
                    .setLabel('🎱 Call Number')
                    .setStyle(ButtonStyle.Success)
            );
        return row;
    }

    // Lobby phase handled by command, not here
    return null;
}

function createTournamentButtons(tournament, userId) {
    if (tournament.tournamentComplete) {
        // No buttons when tournament is complete
        return null;
    }

    if (!tournament.tournamentStarted) {
        // Lobby phase handled by command
        return null;
    }

    if (tournament.phase === 'handComplete') {
        // Show "Next Hand" button
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('tournament_next_hand')
                    .setLabel('Next Hand')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('▶️')
            );
        return row;
    }

    // Game in progress - show generic action buttons
    // Buttons work for all players - the handler will check individual player state
    const row = new ActionRowBuilder();

    // Fold button (always available)
    row.addComponents(
        new ButtonBuilder()
            .setCustomId('tournament_fold')
            .setLabel('Fold')
            .setStyle(ButtonStyle.Danger)
    );

    // Check/Call button (generic - will work for both)
    row.addComponents(
        new ButtonBuilder()
            .setCustomId('tournament_check_call')
            .setLabel('Check / Call')
            .setStyle(ButtonStyle.Primary)
    );

    // Raise button
    row.addComponents(
        new ButtonBuilder()
            .setCustomId('tournament_raise')
            .setLabel('Raise')
            .setStyle(ButtonStyle.Success)
    );

    return row;
}

function createHiLoButtons(game) {
    if (game.gameComplete) {
        // Show "Play Again" button
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('hilo_play_again')
                    .setLabel('Play Again')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎴')
            );
        return row;
    }

    // Show Higher, Lower, Cash Out buttons
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('hilo_higher')
                .setLabel('⬆️ Higher')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('hilo_lower')
                .setLabel('⬇️ Lower')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('hilo_cashout')
                .setLabel(`💰 Cash Out (${game.currentWinnings.toLocaleString()})`)
                .setStyle(ButtonStyle.Primary)
                .setDisabled(game.streak === 0)
        );

    return row;
}

module.exports = {
    createButtons,
    createPokerButtons,
    createSlotsButtons,
    createBlackjackButtons,
    createBettingPhaseButtons,
    createGameOverButtons,
    createMainGameButtons,
    createCrapsButtons,
    createWarButtons,
    createCoinFlipButtons,
    createHorseRaceButtons,
    createCrashButtons,
    createBingoButtons,
    createTournamentButtons,
    createHiLoButtons,
    createJoinTableButton,
    createLoadingButton
};