const { getUserMoney, setUserMoney, recordGameResult } = require('../utils/data');
const { createGameEmbed } = require('../utils/embeds');
const { createButtons, createJoinTableButton } = require('../utils/buttons');
const BlackjackGame = require('../gameLogic/blackjackGame');
const RouletteGame = require('../gameLogic/rouletteGame');
const CrapsGame = require('../gameLogic/crapsGame');
const LotteryGame = require('../gameLogic/lotteryGame');
const CrashGame = require('../gameLogic/crashGame');
const HiLoGame = require('../gameLogic/hiLoGame');
const { EmbedBuilder } = require('discord.js');

async function handleModalSubmit(interaction, activeGames, client, dealCardsWithDelay, rouletteSessions) {
    const { customId, user } = interaction;

    if (customId === 'submit_bet') {
        await handleJoinTableSubmission(interaction, activeGames, client);
    } else if (customId === 'submit_adjusted_bet') {
        await handleAdjustedBetSubmission(interaction, activeGames, client, dealCardsWithDelay);
    } else if (customId === 'submit_roulette_bets') {
        await handleRouletteModal(interaction, activeGames, client);
    } else if (customId === 'roulette_number_bet') {
        await handleRouletteNumberBet(interaction, rouletteSessions);
    } else if (customId === 'craps_place_bets') {
        await handleCrapsModal(interaction, activeGames, client);
    } else if (customId === 'lottery_pick_numbers') {
        await handleLotteryNumbers(interaction, client);
    } else if (customId === 'crash_place_bet') {
        await handleCrashModal(interaction, activeGames, client);
    } else if (customId === 'tournament_raise_amount') {
        await handleTournamentRaise(interaction, activeGames, client);
    } else if (customId === 'hilo_place_bet') {
        await handleHiLoModal(interaction, activeGames, client);
    }
}

async function handleRouletteModal(interaction, activeGames, client) {
    try {
        const betsInput = interaction.fields.getTextInputValue('roulette_bets');
        const userId = interaction.user.id;

        // Parse bets input
        const bets = {};
        const betLines = betsInput.split(/[,\n]/).map(line => line.trim()).filter(line => line);

        let totalBetAmount = 0;

        for (const betLine of betLines) {
            const parts = betLine.split(':');
            if (parts.length !== 2) {
                return interaction.reply({
                    content: '❌ Invalid bet format! Use format like "red:50" or "7:25"',
                    ephemeral: true
                });
            }

            const betType = parts[0].trim().toLowerCase();
            const betAmount = parseInt(parts[1].trim());

            if (isNaN(betAmount) || betAmount < 1) {
                return interaction.reply({
                    content: '❌ Bet amounts must be positive numbers!',
                    ephemeral: true
                });
            }

            if (betAmount > 100000) {
                return interaction.reply({
                    content: '❌ Maximum bet per type is 100,000!',
                    ephemeral: true
                });
            }

            if (!RouletteGame.isValidBetType(betType)) {
                return interaction.reply({
                    content: `❌ Invalid bet type: "${betType}". Valid types: red, black, green, odd, even, low, high, 1st12, 2nd12, 3rd12, col1, col2, col3, or any number 0-36/00`,
                    ephemeral: true
                });
            }

            // Accumulate bets of the same type
            if (bets[betType]) {
                bets[betType] += betAmount;
            } else {
                bets[betType] = betAmount;
            }

            totalBetAmount += betAmount;
        }

        if (Object.keys(bets).length === 0) {
            return interaction.reply({
                content: '❌ You must place at least one bet!',
                ephemeral: true
            });
        }

        if (totalBetAmount > 500000) {
            return interaction.reply({
                content: '❌ Maximum total bet is 500,000!',
                ephemeral: true
            });
        }

        // Check user has enough money
        const userMoney = await getUserMoney(userId);
        if (userMoney < totalBetAmount) {
            return interaction.reply({
                content: `❌ You don't have enough money! You have ${userMoney.toLocaleString()}, but need ${totalBetAmount.toLocaleString()}.`,
                ephemeral: true
            });
        }

        // Deduct money
        await setUserMoney(userId, userMoney - totalBetAmount);

        // Create and play the game
        const rouletteGame = new RouletteGame(userId, bets);

        // Award winnings
        const currentMoney = await getUserMoney(userId);
        await setUserMoney(userId, currentMoney + rouletteGame.totalWinnings);

        // Record game result
        const gameResult = rouletteGame.totalWinnings > totalBetAmount ? 'win' :
            rouletteGame.totalWinnings === totalBetAmount ? 'push' : 'lose';
        await recordGameResult(userId, 'roulette', totalBetAmount, rouletteGame.totalWinnings, gameResult, {
            winningNumber: rouletteGame.winningNumber,
            betsPlaced: Object.keys(bets).length
        });

        // Store game for play again functionality
        activeGames.set(`roulette_${userId}`, rouletteGame);

        // Create and send response
        const embed = await createGameEmbed(rouletteGame, userId, client);
        const buttons = createButtons(rouletteGame, userId, client);

        await interaction.reply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });

    } catch (error) {
        console.error('Error in roulette modal:', error);
        await interaction.reply({
            content: '❌ An error occurred while processing your bets. Please try again.',
            ephemeral: true
        });
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
    // Get the bet input from the modal
    const betInput = interaction.fields.getTextInputValue('bet_amount');

    // Clean and parse the input
    const cleanedInput = betInput.toString().trim().replace(/,/g, '');

    const bet = parseInt(cleanedInput, 10);

    // Validation should now work correctly
    if (isNaN(bet) || bet < 10 || bet > 500000) {
        return interaction.reply({
            content: `❌ Invalid bet! You entered: "${betInput}". Please enter a number between 10 and 500,000.`,
            ephemeral: true
        });
    }

    // Get the game from activeGames
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
            content: `❌ You don't have enough money! You have ${userMoney + oldBet}.`,
            ephemeral: true
        });
    }

    // Refund the old bet and confirm the new one
    await setUserMoney(interaction.user.id, userMoney + oldBet);
    game.confirmBet(interaction.user.id, bet);

    await interaction.reply({
        content: `✅ You adjusted your bet to ${bet}!`,
        ephemeral: true
    });

    // Check if all players are ready and start new round
    if (game.allPlayersReady()) {
        // Use the startNewRoundFromBetting function that you already have
        await startNewRoundFromBetting(game, interaction, activeGames, client, dealCardsWithDelay);
    } else {
        // Not all players ready yet - just update the display
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

        try {
            await interaction.message.edit({
                embeds: [embed],
                components: components
            });
        } catch (error) {
            console.error('Error updating game message after bet adjustment:', error);
            await interaction.followUp({
                content: '⚠️ Failed to update the game message. Your bet was adjusted, but the table may not reflect it.',
                ephemeral: true
            });
        }
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

    // Deal cards immediately
    try {
        await dealCardsWithDelay(interaction, interaction.message, newGame, interaction.user.id, 1000);
    } catch (error) {
        console.error('Error starting new round:', error);
        await interaction.followUp({
            content: '⚠️ Failed to start the new round. Please try again.',
            ephemeral: true
        });
    }
}

