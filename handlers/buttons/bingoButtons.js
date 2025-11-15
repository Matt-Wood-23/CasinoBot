const { getUserMoney, setUserMoney, recordGameResult } = require('../../utils/data');
const { createGameEmbed } = require('../../utils/embeds');
const { createButtons } = require('../../utils/buttons');
const { awardGameXP, awardWagerXP } = require('../../utils/guildXP');
const { recordGameToEvents } = require('../../utils/eventIntegration');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const BingoGame = require('../../gameLogic/bingoGame');

async function handleBingoButtons(interaction, activeGames, userId, client) {
    const channelId = interaction.channelId;
    const game = activeGames.get(`bingo_${channelId}`);

    if (!game) {
        return interaction.reply({ content: '❌ No active bingo game found in this channel!', ephemeral: true });
    }

    if (interaction.customId === 'bingo_join') {
        // Check if user has enough money
        const userMoney = await getUserMoney(userId);
        if (userMoney < game.entryFee) {
            return interaction.reply({
                content: `❌ You don't have enough money! Entry fee is ${game.entryFee.toLocaleString()}, you have ${userMoney.toLocaleString()}.`,
                ephemeral: true
            });
        }

        // Add player
        const result = game.addPlayer(userId);
        if (!result.success) {
            return interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
        }

        // Deduct entry fee
        await setUserMoney(userId, userMoney - game.entryFee);

        // Send player their card via DM
        try {
            const user = await client.users.fetch(userId);
            const cardDisplay = game.getCardDisplay(userId);
            const dmEmbed = new EmbedBuilder()
                .setTitle('🎱 Your Bingo Card')
                .setDescription(`Here's your bingo card for the game!\n\n${cardDisplay}\n\n[X] = Marked\nXX = Free Space`)
                .setColor('#FFD700');

            const dmMessage = await user.send({ embeds: [dmEmbed] });

            // Store the DM message ID for later editing
            const playerData = game.players.get(userId);
            if (playerData) {
                playerData.dmMessageId = dmMessage.id;
            }
        } catch (error) {
            console.log(`Could not DM bingo card to ${userId}`);
        }

        await interaction.reply({
            content: `✅ You joined the game! Check your DMs for your bingo card.`,
            ephemeral: true
        });

        // Update lobby display
        await updateBingoLobby(game, interaction, client);

    } else if (interaction.customId === 'bingo_leave') {
        const result = game.removePlayer(userId);
        if (!result.success) {
            return interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
        }

        // Refund entry fee
        const userMoney = await getUserMoney(userId);
        await setUserMoney(userId, userMoney + game.entryFee);

        await interaction.reply({
            content: `✅ You left the game. ${game.entryFee.toLocaleString()} has been refunded.`,
            ephemeral: true
        });

        // Update lobby display
        await updateBingoLobby(game, interaction, client);

    } else if (interaction.customId === 'bingo_start') {
        const result = game.startGame();
        if (!result.success) {
            return interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
        }

        await interaction.deferUpdate();

        // Start the game
        const embed = await createGameEmbed(game, userId, client);
        const buttons = await createButtons(game, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });

    } else if (interaction.customId === 'bingo_call') {
        // Only allow calling if game has started
        if (!game.gameStarted) {
            return interaction.reply({ content: '❌ Game has not started yet!', ephemeral: true });
        }

        const result = game.callNumber();
        if (!result.success) {
            return interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
        }

        await interaction.deferUpdate();

        // Update all players' cards via DM
        for (const [playerId] of game.players) {
            try {
                const user = await client.users.fetch(playerId);
                const cardDisplay = game.getCardDisplay(playerId);
                const playerData = game.players.get(playerId);

                let cardMessage = `**Last Called:** ${BingoGame.getLetterForNumber(game.currentNumber)}-${game.currentNumber}\n\n`;
                cardMessage += cardDisplay + '\n\n';

                if (playerData.hasBingo) {
                    cardMessage += `🎉 **BINGO!** You got ${playerData.bingoType}!\n`;
                }

                const dmEmbed = new EmbedBuilder()
                    .setTitle('🎱 Your Bingo Card')
                    .setDescription(cardMessage)
                    .setColor(playerData.hasBingo ? '#00FF00' : '#FFD700');

                // Edit the existing DM if we have a message ID, otherwise send a new one
                if (playerData.dmMessageId) {
                    try {
                        const dmChannel = await user.createDM();
                        const dmMessage = await dmChannel.messages.fetch(playerData.dmMessageId);
                        await dmMessage.edit({ embeds: [dmEmbed] });
                    } catch (editError) {
                        // If editing fails, send a new message and update the ID
                        const newDmMessage = await user.send({ embeds: [dmEmbed] });
                        playerData.dmMessageId = newDmMessage.id;
                    }
                } else {
                    // No message ID stored, send a new message
                    const newDmMessage = await user.send({ embeds: [dmEmbed] });
                    playerData.dmMessageId = newDmMessage.id;
                }
            } catch (error) {
                console.log(`Could not DM update to ${playerId}`);
            }
        }

        // Update main display
        const embed = await createGameEmbed(game, userId, client);
        const buttons = await createButtons(game, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });

        // If game is complete, award prizes
        if (game.gameComplete) {
            const prizes = game.calculatePrizes();
            for (const prize of prizes) {
                const currentMoney = await getUserMoney(prize.userId);
                await setUserMoney(prize.userId, currentMoney + prize.prize);

                // Record game result
                await recordGameResult(prize.userId, 'bingo', game.entryFee, prize.prize - game.entryFee, 'win', {
                    place: prize.place,
                    prizePool: game.prizePool
                });

                // Award guild XP (async, don't wait)
                awardWagerXP(prize.userId, game.entryFee, 'Bingo').catch(err =>
                    console.error('Error awarding wager XP:', err)
                );
                awardGameXP(prize.userId, 'Bingo', true).catch(err =>
                    console.error('Error awarding game XP:', err)
                );

                // Record to active guild events (async, don't wait)
                const winningsAmount = prize.prize - game.entryFee;
                recordGameToEvents(prize.userId, 'Bingo', game.entryFee, winningsAmount > 0 ? winningsAmount : 0).catch(err =>
                    console.error('Error recording game to events:', err)
                );
            }

            // Record losses for non-winners
            for (const [playerId] of game.players) {
                const isWinner = prizes.some(p => p.userId === playerId);
                if (!isWinner) {
                    await recordGameResult(playerId, 'bingo', game.entryFee, -game.entryFee, 'lose', {
                        prizePool: game.prizePool
                    });

                    // Award guild XP (async, don't wait)
                    awardWagerXP(playerId, game.entryFee, 'Bingo').catch(err =>
                        console.error('Error awarding wager XP:', err)
                    );
                    awardGameXP(playerId, 'Bingo', false).catch(err =>
                        console.error('Error awarding game XP:', err)
                    );

                    // Record to active guild events (async, don't wait)
                    recordGameToEvents(playerId, 'Bingo', game.entryFee, 0).catch(err =>
                        console.error('Error recording game to events:', err)
                    );
                }
            }
        }
    }
}

