const { getUserMoney, setUserMoney } = require('../utils/data');
const { checkGamblingBan, checkCooldown, setCooldown } = require('../utils/guardChecks');
const { createGameEmbed } = require('../utils/embeds');
const { createButtons } = require('../utils/buttons');
const { validateBet } = require('../utils/vip');
const ThreeCardPokerGame = require('../gameLogic/threeCardPokerGame');
const { recordGameToEvents, getEventNotifications } = require('../utils/eventIntegration');

module.exports = {
    data: {
        name: 'poker',
        description: 'Play 3 Card Poker',
        options: [
            {
                name: 'ante',
                description: 'Ante bet amount (VIP gets higher limits!)',
                type: 4,
                required: true,
                min_value: 10,
                max_value: 20000
            },
            {
                name: 'pairplus',
                description: 'Optional Pair Plus side bet',
                type: 4,
                required: false,
                min_value: 0,
                max_value: 2000
            }
        ]
    },

    async execute(interaction, activeGames) {
        try {
            // Cooldown: 3 seconds between games
            if (checkCooldown(interaction, 'poker', 3000)) return;

            // Check if user is gambling banned
            if (await checkGamblingBan(interaction)) return;

            const anteBet = interaction.options.getInteger('ante');
            const pairPlusBet = interaction.options.getInteger('pairplus') || 0;
            const totalBet = anteBet + pairPlusBet;
            const userMoney = await getUserMoney(interaction.user.id);

            // Validate ante bet against VIP limits
            const anteValidation = await validateBet(interaction.user.id, anteBet, 10, 10000);
            if (!anteValidation.valid) {
                return await interaction.reply({
                    content: anteValidation.message,
                    ephemeral: true
                });
            }

            // Validate pair plus bet if present
            if (pairPlusBet > 0) {
                const pairPlusValidation = await validateBet(interaction.user.id, pairPlusBet, 0, 1000);
                if (!pairPlusValidation.valid) {
                    return await interaction.reply({
                        content: 'Pair Plus: ' + pairPlusValidation.message,
                        ephemeral: true
                    });
                }
            }

            // Clean up any existing poker game
            if (activeGames.has(`poker_${interaction.user.id}`)) {
                activeGames.delete(`poker_${interaction.user.id}`);
            }

            // Check if user has enough money for ante + potential play bet (play bet = ante)
            const requiredTotal = anteBet * 2 + pairPlusBet;
            if (userMoney < requiredTotal) {
                return await interaction.reply({
                    content: `❌ You don't have enough money! You have ${userMoney.toLocaleString()}, but need ${requiredTotal.toLocaleString()} (Ante: ${anteBet.toLocaleString()} × 2 for play bet${pairPlusBet > 0 ? `, Pair Plus: ${pairPlusBet.toLocaleString()}` : ''}).`,
                    ephemeral: true
                });
            }

            // All checks passed — set cooldown
            setCooldown(interaction, 'poker', 3000);

            // Deduct bet and create game
            await setUserMoney(interaction.user.id, userMoney - totalBet);
            const pokerGame = new ThreeCardPokerGame(interaction.user.id, anteBet, pairPlusBet);
            activeGames.set(`poker_${interaction.user.id}`, pokerGame);

            // Create and send game embed
            const embed = await createGameEmbed(pokerGame, interaction.user.id, interaction.client);
            const buttons = await createButtons(pokerGame, interaction.user.id, interaction.client);
            
            await interaction.reply({
                embeds: [embed],
                components: buttons ? [buttons] : []
            });
            
        } catch (error) {
            console.error('Error in poker command:', error);

            const errorMessage = {
                content: '❌ An error occurred while starting the poker game. Please try again.',
                ephemeral: true
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        }
    }
};