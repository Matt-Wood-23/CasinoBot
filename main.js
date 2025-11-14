
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Import utilities
const { loadUserData } = require('./database/queries');
const { createGameEmbed } = require('./utils/embeds');
const { createButtons } = require('./utils/buttons');
const { isNaturalBlackjack } = require('./utils/cardHelpers');

// Import game classes
const BlackjackGame = require('./gameLogic/blackjackGame');
const SlotsGame = require('./gameLogic/slotsGame');
const ThreeCardPokerGame = require('./gameLogic/threeCardPokerGame');
const RouletteGame = require('./gameLogic/rouletteGame');
const CrapsGame = require('./gameLogic/crapsGame');
const WarGame = require('./gameLogic/warGame');

// Import configuration
const { token, ALLOWED_CHANNEL_IDS, ADMIN_USER_ID, liam } = require('./config');

// Create client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Game storage
let activeGames = new Map();

// Roulette betting sessions storage
// Format: Map<messageId, { userId, bets: {}, currentChip: 10, totalBet: 0 }>
let rouletteSessions = new Map();

// Command collection
client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        console.log(`Loaded command: ${command.data.name}`);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
    }
}

// Helper functions moved to utils/cardHelpers.js

async function dealCardsWithDelay(interaction, message, game, userId, delay = 1000) {
    const { getUserMoney, setUserMoney, recordGameResult, getServerJackpot, resetJackpot } = require('./database/queries');

    // Prevent concurrent dealing for the same game
    if (game.isDealing) {
        console.log(`Game ${game.gameId} is already dealing, skipping duplicate call`);
        return;
    }

    game.isDealing = true;
    const currentGameId = game.gameId;

    while (game.dealingPhase < 5 && !game.gameOver && game.gameId === currentGameId) {
        game.dealNextCard();
        
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
            await message.edit({
                embeds: [embed],
                components: components
            });
        } catch (error) {
            console.error('Error updating game message during dealing:', error);

            // Refund the bet if message update fails
            try {
                const totalBet = game.getTotalBet(userId);
                const currentMoney = await getUserMoney(userId);
                await setUserMoney(userId, currentMoney + totalBet);
                console.log(`Refunded ${totalBet} to user ${userId} due to dealing error`);

                // Try to notify user via followUp
                await interaction.followUp({
                    content: `❌ Game failed to load properly. Your bet of ${totalBet.toLocaleString()} has been refunded.`,
                    ephemeral: true
                });
            } catch (refundError) {
                console.error('Error refunding bet:', refundError);
            }

            game.isDealing = false;
            return;
        }

        await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Check if game was replaced during dealing
    if (game.gameId !== currentGameId) {
        console.log(`Game ${currentGameId} was replaced, stopping dealing`);
        game.isDealing = false;
        return;
    }

    if (game.dealingPhase === 5) {
        game.dealNextCard();

        if (game.gameOver) {
            if (game.isMultiPlayer) {
                let jackpotAwarded = false; // Track if jackpot was already awarded
                game.loanDeductions = game.loanDeductions || new Map(); // Store loan deductions per player

                for (const [playerId] of game.players) {
                    const winnings = game.getWinnings(playerId);
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
                            console.error('Error awarding blackjack jackpot on initial deal:', error);
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
                }
            } else {
                let winnings = game.getWinnings(userId);
                const currentMoney = await getUserMoney(userId);
                const totalBet = game.getTotalBet(userId);

                const results = game.getResult(userId);
                const result = Array.isArray(results) ?
                    (results.includes('blackjack') ? 'blackjack' :
                     (results.includes('win') ? 'win' :
                      (results.includes('lose') ? 'lose' : 'push'))) : results;

                // Award progressive jackpot on natural blackjack
                // Check if player has natural blackjack regardless of result (even if push)
                let jackpotWon = 0;
                const player = game.players.get(userId);
                const hasNaturalBJ = player.hands.some(hand => isNaturalBlackjack(hand));

                let loanInfo = null;
                if (hasNaturalBJ && game.serverId) {
                    try {
                        const jackpotData = await getServerJackpot(game.serverId);
                        if (jackpotData && jackpotData.currentAmount > 0) {
                            jackpotWon = jackpotData.currentAmount;
                            const newMoney = currentMoney + totalBet + winnings + jackpotWon;
                            loanInfo = await setUserMoney(userId, newMoney);
                            await resetJackpot(game.serverId, userId, jackpotWon);
                            // Store jackpot info for embed display
                            game.jackpotWinner = userId;
                            game.jackpotAmount = jackpotWon;
                        }
                    } catch (error) {
                        console.error('Error awarding blackjack jackpot on initial deal:', error);
                    }
                }

                // Only set money if jackpot wasn't awarded (to avoid double setting)
                if (jackpotWon === 0) {
                    const newMoney = currentMoney + totalBet + winnings;
                    loanInfo = await setUserMoney(userId, newMoney);
                }

                // Store loan deduction info for display
                if (loanInfo) {
                    game.loanDeduction = loanInfo;
                }

                const bet = game.getTotalBet(userId);
                await recordGameResult(userId, 'blackjack', bet, winnings, result, {
                    handsPlayed: game.players.get(userId).hands.length,
                    jackpotWon: jackpotWon
                });
            }
        }

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
            await message.edit({
                embeds: [embed],
                components: components
            });
        } catch (error) {
            console.error('Error updating game message:', error);
            game.isDealing = false;
            return;
        }
    }

    game.isDealing = false;
}

