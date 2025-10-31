const { getUserMoney, setUserMoney } = require('../utils/data');
const { isGamblingBanned, getGamblingBanTime } = require('../database/queries');
const { createGameEmbed } = require('../utils/embeds');
const { createButtons } = require('../utils/buttons');
const { validateBet } = require('../utils/vip');
const ThreeCardPokerGame = require('../gameLogic/threeCardPokerGame');

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

            // Check if user is gambling banned
            const isBanned = await isGamblingBanned(interaction.user.id);
            if (isBanned) {
                const banUntil = await getGamblingBanTime(interaction.user.id);
                const timeLeft = banUntil - Date.now();
                const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
                const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

                return await interaction.reply({
                    content: `🚫 You're banned from gambling after a failed heist!\nBan expires in: ${hoursLeft}h ${minutesLeft}m`,
                    ephemeral: true
                });
            }

            // Clean up any existing poker game
            if (activeGames.has(`poker_${interaction.user.id}`)) {
                activeGames.delete(`poker_${interaction.user.id}`);
            }

            // Check if user has enough money
            if (userMoney < totalBet) {
                return await interaction.reply({
                    content: `❌ You don't have enough money! You have ${userMoney.toLocaleString()}, but need ${totalBet.toLocaleString()} (Ante: ${anteBet.toLocaleString()}${pairPlusBet > 0 ? `, Pair Plus: ${pairPlusBet.toLocaleString()}` : ''}).`,
                    ephemeral: true
                });
            }

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