const { getUserMoney, setUserMoney } = require('../utils/data');
const { createGameEmbed } = require('../utils/embeds');
const { createButtons, createJoinTableButton } = require('../utils/buttons');
const BlackjackGame = require('../gameLogic/blackjackGame');

async function handleModalSubmit(interaction, activeGames, client, dealCardsWithDelay) {
    const { customId, user } = interaction;

    if (customId === 'submit_bet') {
        await handleJoinTableSubmission(interaction, activeGames, client);
    } else if (customId === 'submit_adjusted_bet') {
        await handleAdjustedBetSubmission(interaction, activeGames, client, dealCardsWithDelay);
    } else if (customId === 'submit_perfect_pairs_bet') {
        await handlePerfectPairsBetSubmission(interaction, activeGames, client);
    } else if (customId === 'submit_insurance_bet') {
        await handleInsuranceBetSubmission(interaction, activeGames, client);
    }
}

async function handleJoinTableSubmission(interaction, activeGames, client) {
    const game = activeGames.get(interaction.channelId);
    if (!game || !game.isMultiPlayer) {
        return interaction.reply({ content: '❌ No active table found!', ephemeral: true });
    }
    if (game.dealingPhase > 0) {
        return interaction.reply({ content: '❌ Game has already started!', ephemeral: true });
    }
    if (game.players.has(interaction.user.id)) {
        return interaction.reply({ content: '❌ You\'re already in the game!', ephemeral: true });
    }
    if (activeGames.has(interaction.user.id)) {
        return interaction.reply({ content: '❌ You already have an active single-player game!', ephemeral: true });
    }

    const betInput = interaction.fields.getTextInputValue('bet_amount');
    const bet = parseInt(betInput);
    
    if (isNaN(bet) || bet < 10 || bet > 500000) {
        return interaction.reply({ content: '❌ Invalid bet! Must be between 10 and 500,000.', ephemeral: true });
    }

    const userMoney = await getUserMoney(interaction.user.id);
    if (userMoney < bet) {
        return interaction.reply({ content: `❌ You don't have enough money! You have ${userMoney.toLocaleString()}.`, ephemeral: true });
    }

    await setUserMoney(interaction.user.id, userMoney - bet);
    if (!game.addPlayer(interaction.user.id, bet)) {
        return interaction.reply({ content: '❌ Table is full or game has started!', ephemeral: true });
    }

    await interaction.reply({ content: `✅ You joined the table with a bet of ${bet.toLocaleString()}!`, ephemeral: true });

    try {
        const embed = await createGameEmbed(game, interaction.user.id, client);
        const countdown = Math.max(0, 30 - Math.floor((Date.now() - game.interactionStartTime) / 1000));
        embed.setDescription(`🃏 Blackjack table started! Click to join (${countdown} seconds remaining).`);
        
        const buttons = createJoinTableButton();
        await interaction.message.edit({ embeds: [embed], components: [buttons] });
    } catch (error) {
        console.error('Error updating game message:', error);
        await interaction.followUp({
            content: '⚠️ Failed to update the game message. Your bet was placed, but the table may not reflect it.',
            ephemeral: true
        });
    }
}

async function handleAdjustedBetSubmission(interaction, activeGames, client, dealCardsWithDelay) {
    const betInput = interaction.fields.getTextInputValue('bet_amount');
    const bet = parseInt(betInput);

    if (isNaN(bet) || bet < 10 || bet > 500000) {
        return interaction.reply({
            content: '❌ Invalid bet! Please enter a number between 10 and 500,000.',
            ephemeral: true
        });
    }

    const game = activeGames.get(interaction.channelId);
    if (!game || !game.isMultiPlayer || !game.bettingPhase) {
        return interaction.reply({
            content: '❌ No active betting phase found!',
            ephemeral: true
        });
    }

    if (!game.players.has(interaction.user.id)) {
        return interaction.reply({
            content: '❌ You are not part of this game!',
            ephemeral: true
        });
    }

    const player = game.players.get(interaction.user.id);
    const oldBet = player.bet / (player.hasSplit ? 2 : 1);
    const userMoney = await getUserMoney(interaction.user.id);
    
    if (userMoney + oldBet < bet) {
        return interaction.reply({
            content: `❌ You don't have enough money! You have ${(userMoney + oldBet).toLocaleString()}.`,
            ephemeral: true
        });
    }

    // Refund the old bet and confirm the new one
    await setUserMoney(interaction.user.id, userMoney + oldBet);
    game.confirmBet(interaction.user.id, bet);
    
    await interaction.reply({
        content: `✅ You adjusted your bet to ${bet.toLocaleString()}!`,
        ephemeral: true
    });

    if (game.allPlayersReady()) {
        const { startNewRoundFromBetting } = require('./buttonHandler');
        await startNewRoundFromBetting(game, interaction, activeGames, client, dealCardsWithDelay);
    } else {
        const { updateBettingDisplay } = require('./buttonHandler');
        await updateBettingDisplay(game, interaction, client);
    }
}