async function handleRouletteNumberBet(interaction, rouletteSessions) {
    const { ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');

    try {
        const numberInput = interaction.fields.getTextInputValue('number_input').trim();
        const userId = interaction.user.id;
        const messageId = interaction.message.id;

        const session = rouletteSessions.get(messageId);
        if (!session || session.userId !== userId) {
            return interaction.reply({
                content: '❌ This is not your betting session!',
                ephemeral: true
            });
        }

        // Validate number
        if (!RouletteGame.isValidBetType(numberInput)) {
            return interaction.reply({
                content: `❌ Invalid number! Must be 0-36 or 00.`,
                ephemeral: true
            });
        }

        // Add bet
        if (!session.bets[numberInput]) {
            session.bets[numberInput] = 0;
        }
        session.bets[numberInput] += session.currentChip;
        session.totalBet += session.currentChip;

        // Update the betting interface
        const userMoney = await getUserMoney(session.userId);

        let betsDisplay = '';
        for (const [betType, amount] of Object.entries(session.bets)) {
            const displayName = RouletteGame.getBetTypeDisplayName ? RouletteGame.getBetTypeDisplayName(betType) : betType;
            betsDisplay += `${displayName}: ${amount.toLocaleString()}\n`;
        }

        const embed = new EmbedBuilder()
            .setTitle('🎰 American Roulette - Place Your Bets')
            .setDescription(`Select your chip value, then click betting areas below.\n\n**Current Chip:** ${session.currentChip}\n**Total Bet:** ${session.totalBet.toLocaleString()}\n**Your Balance:** ${userMoney.toLocaleString()}`)
            .setColor('#FFD700')
            .addFields(
                {
                    name: '🎯 Your Bets',
                    value: betsDisplay,
                    inline: false
                }
            );

        // Rebuild buttons
        const chip10Btn = new ButtonBuilder()
            .setCustomId('roulette_chip_10')
            .setLabel('$10')
            .setStyle(session.currentChip === 10 ? ButtonStyle.Success : ButtonStyle.Primary);
        if (session.currentChip === 10) chip10Btn.setEmoji('🪙');

        const chipRow = new ActionRowBuilder()
            .addComponents(
                chip10Btn,
                new ButtonBuilder()
                    .setCustomId('roulette_chip_25')
                    .setLabel('$25')
                    .setStyle(session.currentChip === 25 ? ButtonStyle.Success : ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('roulette_chip_50')
                    .setLabel('$50')
                    .setStyle(session.currentChip === 50 ? ButtonStyle.Success : ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('roulette_chip_100')
                    .setLabel('$100')
                    .setStyle(session.currentChip === 100 ? ButtonStyle.Success : ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('roulette_chip_500')
                    .setLabel('$500')
                    .setStyle(session.currentChip === 500 ? ButtonStyle.Success : ButtonStyle.Primary)
            );

        const colorRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('roulette_bet_red')
                    .setLabel('Red (2:1)')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('roulette_bet_black')
                    .setLabel('Black (2:1)')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('roulette_bet_green')
                    .setLabel('Green (17:1)')
                    .setStyle(ButtonStyle.Success)
            );

        const evenMoneyRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('roulette_bet_odd')
                    .setLabel('Odd (2:1)')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('roulette_bet_even')
                    .setLabel('Even (2:1)')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('roulette_bet_low')
                    .setLabel('1-18 (2:1)')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('roulette_bet_high')
                    .setLabel('19-36 (2:1)')
                    .setStyle(ButtonStyle.Primary)
            );

        const dozenRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('roulette_bet_1st12')
                    .setLabel('1st 12 (3:1)')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('roulette_bet_2nd12')
                    .setLabel('2nd 12 (3:1)')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('roulette_bet_3rd12')
                    .setLabel('3rd 12 (3:1)')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('roulette_bet_number')
                    .setLabel('Pick Number (35:1)')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🔢')
            );

        const actionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('roulette_clear_bets')
                    .setLabel('Clear Bets')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🗑️'),
                new ButtonBuilder()
                    .setCustomId('roulette_spin')
                    .setLabel('SPIN!')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('🎰')
                    .setDisabled(session.totalBet === 0)
            );

        await interaction.update({
            embeds: [embed],
            components: [chipRow, colorRow, evenMoneyRow, dozenRow, actionRow]
        });

    } catch (error) {
        console.error('Error handling roulette number bet:', error);
        await interaction.reply({
            content: '❌ An error occurred. Please try again.',
            ephemeral: true
        });
    }
}

