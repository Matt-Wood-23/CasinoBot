const { getUserMoney, setUserMoney } = require('../utils/data');
const { ADMIN_USER_ID } = require('../config');

module.exports = {
    data: {
        name: 'givemoney',
        description: '[ADMIN ONLY] Give money to a user',
        options: [
            {
                name: 'user',
                description: 'The user to give money to',
                type: 6,
                required: true
            },
            {
                name: 'amount',
                description: 'Amount of money to give',
                type: 4,
                required: true,
                min_value: 1,
                max_value: 100000000
            }
        ]
    },
    
    async execute(interaction) {
        try {
            // Check if user is admin
            if (interaction.user.id !== ADMIN_USER_ID) {
                return await interaction.reply({
                    content: '❌ You do not have permission to use this command!',
                    ephemeral: true
                });
            }

            const targetUser = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');

            // Check if target is a bot
            if (targetUser.bot) {
                return await interaction.reply({
                    content: '❌ Cannot give money to bots!',
                    ephemeral: true
                });
            }

            // Give money to target user
            const targetCurrentMoney = await getUserMoney(targetUser.id);
            await setUserMoney(targetUser.id, targetCurrentMoney + amount);

            await interaction.reply({
                content: `💰 **Admin Action**: Gave ${amount.toLocaleString()} to ${targetUser.username}!\nNew balance: ${(targetCurrentMoney + amount).toLocaleString()}`,
                ephemeral: true
            });

            // Log the admin action
            console.log(`Admin ${interaction.user.username} (${interaction.user.id}) gave ${amount} to ${targetUser.username} (${targetUser.id})`);
            
        } catch (error) {
            console.error('Error in givemoney command:', error);

            const errorMessage = {
                content: '❌ An error occurred while giving money. Please try again.',
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