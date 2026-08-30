
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Import utilities
const { loadUserData } = require('./database/queries');
const { settleBlackjackGame } = require('./utils/blackjackSettlement');
const { renderBlackjack, wait } = require('./utils/blackjackRender');
const { INITIAL_DEAL_DELAY } = require('./utils/blackjackTiming');

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

/**
 * Deal the opening cards one at a time.
 *
 * The old version rendered a frame and then slept, so the hand opened with a
 * dead second at the end, and it dealt phase 5 inside the loop *and* again
 * afterwards — which redrew the finished table twice in a row, once before
 * payouts were recorded and once after. That second redraw is what made
 * results appear and then immediately change.
 */
async function dealCardsWithDelay(interaction, message, game, userId, delay = INITIAL_DEAL_DELAY) {
    // Prevent concurrent dealing for the same game
    if (game.isDealing) {
        console.log(`Game ${game.gameId} is already dealing, skipping duplicate call`);
        return;
    }

    game.isDealing = true;
    const currentGameId = game.gameId;
    const target = message || interaction;

    try {
        let firstCard = true;

        // Phases 1-4 put a card on the table each time, so each one is a frame.
        while (game.dealingPhase < 4 && !game.gameOver && game.gameId === currentGameId) {
            // Sleep before each card except the first, so the table appears
            // immediately and the pause always sits *between* two cards.
            if (!firstCard) await wait(delay);
            firstCard = false;

            if (game.gameId !== currentGameId) break;

            game.dealNextCard();

            const rendered = await renderBlackjack(target, game, userId, client);
            if (!rendered) {
                // The table can no longer be shown, so the hand cannot be
                // played. Give the stakes back and drop the game, so its
                // orphaned buttons cannot pay out a hand that was refunded.
                dropGame(game);
                await refundFailedDeal(interaction, game, userId);
                return;
            }
        }

        if (game.gameId !== currentGameId) {
            console.log(`Game ${currentGameId} was replaced, stopping dealing`);
            return;
        }

        // Phase 5 is the dealer peeking for blackjack. It changes nothing the
        // player can see unless the dealer actually has one, so it only earns a
        // frame in that case — and then only after payouts are recorded, so the
        // result is drawn once instead of appearing and then changing.
        if (game.dealingPhase === 4) {
            game.dealNextCard();

            if (game.gameOver) {
                await wait(delay);
                if (game.gameId !== currentGameId) return;

                try {
                    await settleBlackjackGame(game);
                } catch (error) {
                    console.error('Error settling blackjack game after deal:', error);
                }

                await renderBlackjack(target, game, userId, client);
            }
        }
    } finally {
        game.isDealing = false;
    }
}

/** Remove a game from the active map, whichever key it is filed under. */
function dropGame(game) {
    for (const [key, value] of activeGames) {
        if (value === game) {
            activeGames.delete(key);
            return;
        }
    }
}

/**
 * Return every player's stake when the table cannot be rendered, so a hand that
 * never became playable does not cost anyone anything.
 */
async function refundFailedDeal(interaction, game, userId) {
    const { getUserMoney, addUserMoney } = require('./database/queries');

    // Everyone at the table staked before the deal, so everyone gets it back —
    // this used to refund only the player the interaction belonged to, leaving
    // the rest of a multiplayer table out of pocket for a hand nobody played.
    for (const playerId of game.players.keys()) {
        try {
            const totalBet = game.getTotalBet(playerId);
            if (totalBet <= 0) continue;

            await addUserMoney(playerId, totalBet);
            console.log(`Refunded ${totalBet} to user ${playerId} due to dealing error`);
        } catch (refundError) {
            console.error(`Error refunding bet for ${playerId}:`, refundError);
        }
    }

    try {
        await interaction.followUp({
            content: `❌ Game failed to load properly. Your bet of ${game.getTotalBet(userId).toLocaleString()} has been refunded.`,
            ephemeral: true
        });
    } catch (error) {
        console.error('Error notifying player of refund:', error);
    }
}