async function handleCrapsModal(interaction, activeGames, client) {
    try {
        const userId = interaction.user.id;

        // Get bet values from modal
        const passLineInput = interaction.fields.getTextInputValue('pass_line_bet');
        const dontPassInput = interaction.fields.getTextInputValue('dont_pass_bet');
        const fieldInput = interaction.fields.getTextInputValue('field_bet');

        const passLineBet = passLineInput ? parseInt(passLineInput) : 0;
        const dontPassBet = dontPassInput ? parseInt(dontPassInput) : 0;
        const fieldBet = fieldInput ? parseInt(fieldInput) : 0;

        // Validation
        if (passLineBet < 0 || dontPassBet < 0 || fieldBet < 0) {
            return interaction.reply({
                content: '❌ Bets cannot be negative!',
                ephemeral: true
            });
        }

        if (passLineBet > 0 && dontPassBet > 0) {
            return interaction.reply({
                content: '❌ You cannot bet on both Pass Line and Don\'t Pass at the same time!',
                ephemeral: true
            });
        }

        const totalBet = passLineBet + dontPassBet + fieldBet;

        if (totalBet < 10) {
            return interaction.reply({
                content: '❌ Total bet must be at least $10!',
                ephemeral: true
            });
        }

        if (totalBet > 10000) {
            return interaction.reply({
                content: '❌ Maximum total bet is $10,000!',
                ephemeral: true
            });
        }

        // Check user has enough money
        const userMoney = await getUserMoney(userId);
        if (userMoney < totalBet) {
            return interaction.reply({
                content: `❌ You don't have enough money! You have ${userMoney.toLocaleString()}, need ${totalBet.toLocaleString()}.`,
                ephemeral: true
            });
        }

        // Deduct money
        await setUserMoney(userId, userMoney - totalBet);

        // Create game
        const crapsGame = new CrapsGame(userId, passLineBet, dontPassBet, fieldBet, 0);
        activeGames.set(`craps_${userId}`, crapsGame);

        // Send game display
        const embed = await createGameEmbed(crapsGame, userId, client);
        const buttons = createButtons(crapsGame, userId, client);

        await interaction.reply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });

    } catch (error) {
        console.error('Error in craps modal:', error);
        await interaction.reply({
            content: '❌ An error occurred while placing your bets. Please try again.',
            ephemeral: true
        });
    }
}