async function updateBingoLobby(game, interaction, client) {
    const playerList = [];
    for (const [playerId] of game.players) {
        try {
            const user = await client.users.fetch(playerId);
            playerList.push(user.username);
        } catch (error) {
            playerList.push(`User ${playerId}`);
        }
    }

    const embed = new EmbedBuilder()
        .setTitle('🎱 Bingo Hall - Waiting for Players')
        .setColor('#FFD700')
        .setDescription(
            `Welcome to the Bingo Hall!\n\n` +
            `💰 **Entry Fee:** ${game.entryFee.toLocaleString()}\n` +
            `👥 **Players:** ${game.players.size}/${game.maxPlayers}\n` +
            `💵 **Prize Pool:** ${game.prizePool.toLocaleString()}\n\n` +
            `**Prizes:**\n` +
            `🥇 1st Bingo: 50% of pool (${Math.floor(game.prizePool * 0.50).toLocaleString()})\n` +
            `🥈 2nd Bingo: 30% of pool (${Math.floor(game.prizePool * 0.30).toLocaleString()})\n` +
            `🥉 3rd Bingo: 20% of pool (${Math.floor(game.prizePool * 0.20).toLocaleString()})\n\n` +
            `**Players:** ${playerList.length > 0 ? playerList.join(', ') : 'None yet'}\n\n` +
            `Click **Join Game** to enter!`
        )
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('bingo_join')
                .setLabel('Join Game')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🎫'),
            new ButtonBuilder()
                .setCustomId('bingo_leave')
                .setLabel('Leave Game')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🚪'),
            new ButtonBuilder()
                .setCustomId('bingo_start')
                .setLabel('Start Game')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('▶️')
                .setDisabled(game.players.size < 2)
        );

    await interaction.message.edit({
        embeds: [embed],
        components: [row]
    });
}

module.exports = { handleBingoButtons };