async function handlePerfectPairsBetSubmission(interaction, activeGames, client) {
    const betInput = interaction.fields.getTextInputValue('sidebet_amount');
    const bet = parseInt(betInput);

    if (isNaN(bet) || bet < 1 || bet > 100) {
        return interaction.reply({
            content: '❌ Invalid bet! Perfect Pairs bet must be between 1 and 100.',
            ephemeral: true
        });
    }

    const game = activeGames.get(interaction.user.id) || activeGames.get(interaction.channelId);
    if (!game) {
        return interaction.reply({ content: '❌ No active game found!', ephemeral: true });
    }

    const userMoney = await getUserMoney(interaction.user.id);
    if (userMoney < bet) {
        return interaction.reply({
            content: `❌ You don't have enough money! You have ${userMoney.toLocaleString()}.`,
            ephemeral: true
        });
    }

    if (!game.addSideBet(interaction.user.id, 'perfectPairs', bet)) {
        return interaction.reply({
            content: '❌ Cannot place Perfect Pairs bet at this time!',
            ephemeral: true
        });
    }

    await setUserMoney(interaction.user.id, userMoney - bet);
    await interaction.reply({
        content: `✅ Perfect Pairs side bet placed: ${bet.toLocaleString()}!`,
        ephemeral: true
    });

    // Update the game display
    try {
        const embed = await createGameEmbed(game, interaction.user.id, client);
        const buttons = createButtons(game, interaction.user.id, client);
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
        console.error('Error updating game message after Perfect Pairs bet:', error);
    }
}

async function handleInsuranceBetSubmission(interaction, activeGames, client) {
    const betInput = interaction.fields.getTextInputValue('sidebet_amount');
    const bet = parseInt(betInput);

    if (isNaN(bet) || bet < 1 || bet > 50) {
        return interaction.reply({
            content: '❌ Invalid bet! Insurance bet must be between 1 and 50.',
            ephemeral: true
        });
    }

    const game = activeGames.get(interaction.user.id) || activeGames.get(interaction.channelId);
    if (!game) {
        return interaction.reply({ content: '❌ No active game found!', ephemeral: true });
    }

    const userMoney = await getUserMoney(interaction.user.id);
    if (userMoney < bet) {
        return interaction.reply({
            content: `❌ You don't have enough money! You have ${userMoney.toLocaleString()}.`,
            ephemeral: true
        });
    }

    if (!game.addSideBet(interaction.user.id, 'insurance', bet)) {
        return interaction.reply({
            content: '❌ Cannot place insurance bet at this time!',
            ephemeral: true
        });
    }

    await setUserMoney(interaction.user.id, userMoney - bet);
    await interaction.reply({
        content: `✅ Insurance side bet placed: ${bet.toLocaleString()}!`,
        ephemeral: true
    });

    // Update the game display
    try {
        const embed = await createGameEmbed(game, interaction.user.id, client);
        const buttons = createButtons(game, interaction.user.id, client);
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
        console.error('Error updating game message after insurance bet:', error);
    }
}

async function startNewRoundFromBetting(game, interaction, activeGames, client, dealCardsWithDelay) {
    const previousPlayers = new Map(game.players);
    const playerBets = new Map(game.readyPlayers);

    // Validate all players have enough money
    for (const [playerId, bet] of playerBets) {
        const userMoney = await getUserMoney(playerId);
        if (userMoney < bet) {
            let username = 'Unknown User';
            try {
                const user = await client.users.fetch(playerId);
                username = user.username;
            } catch (error) {
                console.error(`Error fetching user ${playerId}:`, error);
            }
            return interaction.followUp({
                content: `❌ ${username} doesn't have enough money (${userMoney.toLocaleString()}) for their bet of ${bet.toLocaleString()}!`,
                ephemeral: true
            });
        }
    }

    // Deduct bets from all players
    for (const [playerId, bet] of playerBets) {
        const userMoney = await getUserMoney(playerId);
        await setUserMoney(playerId, userMoney - bet);
    }

    // Start new game with confirmed bets
    const creatorId = Array.from(previousPlayers.keys())[0];
    const creatorBet = playerBets.get(creatorId);
    const newGame = new BlackjackGame(interaction.channelId, creatorId, creatorBet, true);
    
    // Add other players
    for (const [playerId, bet] of playerBets) {
        if (playerId !== creatorId) {
            newGame.addPlayer(playerId, bet);
        }
    }

    // Update game state
    activeGames.delete(interaction.channelId);
    activeGames.set(interaction.channelId, newGame);
    newGame.interactionId = interaction.id;
    newGame.interactionStartTime = Date.now();
    newGame.sideBetPhase = true; // Start side bet phase

    // Start side bet countdown
    try {
        const embed = await createGameEmbed(newGame, interaction.user.id, client);
        embed.setDescription('⏰ Place your side bets! 15 seconds remaining...');
        const buttons = createButtons(newGame, interaction.user.id, client);
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

        let countdown = 15;
        const countdownInterval = setInterval(async () => {
            countdown--;
            if (countdown <= 0 || !newGame.sideBetPhase) {
                clearInterval(countdownInterval);
                newGame.sideBetPhase = false;
                await dealCardsWithDelay(interaction, interaction.message, newGame, interaction.user.id, 1000);
                return;
            }

            const embed = await createGameEmbed(newGame, interaction.user.id, client);
            embed.setDescription(`⏰ Place your side bets! ${countdown} seconds remaining...`);
            const buttons = createButtons(newGame, interaction.user.id, client);
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
                console.error('Error updating countdown:', error);
            }
        }, 1000);
    } catch (error) {
        console.error('Error starting new round:', error);
        await interaction.followUp({
            content: '⚠️ Failed to start the new round. Please try again.',
            ephemeral: true
        });
    }
}

module.exports = { handleModalSubmit, startNewRoundFromBetting };