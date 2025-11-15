const { getUserMoney, setUserMoney, recordGameResult } = require('../../utils/data');
const { createGameEmbed, sendPlayerCardsDM } = require('../../utils/embeds');
const { createButtons } = require('../../utils/buttons');
const { awardGameXP, awardWagerXP } = require('../../utils/guildXP');
const { recordGameToEvents } = require('../../utils/eventIntegration');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

async function handleTournamentButtons(interaction, activeGames, userId, client) {
    const channelId = interaction.channelId;
    const tournament = activeGames.get(`tournament_${channelId}`);

    if (!tournament) {
        return interaction.reply({ content: '❌ No active tournament found in this channel!', ephemeral: true });
    }

    if (interaction.customId === 'tournament_register') {
        // Check if user has enough money
        const userMoney = await getUserMoney(userId);
        if (userMoney < tournament.buyIn) {
            return interaction.reply({
                content: `❌ You don't have enough money! Buy-in is ${tournament.buyIn.toLocaleString()}, you have ${userMoney.toLocaleString()}.`,
                ephemeral: true
            });
        }

        // Register player
        const result = tournament.addPlayer(userId);
        if (!result.success) {
            return interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
        }

        // Deduct buy-in
        await setUserMoney(userId, userMoney - tournament.buyIn);

        await interaction.reply({
            content: `✅ You registered for the tournament! Starting chips: 1,000`,
            ephemeral: true
        });

        // Update lobby display
        await updateTournamentLobby(tournament, interaction, client);

    } else if (interaction.customId === 'tournament_unregister') {
        const result = tournament.removePlayer(userId);
        if (!result.success) {
            return interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
        }

        // Refund buy-in
        const userMoney = await getUserMoney(userId);
        await setUserMoney(userId, userMoney + tournament.buyIn);

        await interaction.reply({
            content: `✅ You unregistered. ${tournament.buyIn.toLocaleString()} has been refunded.`,
            ephemeral: true
        });

        // Update lobby display
        await updateTournamentLobby(tournament, interaction, client);

    } else if (interaction.customId === 'tournament_start') {
        const result = tournament.startTournament();
        if (!result.success) {
            return interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
        }

        await interaction.deferUpdate();

        // Send player cards via DM
        await sendPlayerCardsDM(tournament, client);

        // Start the tournament
        const embed = await createGameEmbed(tournament, userId, client);
        const buttons = await createButtons(tournament, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });

    } else if (interaction.customId === 'tournament_fold') {
        if (tournament.getCurrentPlayer() !== userId) {
            return interaction.reply({ content: '❌ It\'s not your turn!', ephemeral: true });
        }

        tournament.fold(userId);

        await interaction.deferUpdate();
        const embed = await createGameEmbed(tournament, userId, client);
        const buttons = await createButtons(tournament, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });

        // Check if hand/tournament is complete after fold
        if (tournament.phase === 'handComplete') {
            // Wait 3 seconds then start next hand
            setTimeout(async () => {
                tournament.startNewHand();

                // Send player cards via DM for the new hand
                await sendPlayerCardsDM(tournament, client);

                const newEmbed = await createGameEmbed(tournament, userId, client);
                const newButtons = await createButtons(tournament, userId, client);

                await interaction.message.edit({
                    embeds: [newEmbed],
                    components: newButtons ? [newButtons] : []
                });
            }, 3000);
        } else if (tournament.tournamentComplete) {
            // Award prizes
            const prizes = tournament.winners;
            for (const prize of prizes) {
                const currentMoney = await getUserMoney(prize.userId);
                await setUserMoney(prize.userId, currentMoney + prize.prize);

                await recordGameResult(prize.userId, 'poker_tournament', tournament.buyIn, prize.prize - tournament.buyIn, 'win', {
                    place: prize.place,
                    prizePool: tournament.prizePool
                });

                // Award guild XP (async, don't wait)
                awardWagerXP(prize.userId, tournament.buyIn, 'Poker Tournament').catch(err =>
                    console.error('Error awarding wager XP:', err)
                );
                awardGameXP(prize.userId, 'Poker Tournament', true).catch(err =>
                    console.error('Error awarding game XP:', err)
                );

                // Record to active guild events (async, don't wait)
                const winningsAmount = prize.prize - tournament.buyIn;
                recordGameToEvents(prize.userId, 'Poker Tournament', tournament.buyIn, winningsAmount > 0 ? winningsAmount : 0).catch(err =>
                    console.error('Error recording game to events:', err)
                );
            }

            // Record losses for non-winners
            for (const [playerId] of tournament.players) {
                const isWinner = prizes.some(p => p.userId === playerId);
                if (!isWinner) {
                    await recordGameResult(playerId, 'poker_tournament', tournament.buyIn, -tournament.buyIn, 'lose', {
                        prizePool: tournament.prizePool
                    });

                    // Award guild XP (async, don't wait)
                    awardWagerXP(playerId, tournament.buyIn, 'Poker Tournament').catch(err =>
                        console.error('Error awarding wager XP:', err)
                    );
                    awardGameXP(playerId, 'Poker Tournament', false).catch(err =>
                        console.error('Error awarding game XP:', err)
                    );

                    // Record to active guild events (async, don't wait)
                    recordGameToEvents(playerId, 'Poker Tournament', tournament.buyIn, 0).catch(err =>
                        console.error('Error recording game to events:', err)
                    );
                }
            }
        }

    } else if (interaction.customId === 'tournament_check_call') {
        if (tournament.getCurrentPlayer() !== userId) {
            return interaction.reply({ content: '❌ It\'s not your turn!', ephemeral: true });
        }

        const player = tournament.players.get(userId);
        const callAmount = tournament.currentBet - player.bet;

        // Determine if this is a check or call
        if (callAmount === 0) {
            // Check
            const success = tournament.check(userId);
            if (!success) {
                return interaction.reply({ content: '❌ Cannot check!', ephemeral: true });
            }
        } else {
            // Call
            tournament.call(userId);
        }

        await interaction.deferUpdate();
        const embed = await createGameEmbed(tournament, userId, client);
        const buttons = await createButtons(tournament, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });

        // Check if hand/tournament is complete
        if (tournament.phase === 'handComplete') {
            // Wait 3 seconds then start next hand
            setTimeout(async () => {
                tournament.startNewHand();

                // Send player cards via DM for the new hand
                await sendPlayerCardsDM(tournament, client);

                const newEmbed = await createGameEmbed(tournament, userId, client);
                const newButtons = await createButtons(tournament, userId, client);

                await interaction.message.edit({
                    embeds: [newEmbed],
                    components: newButtons ? [newButtons] : []
                });
            }, 3000);
        } else if (tournament.tournamentComplete) {
            // Award prizes
            const prizes = tournament.winners;
            for (const prize of prizes) {
                const currentMoney = await getUserMoney(prize.userId);
                await setUserMoney(prize.userId, currentMoney + prize.prize);

                await recordGameResult(prize.userId, 'poker_tournament', tournament.buyIn, prize.prize - tournament.buyIn, 'win', {
                    place: prize.place,
                    prizePool: tournament.prizePool
                });

                // Award guild XP (async, don't wait)
                awardWagerXP(prize.userId, tournament.buyIn, 'Poker Tournament').catch(err =>
                    console.error('Error awarding wager XP:', err)
                );
                awardGameXP(prize.userId, 'Poker Tournament', true).catch(err =>
                    console.error('Error awarding game XP:', err)
                );

                // Record to active guild events (async, don't wait)
                const winningsAmount = prize.prize - tournament.buyIn;
                recordGameToEvents(prize.userId, 'Poker Tournament', tournament.buyIn, winningsAmount > 0 ? winningsAmount : 0).catch(err =>
                    console.error('Error recording game to events:', err)
                );
            }

            // Record losses for non-winners
            for (const [playerId] of tournament.players) {
                const isWinner = prizes.some(p => p.userId === playerId);
                if (!isWinner) {
                    await recordGameResult(playerId, 'poker_tournament', tournament.buyIn, -tournament.buyIn, 'lose', {
                        prizePool: tournament.prizePool
                    });

                    // Award guild XP (async, don't wait)
                    awardWagerXP(playerId, tournament.buyIn, 'Poker Tournament').catch(err =>
                        console.error('Error awarding wager XP:', err)
                    );
                    awardGameXP(playerId, 'Poker Tournament', false).catch(err =>
                        console.error('Error awarding game XP:', err)
                    );
                }
            }
        }

    } else if (interaction.customId === 'tournament_raise') {
        if (tournament.getCurrentPlayer() !== userId) {
            return interaction.reply({ content: '❌ It\'s not your turn!', ephemeral: true });
        }

        // Show modal for raise amount
        const modal = new ModalBuilder()
            .setCustomId('tournament_raise_amount')
            .setTitle('Raise Amount')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('raise_amount')
                        .setLabel('How much to raise?')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setPlaceholder('50')
                )
            );

        await interaction.showModal(modal);

    } else if (interaction.customId === 'tournament_next_hand') {
        if (tournament.phase !== 'handComplete') {
            return interaction.reply({ content: '❌ Hand is not complete!', ephemeral: true });
        }

        tournament.startNewHand();

        await interaction.deferUpdate();

        // Send player cards via DM for the new hand
        await sendPlayerCardsDM(tournament, client);

        const embed = await createGameEmbed(tournament, userId, client);
        const buttons = await createButtons(tournament, userId, client);

        await interaction.editReply({
            embeds: [embed],
            components: buttons ? [buttons] : []
        });
    }
}

