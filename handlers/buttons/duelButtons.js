const { getUserMoney, setUserMoney, recordGameResult } = require('../../database/queries');
const { createGameEmbed } = require('../../utils/embeds');
const BlackjackGame = require('../../gameLogic/blackjackGame');
const { EmbedBuilder } = require('discord.js');

async function handleDuelAccept(interaction, activeGames, client, dealCardsWithDelay) {
    try {
        const parsed = parseDuelId(interaction.customId);
        const challengedId = interaction.user.id;
        const { challengerId } = parsed;

        if (!challengerId || !challengedId) {
            return await interaction.reply({
                content: '❌ Invalid duel request.',
                ephemeral: true
            });
        }

        const challengeKey = `duel_challenge_${challengerId}_${challengedId}`;
        const challenge = activeGames.get(challengeKey);

        if (!challenge) {
            return await interaction.reply({
                content: '❌ This challenge no longer exists.',
                ephemeral: true
            });
        }

        const { bet, serverId } = challenge;

        // Check if challenged user has enough money
        const challengedMoney = await getUserMoney(challengedId);
        if (challengedMoney < bet) {
            await interaction.reply({
                content: `❌ You don't have enough money! You need ${bet.toLocaleString()} but have ${challengedMoney.toLocaleString()}.`,
                ephemeral: true
            });
            return;
        }

        // Deduct bet from challenged player
        await setUserMoney(challengedId, challengedMoney - bet);

        // Remove challenge from activeGames
        activeGames.delete(challengeKey);

        // Create PvP Blackjack game
        const game = new BlackjackGame(interaction.channelId, challengerId, bet, true, true);
        game.serverId = serverId;

        // Add both players
        game.addPlayer(challengedId, bet);

        // Store game
        const gameId = `duel_game_${game.gameId}`;
        activeGames.set(gameId, game);

        // Update message to show game start
        const startEmbed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('⚔️ PvP Blackjack Duel Started!')
            .setDescription(`**${await getUserName(client, challengerId)} vs ${await getUserName(client, challengedId)}**\n\nHead-to-head blackjack! Higher score without busting wins the pot.`)
            .addFields(
                { name: 'Pot', value: `${(bet * 2).toLocaleString()}`, inline: true }
            )
            .setTimestamp();

        await interaction.update({
            embeds: [startEmbed],
            components: []
        });

        // Small delay before starting the game
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Start dealing
        await dealCardsWithDelay(interaction, null, game, challengerId, 1000);

    } catch (error) {
        console.error('Error handling duel accept:', error);

        try {
            await interaction.reply({
                content: '❌ An error occurred while starting the duel.',
                ephemeral: true
            });
        } catch (e) {
            // Interaction may already be updated
        }
    }
}

async function handleDuelCancel(interaction, activeGames) {
    try {
        const parsed = parseDuelId(interaction.customId);
        const userId = interaction.user.id;
        const { challengerId, challengedId } = parsed;

        if (!challengerId || !challengedId) {
            return await interaction.reply({
                content: '❌ Invalid duel request.',
                ephemeral: true
            });
        }

        const challengeKey = `duel_challenge_${challengerId}_${challengedId}`;
        const challenge = activeGames.get(challengeKey);

        if (!challenge) {
            return await interaction.reply({
                content: '❌ This challenge no longer exists.',
                ephemeral: true
            });
        }

        // Verify permission: challenger can cancel anytime, challenged can decline
        if (userId !== challengerId && userId !== challengedId) {
            return await interaction.reply({
                content: '❌ Only the players involved in this duel can cancel.',
                ephemeral: true
            });
        }

        const { bet } = challenge;

        // Remove challenge
        activeGames.delete(challengeKey);

        // Refund challenger
        const challengerMoney = await getUserMoney(challengerId);
        await setUserMoney(challengerId, challengerMoney + bet);

        const reason = userId === challengerId ? 'cancelled by challenger' : 'declined by challenged player';

        // Update the message
        await interaction.update({
            content: `❌ Duel challenge ${reason}. Bet refunded.`,
            embeds: [],
            components: []
        });

    } catch (error) {
        console.error('Error handling duel cancel:', error);

        try {
            await interaction.reply({
                content: '❌ An error occurred while cancelling the duel.',
                ephemeral: true
            });
        } catch (e) {
            // Interaction may already be updated
        }
    }
}

