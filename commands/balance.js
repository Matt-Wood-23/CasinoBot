const { getUserMoney } = require('../utils/data');

module.exports = {
    data: {
        name: 'balance',
        description: 'Check your current balance'
    },
    
    async execute(interaction) {
        try {
            const userMoney = await getUserMoney(interaction.user.id);
            await interaction.reply(`💰 You have **${userMoney.toLocaleString()}**`);
        } catch (error) {
            console.error('Error in balance command:', error);
            await interaction.reply({
                content: '❌ An error occurred while checking your balance. Please try again.',
                ephemeral: true
            });
        }
    }
};