function cleanupStaleGames() {
    const now = Date.now();
    const timeoutMs = 15 * 60 * 1000; // 15 minutes
    const multiplayerTimeoutMs = 2 * 60 * 60 * 1000; // 2 hours
    const completedTimeoutMs = 5 * 60 * 1000; // 5 minutes after completion

    for (const [key, game] of activeGames) {
        // Single-player cleanup
        if (!game.isMultiPlayer && game.interactionStartTime &&
            (now - game.interactionStartTime > timeoutMs)) {
            activeGames.delete(key);
            console.log(`Cleaned up stale single-player game for user ${key}`);
            continue;
        }

        // Multiplayer bingo cleanup
        if (key.startsWith('bingo_') && game.createdAt) {
            const isComplete = game.gameComplete;
            const age = now - game.createdAt;
            if ((isComplete && age > completedTimeoutMs) || age > multiplayerTimeoutMs) {
                activeGames.delete(key);
                console.log(`Cleaned up stale bingo game in channel ${key}`);
            }
            continue;
        }

        // Multiplayer poker tournament cleanup
        if (key.startsWith('tournament_') && game.createdAt) {
            const isComplete = game.tournamentComplete;
            const age = now - game.createdAt;
            if ((isComplete && age > completedTimeoutMs) || age > multiplayerTimeoutMs) {
                activeGames.delete(key);
                console.log(`Cleaned up stale poker tournament in channel ${key}`);
            }
        }

        // PvP duel game cleanup
        if (key.startsWith('duel_game_') && game.gameId) {
            const isComplete = game.gameOver;
            const age = now - game.interactionStartTime;
            if ((isComplete && age > completedTimeoutMs) || age > multiplayerTimeoutMs) {
                activeGames.delete(key);
                console.log(`Cleaned up stale duel game ${key}`);
            }
        }

        // Duel challenge cleanup (expired challenges)
        if (key.startsWith('duel_challenge_') && game.createdAt) {
            const age = now - game.createdAt;
            if (age > 5 * 60 * 1000) { // 5 minutes
                activeGames.delete(key);
                console.log(`Cleaned up expired duel challenge ${key}`);
            }
        }
    }
}

// Event handlers
client.once('ready', async () => {
    console.log(`${client.user.tag} is online!`);
    await loadUserData();

    // Restore any in-progress lottery from DB (survives bot restarts)
    try {
        const { resumeLotteryIfNeeded } = require('./commands/lottery');
        await resumeLotteryIfNeeded(client);
    } catch (err) {
        console.error('Error restoring lottery state on startup:', err);
    }

    // Check for active holiday event
    const { getCurrentHoliday, getHolidayMessage } = require('./utils/holidayEvents');
    const currentHoliday = getCurrentHoliday();
    if (currentHoliday) {
        console.log(`🎉 ${currentHoliday.name} event is currently active!`);
        const welcomeMessage = getHolidayMessage('welcome', currentHoliday.id);
        console.log(welcomeMessage);

        // Update bot activity to reflect event
        const { ActivityType } = require('discord.js');
        client.user.setActivity(`${currentHoliday.emoji} ${currentHoliday.name} Event! 🎰`, { type: ActivityType.Playing });
    } else {
        // Set normal activity
        const { ActivityType } = require('discord.js');
        client.user.setActivity("Blackjack, Poker & Slots 🎰", { type: ActivityType.Playing });
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
    const overdueUsers = await checkOverdueLoans();

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

// Season rotation - runs on the 1st of each month at midnight
const scheduleSeasonRotation = () => {
    const now = new Date();
    const dayOfMonth = now.getDate();
    const hour = now.getHours();

    // Check if it's the 1st of the month between 00:00 and 01:00
    if (dayOfMonth === 1 && hour === 0) {
        const { distributeSeasonRewards } = require('./utils/guildRewards');
        const { endSeasonAndStartNew, getCurrentSeason } = require('./database/queries/guilds');

        getCurrentSeason()
            .then(season => {
                if (!season) return;
                return distributeSeasonRewards(season.id)
                    .then(result => {
                        console.log(`Season ${season.id} rewards distributed to ${result.distributions?.length ?? 0} guilds`);
                        return endSeasonAndStartNew();
                    });
            })
            .then(newSeason => {
                if (newSeason) console.log(`New guild season started: ${newSeason.id}`);
            })
            .catch(error => {
                console.error('Error rotating guild season:', error);
            });
    }
};

// Check for season rotation every hour
setInterval(scheduleSeasonRotation, 60 * 60 * 1000);

// Start the bot
client.login(token);