async function updateTournamentLobby(tournament, interaction, client) {
    const playerList = [];
    for (const [playerId] of tournament.players) {
        try {
            const user = await client.users.fetch(playerId);
            playerList.push(user.username);
        } catch (error) {
            playerList.push(`User ${playerId}`);
        }
    }

    const embed = new EmbedBuilder()
        .setTitle('♠️ Texas Hold\'em Tournament')
        .setColor('#FFD700')
        .setDescription(
            `🎰 **Tournament Starting Soon!**\n\n` +
            `💰 **Buy-in:** ${tournament.buyIn.toLocaleString()}\n` +
            `🏆 **Prize Pool:** ${tournament.prizePool.toLocaleString()}\n` +
            `👥 **Players:** ${tournament.players.size}/${tournament.maxPlayers}\n` +
            `💎 **Starting Chips:** 1,000\n\n` +
            `**Prize Distribution:**\n` +
            `🥇 1st Place: 50% of pool (${Math.floor(tournament.prizePool * 0.50).toLocaleString()})\n` +
            `🥈 2nd Place: 30% of pool (${Math.floor(tournament.prizePool * 0.30).toLocaleString()})\n` +
            `🥉 3rd Place: 20% of pool (${Math.floor(tournament.prizePool * 0.20).toLocaleString()})\n\n` +
            `**Blinds:** Start at 10/20, increase every 5 hands\n\n` +
            `**Registered Players:** ${playerList.length > 0 ? playerList.join(', ') : 'None yet'}\n\n` +
            `Click **Register** to join!`
        )
        .setTimestamp();

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('tournament_register')
                .setLabel('Register')
                .setStyle(ButtonStyle.Success)
                .setEmoji('🎫'),
            new ButtonBuilder()
                .setCustomId('tournament_unregister')
                .setLabel('Unregister')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('🚪'),
            new ButtonBuilder()
                .setCustomId('tournament_start')
                .setLabel('Start Tournament')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('▶️')
                .setDisabled(tournament.players.size < 2)
        );

    await interaction.message.edit({
        embeds: [embed],
        components: [row]
    });
}

module.exports = { handleTournamentButtons };
