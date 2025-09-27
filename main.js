
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Import utilities
const { loadUserData } = require('./utils/data');
const { createGameEmbed } = require('./utils/embeds');
const { createButtons } = require('./utils/buttons');

// Import game classes
const BlackjackGame = require('./gameLogic/blackjackGame');
const SlotsGame = require('./gameLogic/slotsGame');
const ThreeCardPokerGame = require('./gameLogic/threeCardPokerGame');

// Import configuration
const { token, ALLOWED_CHANNEL_IDS, ADMIN_USER_ID } = require('./config');

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

// Helper functions
async function dealCardsWithDelay(interaction, message, game, userId, delay = 1000) {
    const { getUserMoney, setUserMoney, recordGameResult } = require('./utils/data');
    
    while (game.dealingPhase < 5 && !game.gameOver) {
        game.dealNextCard();
        
        const embed = await createGameEmbed(game, userId, client);
        const buttons = createButtons(game, userId, client);
        
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
            return;
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    if (game.dealingPhase === 5) {
        game.dealNextCard();

        if (game.gameOver) {
            if (game.isMultiPlayer) {
                for (const [playerId] of game.players) {
                    const winnings = game.getWinnings(playerId);
                    const currentMoney = await getUserMoney(playerId);
                    await setUserMoney(playerId, currentMoney + game.getTotalBet(playerId) + winnings);
                    
                    const results = game.getResult(playerId);
                    const result = Array.isArray(results) ? 
                        (results.includes('blackjack') ? 'blackjack' : 
                         (results.includes('win') ? 'win' : 
                          (results.includes('lose') ? 'lose' : 'push'))) : results;
                    
                    const bet = game.getTotalBet(playerId);
                    await recordGameResult(playerId, 'blackjack', bet, winnings, result, {
                        handsPlayed: game.players.get(playerId).hands.length
                    });
                }
            } else {
                const winnings = game.getWinnings(userId);
                const currentMoney = await getUserMoney(userId);
                await setUserMoney(userId, currentMoney + game.getTotalBet(userId) + winnings);
                
                const results = game.getResult(userId);
                const result = Array.isArray(results) ? 
                    (results.includes('blackjack') ? 'blackjack' : 
                     (results.includes('win') ? 'win' : 
                      (results.includes('lose') ? 'lose' : 'push'))) : results;
                
                const bet = game.getTotalBet(userId);
                await recordGameResult(userId, 'blackjack', bet, winnings, result, {
                    handsPlayed: game.players.get(userId).hands.length
                });
            }
        }

        const embed = await createGameEmbed(game, userId, client);
        const buttons = createButtons(game, userId, client);
        
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
            return;
        }
    }
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
    
    // Set activity
    client.user.setActivity("Blackjack, Poker & Slots 🎰", { type: "PLAYING" });

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
            await handleButtonInteraction(interaction, activeGames, client, dealCardsWithDelay);
        }
        else if (interaction.isModalSubmit()) {
            // Import modal handlers
            const { handleModalSubmit } = require('./handlers/modalHandler');
            await handleModalSubmit(interaction, activeGames, client, dealCardsWithDelay);
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

// Start the bot
client.login(token);