async function handleDuelRematch(interaction, activeGames, client, dealCardsWithDelay) {
    try {
        const parts = interaction.customId.split('_');
        // Format: duel_rematch_accept_<gameId> or duel_rematch_decline_<gameId>
        const action = parts[2]; // 'accept' or 'decline'
        const gameId = parts.slice(3).join('_');
        const userId = interaction.user.id;

        const gameKey = `duel_game_${gameId}`;
        const game = activeGames.get(gameKey);

        if (!game || !game.isDuel || !game.players.has(userId)) {
            return await interaction.reply({ content: '❌ This duel is no longer available.', ephemeral: true });
        }

        const playerIds = Array.from(game.players.keys());
        const rematchKey = `rematch_${gameId}`;

        if (action === 'decline') {
            activeGames.delete(rematchKey);
            const decliner = await getUserName(client, userId);
            return await interaction.update({
                content: `❌ **${decliner}** declined the rematch.`,
                embeds: [],
                components: []
            });
        }

        // action === 'accept'
        let rematch = activeGames.get(rematchKey);
        if (!rematch) {
            rematch = { accepted: new Set(), playerIds, bet: game.players.get(playerIds[0]).bet, serverId: game.serverId };
            activeGames.set(rematchKey, rematch);
        }

        if (rematch.accepted.has(userId)) {
            return await interaction.reply({ content: '⏳ Already accepted — waiting for your opponent.', ephemeral: true });
        }

        rematch.accepted.add(userId);

        if (rematch.accepted.size < 2) {
            const accepter = await getUserName(client, userId);
            return await interaction.reply({ content: `✅ **${accepter}** wants a rematch! Waiting for your opponent to accept.`, ephemeral: true });
        }

        // Both accepted — start rematch
        activeGames.delete(rematchKey);
        activeGames.delete(gameKey);

        const { bet, serverId } = rematch;
        const [playerAId, playerBId] = playerIds;

        // Check and deduct bets from both players
        const moneyA = await getUserMoney(playerAId);
        const moneyB = await getUserMoney(playerBId);

        if (moneyA < bet) {
            const name = await getUserName(client, playerAId);
            return await interaction.update({ content: `❌ ${name} doesn't have enough to rematch (needs ${bet.toLocaleString()}).`, embeds: [], components: [] });
        }
        if (moneyB < bet) {
            const name = await getUserName(client, playerBId);
            return await interaction.update({ content: `❌ ${name} doesn't have enough to rematch (needs ${bet.toLocaleString()}).`, embeds: [], components: [] });
        }

        await setUserMoney(playerAId, moneyA - bet);
        await setUserMoney(playerBId, moneyB - bet);

        // Create new game
        const newGame = new BlackjackGame(interaction.channelId, playerAId, bet, true, true);
        newGame.serverId = serverId;
        newGame.addPlayer(playerBId, bet);

        const newGameKey = `duel_game_${newGame.gameId}`;
        activeGames.set(newGameKey, newGame);

        const startEmbed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('⚔️ Rematch!')
            .setDescription(`**${await getUserName(client, playerAId)} vs ${await getUserName(client, playerBId)}**\n\nHead-to-head blackjack! Higher score without busting wins the pot.`)
            .addFields({ name: 'Pot', value: `${(bet * 2).toLocaleString()}`, inline: true })
            .setTimestamp();

        await interaction.update({ embeds: [startEmbed], components: [] });

        await new Promise(resolve => setTimeout(resolve, 2000));
        await dealCardsWithDelay(interaction, null, newGame, playerAId, 1000);

    } catch (error) {
        console.error('Error handling duel rematch:', error);
        try {
            await interaction.reply({ content: '❌ An error occurred with the rematch request.', ephemeral: true });
        } catch (e) { /* already replied */ }
    }
}

// Helper function to parse customId: duel_accept_challengerId_challengedId or duel_cancel_challengerId_challengedId
function parseDuelId(customId) {
    const parts = customId.split('_');
    // Format: duel_accept_challengerId_challengedId or duel_cancel_challengerId_challengedId
    if (parts.length >= 4) {
        const action = parts[1]; // accept or cancel
        const challengerId = parts[2];
        const challengedId = parts[3];

        return {
            userId: null, // Will be set by caller from interaction.user.id
            challengerId,
            challengedId
        };
    }
    return { userId: null, challengerId: null, challengedId: null };
}

async function getUserName(client, userId) {
    try {
        const user = await client.users.fetch(userId);
        return user.tag;
    } catch {
        return `User${userId}`;
    }
}

module.exports = {
    handleDuelAccept,
    handleDuelCancel,
    handleDuelRematch
};