function cleanupStaleGames() {
    const now = Date.now();
    const timeoutMs = 15 * 60 * 1000; // 15 minutes
    
    for (const [key, game] of activeGames) {
        if (!game.isMultiPlayer && game.interactionStartTime && 
            (now - game.interactionStartTime > timeoutMs)) {
            activeGames.delete(key);
            console.log(`Cleaned up stale single-player game for user ${key}`);
        }
    }
}

// Event handlers
client.once('ready', async () => {
    console.log(`${client.user.tag} is online!`);
    await loadUserData();

    // Check for active holiday event
    const { getCurrentHoliday, getHolidayMessage } = require('./utils/holidayEvents');
    const currentHoliday = getCurrentHoliday();
    if (currentHoliday) {
        console.log(`🎉 ${currentHoliday.name} event is currently active!`);
        const welcomeMessage = getHolidayMessage('welcome', currentHoliday.id);
        console.log(welcomeMessage);

        // Update bot activity to reflect event
        client.user.setActivity(`${currentHoliday.emoji} ${currentHoliday.name} Event! 🎰`, { type: "PLAYING" });
    } else {
        // Set normal activity
        client.user.setActivity("Blackjack, Poker & Slots 🎰", { type: "PLAYING" });
    }

    // Register slash commands
    const commands = client.commands.map(command => command.data);
    
    try {
        await client.application.commands.set(commands);
        console.log('Successfully registered application commands.');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
    
    // Start cleanup interval
    setInterval(cleanupStaleGames, 60 * 1000); // Every minute
});

client.on('interactionCreate', async interaction => {
    try {
        // Check if interaction is in allowed channel
        if (!ALLOWED_CHANNEL_IDS.includes(interaction.channelId)) {
            if (interaction.isCommand() || interaction.isButton() || interaction.isModalSubmit()) {
                return interaction.reply({
                    content: '❌ This bot can only be used in designated blackjack channels!',
                    ephemeral: true
                });
            }
            return;
        }

        if (interaction.isCommand()) {
            const command = client.commands.get(interaction.commandName);

            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                return;
            }

            // Check loan restrictions for game commands
            const gameCommands = ['blackjack', 'slots', 'poker', 'roulette', 'craps', 'war', 'coinflip', 'horserace', 'crash', 'bingo', 'hilo', 'pokertournament', 'plinko'];
            if (gameCommands.includes(interaction.commandName)) {
                // Check gambling ban from failed heist - TEMPORARILY DISABLED
                // const { isGamblingBanned } = require('./utils/heist');
                // const banCheck = await isGamblingBanned(interaction.user.id);

                // if (banCheck.isBanned) {
                //     return interaction.reply({
                //         content: banCheck.reason,
                //         ephemeral: true
                //     });
                // }

                // Check loan restrictions
                const { canPlayGames } = require('./utils/loanSystem');
                const { canPlay, reason } = await canPlayGames(interaction.user.id);

                if (!canPlay) {
                    return interaction.reply({
                        content: `⛔ ${reason}\n\nUse \`/work\` to earn money or \`/loan repay\` to pay off your debt!`,
                        ephemeral: true
                    });
                }
            }

            try {
                // Pass additional parameters that some commands need
                await command.execute(interaction, activeGames, dealCardsWithDelay);
            } catch (error) {
                console.error('Error executing command:', error);
                
                const errorMessage = {
                    content: '❌ There was an error while executing this command!',
                    ephemeral: true
                };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        }
        else if (interaction.isButton()) {
            // Import button handlers
            const { handleButtonInteraction } = require('./handlers/buttonHandler');
            await handleButtonInteraction(interaction, activeGames, client, dealCardsWithDelay, rouletteSessions);
        }
        else if (interaction.isModalSubmit()) {
            // Import modal handlers
            const { handleModalSubmit } = require('./handlers/modalHandler');
            await handleModalSubmit(interaction, activeGames, client, dealCardsWithDelay, rouletteSessions);
        }
        
    } catch (error) {
        console.error('Error handling interaction:', error);
        try {
            const errorMessage = {
                content: '⚠️ An error occurred while processing your action. Please try again or contact the bot owner.',
                ephemeral: true
            };
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        } catch (replyError) {
            console.error('Error sending error reply:', replyError);
        }
    }
});

// Error handling
client.on('error', error => {
    console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

const { closePool } = require('./database/connection');

// Graceful shutdown handling
async function gracefulShutdown(signal) {
    console.log(`\n${signal} received. Closing database connections before shutdown...`);

    try {
        await closePool();
        console.log('Database closed successfully. Shutting down...');
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Daily loan checker - runs every 24 hours
setInterval(async () => {
    const { checkOverdueLoans } = require('./utils/loanSystem');
    const overdueUsers = checkOverdueLoans();

    if (overdueUsers.length > 0) {
        console.log(`Checked loans: ${overdueUsers.length} users with overdue loans`);

        // Try to DM users about overdue loans
        for (const { userId, daysOverdue, totalOwed } of overdueUsers) {
            try {
                const user = await client.users.fetch(userId);
                await user.send({
                    content: `⚠️ **LOAN OVERDUE NOTICE**\n\nYour loan is **${daysOverdue} days overdue**!\n` +
                        `Total owed: **${totalOwed.toLocaleString()}**\n` +
                        `Additional interest is accruing at 5% per day!\n\n` +
                        `Use \`/work\` to earn money or risk further penalties!`
                });
            } catch (error) {
                console.log(`Could not DM user ${userId} about overdue loan`);
            }
        }
    }
}, 24 * 60 * 60 * 1000); // Every 24 hours

// Daily challenge reset checker - runs every hour
setInterval(async () => {
    const { resetAllChallenges } = require('./utils/challenges');
    await resetAllChallenges('daily');
    console.log('Checked for daily challenge resets');
}, 60 * 60 * 1000); // Every hour

// Weekly challenge reset checker - runs every 6 hours
setInterval(async () => {
    const { resetAllChallenges } = require('./utils/challenges');
    await resetAllChallenges('weekly');
    console.log('Checked for weekly challenge resets');
}, 6 * 60 * 60 * 1000); // Every 6 hours

// VIP expiry checker - runs every 6 hours
setInterval(async () => {
    const { checkExpiredVIP } = require('./utils/vip');
    const expiredUsers = await checkExpiredVIP();

    if (expiredUsers.length > 0) {
        console.log(`Checked VIP: ${expiredUsers.length} users' VIP expired`);

        // Try to DM users about expired VIP
        for (const { userId, tier } of expiredUsers) {
            try {
                const user = await client.users.fetch(userId);
                await user.send({
                    content: `⚠️ **VIP EXPIRED**\n\nYour **${tier}** VIP membership has expired!\n` +
                        `Use \`/vip shop\` to renew your membership and keep enjoying exclusive perks!`
                });
            } catch (error) {
                console.log(`Could not DM user ${userId} about expired VIP`);
            }
        }
    }
}, 6 * 60 * 60 * 1000); // Every 6 hours

// Guild challenge cleanup - runs every 24 hours
setInterval(async () => {
    try {
        const { deleteOldGuildChallenges } = require('./database/queries');
        const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
        const deletedCount = await deleteOldGuildChallenges(twoWeeksAgo);

        if (deletedCount > 0) {
            console.log(`Guild challenge cleanup: Deleted ${deletedCount} old challenge records`);
        }
    } catch (error) {
        console.error('Error cleaning up old guild challenges:', error);
    }
}, 24 * 60 * 60 * 1000); // Every 24 hours

// Guild shop item expiry cleanup - runs every hour
setInterval(async () => {
    try {
        const { deactivateExpiredItems } = require('./database/queries');
        const deactivatedCount = await deactivateExpiredItems();

        if (deactivatedCount > 0) {
            console.log(`Guild shop cleanup: Deactivated ${deactivatedCount} expired items`);
        }
    } catch (error) {
        console.error('Error deactivating expired shop items:', error);
    }
}, 60 * 60 * 1000); // Every hour

// Weekly guild rewards - runs every Sunday at midnight
const scheduleWeeklyRewards = () => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday
    const hour = now.getHours();

    // Check if it's Sunday between 00:00 and 01:00
    if (dayOfWeek === 0 && hour === 0) {
        const { distributeWeeklyRewards } = require('./utils/guildRewards');

        distributeWeeklyRewards()
            .then(result => {
                if (result.success) {
                    console.log(`Weekly rewards distributed to ${result.distributions.length} guilds`);
                } else {
                    console.error('Failed to distribute weekly rewards:', result.error);
                }
            })
            .catch(error => {
                console.error('Error distributing weekly rewards:', error);
            });
    }
};

// Check for weekly rewards every hour
setInterval(scheduleWeeklyRewards, 60 * 60 * 1000);
// Also check immediately on startup
setTimeout(scheduleWeeklyRewards, 5000);

// Start the bot
client.login(token);