async function handleLotteryNumbers(interaction, client) {
    try {
        const numbersInput = interaction.fields.getTextInputValue('lottery_numbers');
        const userId = interaction.user.id;
        const ticketPrice = 100;

        // Parse numbers
        const numberStrings = numbersInput.trim().split(/\s+/);
        const numbers = numberStrings.map(n => parseInt(n)).filter(n => !isNaN(n));

        if (numbers.length !== 5) {
            return interaction.reply({
                content: `❌ You must pick exactly 5 numbers! You entered ${numbers.length}.`,
                ephemeral: true
            });
        }

        // Check if user has enough money
        const userMoney = await getUserMoney(userId);
        if (userMoney < ticketPrice) {
            return interaction.reply({
                content: `❌ You don't have enough money! Tickets cost ${ticketPrice.toLocaleString()}. You have ${userMoney.toLocaleString()}.`,
                ephemeral: true
            });
        }

        // Get or create global lottery
        if (!client.currentLottery) {
            client.currentLottery = new LotteryGame();
            // Schedule draw for 10 minutes from now
            client.currentLottery.drawTime = Date.now() + (10 * 60 * 1000);
            client.currentLottery.drawScheduled = true;

            // Schedule the draw
            setTimeout(async () => {
                await drawLottery(client);
            }, 10 * 60 * 1000);
        }

        const lottery = client.currentLottery;

        // Buy ticket
        const result = lottery.buyTicket(userId, numbers);

        if (!result.success) {
            return interaction.reply({
                content: `❌ ${result.reason}`,
                ephemeral: true
            });
        }

        // Deduct money
        await setUserMoney(userId, userMoney - ticketPrice);

        // Send confirmation
        const embed = new EmbedBuilder()
            .setTitle('🎫 Lottery Ticket Purchased! 🎫')
            .setColor('#00FF00')
            .setDescription(
                `**Your Numbers:** ${result.numbers.join(', ')}\n\n` +
                `**Ticket ID:** \`${result.ticketId}\`\n` +
                `**Cost:** ${ticketPrice.toLocaleString()}\n\n` +
                `**Current Prize Pool:** ${lottery.prizePool.toLocaleString()}\n` +
                `**Estimated Jackpot:** ${lottery.getEstimatedJackpot().toLocaleString()}\n\n` +
                `⏰ Draw will occur in approximately **${Math.floor((lottery.drawTime - Date.now()) / 60000)} minutes**\n\n` +
                `Good luck! 🍀`
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('Error in lottery numbers modal:', error);
        await interaction.reply({
            content: '❌ An error occurred while purchasing your ticket. Please try again.',
            ephemeral: true
        });
    }
}

async function drawLottery(client) {
    const lottery = client.currentLottery;
    if (!lottery || lottery.gameComplete) return;

    console.log(`Drawing lottery with ${lottery.getTotalTickets()} tickets and prize pool of ${lottery.prizePool}`);

    // Draw winning numbers
    lottery.draw();

    // Award prizes to winners
    for (const winner of lottery.winners) {
        const currentMoney = await getUserMoney(winner.userId);
        await setUserMoney(winner.userId, currentMoney + winner.prize);

        // Record game result
        await recordGameResult(winner.userId, 'lottery', 100, winner.prize - 100, 'win', {
            matches: winner.matches,
            numbers: winner.numbers,
            winningNumbers: lottery.winningNumbers
        });

        // Try to DM the winner
        try {
            const user = await client.users.fetch(winner.userId);
            const embed = new EmbedBuilder()
                .setTitle('🎰 LOTTERY WINNER! 🎰')
                .setColor('#FFD700')
                .setDescription(
                    `**Congratulations!** You won the lottery!\n\n` +
                    `**Your Numbers:** ${winner.numbers.join(', ')}\n` +
                    `**Winning Numbers:** ${lottery.winningNumbers.join(', ')}\n` +
                    `**Matches:** ${winner.matches}/5\n\n` +
                    `💰 **Prize:** ${winner.prize.toLocaleString()}`
                )
                .setTimestamp();

            await user.send({ embeds: [embed] });
        } catch (error) {
            console.log(`Could not DM lottery winner ${winner.userId}`);
        }
    }

    // Clear the lottery
    client.currentLottery = null;
}

async function handleCrashModal(interaction, activeGames, client) {
    try {
        const betInput = interaction.fields.getTextInputValue('bet_amount');
        const targetInput = interaction.fields.getTextInputValue('target_multiplier');
        const userId = interaction.user.id;

        // Parse bet amount
        const betAmount = parseInt(betInput);
        if (isNaN(betAmount) || betAmount < 10 || betAmount > 10000) {
            return interaction.reply({
                content: '❌ Bet amount must be between $10 and $10,000!',
                ephemeral: true
            });
        }

        // Parse target multiplier
        const targetMultiplier = parseFloat(targetInput);
        if (isNaN(targetMultiplier) || targetMultiplier < 1.01 || targetMultiplier > 100.00) {
            return interaction.reply({
                content: '❌ Target multiplier must be between 1.01x and 100.00x!',
                ephemeral: true
            });
        }

        // Check user has enough money
        const userMoney = await getUserMoney(userId);
        if (userMoney < betAmount) {
            return interaction.reply({
                content: `❌ You don't have enough money! You have ${userMoney.toLocaleString()}, but need ${betAmount.toLocaleString()}.`,
                ephemeral: true
            });
        }

        // Deduct bet
        await setUserMoney(userId, userMoney - betAmount);

        // Create game
        const crashGame = new CrashGame(userId, betAmount, targetMultiplier);
        activeGames.set(`crash_${userId}`, crashGame);

        // Send initial embed
        const embed = await createGameEmbed(crashGame, userId, client);
        const buttons = createButtons(crashGame, userId, client);

        await interaction.reply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });

    } catch (error) {
        console.error('Error in crash modal:', error);
        await interaction.reply({
            content: '❌ An error occurred while processing your bet. Please try again.',
            ephemeral: true
        });
    }
}

