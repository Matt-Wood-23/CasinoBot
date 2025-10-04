const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { getUserMoney } = require('../utils/data');

module.exports = {
    data: {
        name: 'lottery',
        description: 'Play the lottery! Pick 5 numbers from 1-50',
        options: [
            {
                name: 'buy',
                description: 'Buy a lottery ticket',
                type: 1
            },
            {
                name: 'status',
                description: 'Check lottery status and your tickets',
                type: 1
            }
        ]
    },

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'buy') {
            await handleBuyTicket(interaction);
        } else if (subcommand === 'status') {
            await handleStatus(interaction);
        }
    }
};

async function handleBuyTicket(interaction) {
    try {
        const userMoney = await getUserMoney(interaction.user.id);
        const ticketPrice = 100;

        if (userMoney < ticketPrice) {
            return interaction.reply({
                content: `❌ You don't have enough money! Lottery tickets cost ${ticketPrice.toLocaleString()}. You have ${userMoney.toLocaleString()}.`,
                ephemeral: true
            });
        }

        // Show modal to pick numbers
        const modal = new ModalBuilder()
            .setCustomId('lottery_pick_numbers')
            .setTitle('🎰 Pick Your Lucky Numbers 🎰')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('lottery_numbers')
                        .setLabel('Enter 5 numbers (1-50), separated by spaces')
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder('e.g., 7 14 23 35 42')
                        .setRequired(true)
                )
            );

        await interaction.showModal(modal);

    } catch (error) {
        console.error('Error in lottery buy:', error);
        await interaction.reply({
            content: '❌ An error occurred while buying a lottery ticket. Please try again.',
            ephemeral: true
        });
    }
}

async function handleStatus(interaction) {
    try {
        // Get global lottery from client (will be stored in main.js)
        const lottery = interaction.client.currentLottery;

        if (!lottery) {
            return interaction.reply({
                content: '🎰 No active lottery at the moment. Buy a ticket to start one!',
                ephemeral: true
            });
        }

        const userTickets = lottery.getUserTickets(interaction.user.id);

        const embed = new EmbedBuilder()
            .setTitle('🎰 LOTTERY STATUS 🎰')
            .setColor('#FFD700')
            .setTimestamp();

        let description = `**Prize Pool:** ${lottery.prizePool.toLocaleString()}\n`;
        description += `**Estimated Jackpot (5/5):** ${lottery.getEstimatedJackpot().toLocaleString()}\n`;
        description += `**Total Tickets Sold:** ${lottery.getTotalTickets()}\n`;
        description += `**Ticket Price:** 100\n\n`;

        if (lottery.drawTime) {
            const timeLeft = lottery.drawTime - Date.now();
            const minutesLeft = Math.floor(timeLeft / 60000);
            description += `⏰ **Draw in:** ${minutesLeft} minutes\n\n`;
        }

        description += `**Prize Distribution:**\n`;
        description += `🥇 Match 5/5: 60% of pool\n`;
        description += `🥈 Match 4/5: 25% of pool\n`;
        description += `🥉 Match 3/5: 15% of pool\n\n`;

        if (userTickets.length > 0) {
            description += `**Your Tickets (${userTickets.length}):**\n`;
            for (const ticket of userTickets.slice(0, 5)) { // Show max 5
                description += `🎫 ${ticket.numbers.join(', ')}\n`;
            }
            if (userTickets.length > 5) {
                description += `... and ${userTickets.length - 5} more\n`;
            }
        } else {
            description += `You have no tickets. Use \`/lottery buy\` to purchase one!`;
        }

        embed.setDescription(description);

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('Error in lottery status:', error);
        await interaction.reply({
            content: '❌ An error occurred while checking lottery status. Please try again.',
            ephemeral: true
        });
    }
}
