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

module.exports = {
    createButtons,
    createPokerButtons,
    createSlotsButtons,
    createBlackjackButtons,
    createBettingPhaseButtons,
    createGameOverButtons,
    createMainGameButtons,
    createJoinTableButton,
    createLoadingButton
};