async function handleTournamentRaise(interaction, activeGames, client) {
    try {
        const raiseInput = interaction.fields.getTextInputValue('raise_amount');
        const userId = interaction.user.id;
        const channelId = interaction.channelId;

        const tournament = activeGames.get(`tournament_${channelId}`);
        if (!tournament) {
            return interaction.reply({
                content: '❌ No active tournament found!',
                ephemeral: true
            });
        }

        if (tournament.getCurrentPlayer() !== userId) {
            return interaction.reply({
                content: '❌ It\'s not your turn!',
                ephemeral: true
            });
        }

        const raiseAmount = parseInt(raiseInput);
        if (isNaN(raiseAmount) || raiseAmount < 1) {
            return interaction.reply({
                content: '❌ Raise amount must be a positive number!',
                ephemeral: true
            });
        }

        const player = tournament.players.get(userId);
        if (raiseAmount > player.chips) {
            return interaction.reply({
                content: `❌ You only have ${player.chips} chips!`,
                ephemeral: true
            });
        }

        tournament.raise(userId, raiseAmount);

        await interaction.deferUpdate();
        const { createGameEmbed } = require('../utils/embeds');
        const { createButtons } = require('../utils/buttons');

        const embed = await createGameEmbed(tournament, userId, client);
        const buttons = createButtons(tournament, userId, client);

        await interaction.message.edit({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });

    } catch (error) {
        console.error('Error in tournament raise modal:', error);
        await interaction.reply({
            content: '❌ An error occurred while processing your raise. Please try again.',
            ephemeral: true
        });
    }
}

async function handleHiLoModal(interaction, activeGames, client) {
    try {
        const betInput = interaction.fields.getTextInputValue('bet_amount');
        const userId = interaction.user.id;

        // Parse bet amount
        const betAmount = parseInt(betInput);
        if (isNaN(betAmount) || betAmount < 10 || betAmount > 10000) {
            return interaction.reply({
                content: '❌ Bet amount must be between $10 and $10,000!',
                ephemeral: true
            });
        }

        // Check user has enough money
        const userMoney = await getUserMoney(userId);
        if (userMoney < betAmount) {
            return interaction.reply({
                content: `❌ You don't have enough money! You have ${userMoney.toLocaleString()}, but need ${betAmount.toLocaleString()}.`,
                ephemeral: true
            });
        }

        // Deduct bet
        await setUserMoney(userId, userMoney - betAmount);

        // Create game
        const hiLoGame = new HiLoGame(userId, betAmount);
        activeGames.set(`hilo_${userId}`, hiLoGame);

        // Send initial embed
        const embed = await createGameEmbed(hiLoGame, userId, client);
        const buttons = createButtons(hiLoGame, userId, client);

        await interaction.reply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });

    } catch (error) {
        console.error('Error in hilo modal:', error);
        await interaction.reply({
            content: '❌ An error occurred while processing your bet. Please try again.',
            ephemeral: true
        });
    }
}

module.exports = { handleModalSubmit, startNewRoundFromBetting };