const { getUserMoney, setUserMoney } = require('../utils/data');
const { createGameEmbed } = require('../utils/embeds');
const { createButtons } = require('../utils/buttons');
const ThreeCardPokerGame = require('../gameLogic/threeCardPokerGame');

module.exports = {
    data: {
        name: 'poker',
        description: 'Play 3 Card Poker',
        options: [
            {
                name: 'ante',
                description: 'Ante bet amount (10-10,000)',
                type: 4,
                required: true,
                min_value: 10,
                max_value: 10000
            },
            {
                name: 'pairplus',
                description: 'Optional Pair Plus side bet (0-1,000)',
                type: 4,
                required: false,
                min_value: 0,
                max_value: 1000
            }
        ]
    },
    
    async execute(interaction, activeGames) {
        try {
            const anteBet = interaction.options.getInteger('ante');
            const pairPlusBet = interaction.options.getInteger('pairplus') || 0;
            const totalBet = anteBet + pairPlusBet;
            const userMoney = await getUserMoney(interaction.user.id);

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
            const buttons = createButtons(pokerGame, interaction.user.id, interaction.client);
            
            await interaction.reply({
                embeds: [embed],
                components: buttons ? [buttons] : []
            });
            
        } catch (error) {
            console.error('Error in poker command:', error);
            await interaction.reply({
                content: '❌ An error occurred while starting the poker game. Please try again.',
                ephemeral: true
            });
        }
    }
};