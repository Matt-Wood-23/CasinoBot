// Button handlers
const { handleSlotsSpinAgain } = require('./buttons/slotsButtons');
const { handleCoinFlipButtons } = require('./buttons/coinflipButtons');
const { handleWarButtons } = require('./buttons/warButtons');
const { handleCrapsButtons } = require('./buttons/crapsButtons');
const { handleHorseRaceButtons } = require('./buttons/horseRaceButtons');
const { handleHiLoButtons } = require('./buttons/hiloButtons');
const { handleCrashButtons } = require('./buttons/crashButtons');
const { handleBingoButtons } = require('./buttons/bingoButtons');
const { handlePokerButtons } = require('./buttons/pokerButtons');
const { handleRouletteButtons } = require('./buttons/rouletteButtons');
const { handleTournamentButtons } = require('./buttons/tournamentButtons');
const { handleBlackjackButtons, updateBettingDisplay, startTurnTimer, animateDealerDrawing } = require('./buttons/blackjackButtons');
const { handleTableButtons } = require('./buttons/tableButtons');
const { handleShopPurchase, handlePropertyPurchase, handleUseItem, handleVIPPurchase } = require('./buttons/shopButtons');
const { handleGuildHeistJoin } = require('./buttons/guildButtons');
const { handleClaimChallengeRewards } = require('./buttons/challengeButtons');

// Helper functions moved to utils/cardHelpers.js

async function handleButtonInteraction(interaction, activeGames, client, dealCardsWithDelay, rouletteSessions) {
    const { customId, user } = interaction;

    // Handle 3 Card Poker buttons
    if (customId.startsWith('poker_')) {
        await handlePokerButtons(interaction, activeGames, customId, user.id, client);
        return;
    }

    // Handle new roulette betting interface buttons
    if (customId.startsWith('roulette_')) {
        await handleRouletteButtons(interaction, activeGames, user.id, client, rouletteSessions);
        return;
    }

    // Handle slots buttons
    if (customId === 'spin_again') {
        await handleSlotsSpinAgain(interaction, user.id, client);
        return;
    }

    // Handle craps buttons
    if (customId.startsWith('craps_')) {
        await handleCrapsButtons(interaction, activeGames, user.id, client);
        return;
    }

    // Handle war buttons
    if (customId.startsWith('war_')) {
        await handleWarButtons(interaction, activeGames, user.id, client);
        return;
    }

    // Handle coin flip buttons
    if (customId.startsWith('coinflip_')) {
        await handleCoinFlipButtons(interaction, activeGames, user.id, client);
        return;
    }

    // Handle horse racing buttons
    if (customId.startsWith('race_')) {
        await handleHorseRaceButtons(interaction, activeGames, user.id, client);
        return;
    }

    // Handle crash buttons
    if (customId.startsWith('crash_')) {
        await handleCrashButtons(interaction, activeGames, user.id, client);
        return;
    }

    // Handle bingo buttons
    if (customId.startsWith('bingo_')) {
        await handleBingoButtons(interaction, activeGames, user.id, client);
        return;
    }

    // Handle tournament buttons
    if (customId.startsWith('tournament_')) {
        await handleTournamentButtons(interaction, activeGames, user.id, client);
        return;
    }

    // Handle hi-lo buttons
    if (customId.startsWith('hilo_')) {
        await handleHiLoButtons(interaction, activeGames, user.id, client);
        return;
    }

    // Handle challenge reward claims
    if (customId === 'claim_challenge_rewards') {
        await handleClaimChallengeRewards(interaction, user.id);
        return;
    }

    // Handle shop purchase buttons
    if (customId.startsWith('shop_buy_')) {
        await handleShopPurchase(interaction, user.id);
        return;
    }

    // Handle property purchase buttons
    if (customId.startsWith('property_buy_')) {
        await handlePropertyPurchase(interaction, user.id);
        return;
    }

    // Handle inventory use buttons
    if (customId.startsWith('use_item_')) {
        await handleUseItem(interaction, user.id);
        return;
    }

    // Handle VIP purchase buttons
    if (customId.startsWith('vip_buy_')) {
        await handleVIPPurchase(interaction, user.id);
        return;
    }

    // Handle guild heist join buttons
    if (customId.startsWith('guildheist_join_')) {
        await handleGuildHeistJoin(interaction, user.id);
        return;
    }

    // Handle blackjack buttons
    if (['hit', 'stand', 'double', 'split', 'play_again_single', 'continue_playing'].includes(customId)) {
        await handleBlackjackButtons(interaction, activeGames, client, dealCardsWithDelay);
        return;
    }

    // Handle table management buttons
    if (customId.startsWith('join_table') || customId.startsWith('keep_bet') || customId.startsWith('adjust_bet') || customId.startsWith('leave_table')) {
        await handleTableButtons(interaction, activeGames, client, dealCardsWithDelay);
        return;
    }

    // Handle disabled/info buttons
    if (['not_your_game', 'inactive', 'not_in_game'].includes(customId)) {
        await interaction.reply({
            content: '❌ This button is not available to you right now.',
            ephemeral: true
        });
        return;
    }
}

module.exports = { handleButtonInteraction };