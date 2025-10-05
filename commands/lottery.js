const { EmbedBuilder } = require('discord.js');
const { getUserMoney } = require('../utils/data');

module.exports = {
    data: {
        name: 'lottery',
        description: 'Play the lottery! Auto-generated 5 numbers from 1-50',
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
        const { setUserMoney } = require('../utils/data');
        const LotteryGame = require('../gameLogic/lotteryGame');

        const userMoney = await getUserMoney(interaction.user.id);
        const ticketPrice = 100;

        if (userMoney < ticketPrice) {
            return interaction.reply({
                content: `❌ You don't have enough money! Lottery tickets cost ${ticketPrice.toLocaleString()}. You have ${userMoney.toLocaleString()}.`,
                ephemeral: true
            });
        }

        // Get or create current lottery
        if (!interaction.client.currentLottery) {
            interaction.client.currentLottery = new LotteryGame();
        }

        const lottery = interaction.client.currentLottery;

        // Auto-generate 5 random unique numbers between 1-50
        const numbers = [];
        while (numbers.length < 5) {
            const num = Math.floor(Math.random() * 50) + 1;
            if (!numbers.includes(num)) {
                numbers.push(num);
            }
        }
        numbers.sort((a, b) => a - b);

        // Buy ticket
        const result = lottery.buyTicket(interaction.user.id, numbers);

        if (!result.success) {
            return interaction.reply({
                content: `❌ ${result.reason}`,
                ephemeral: true
            });
        }

        // Deduct money
        await setUserMoney(interaction.user.id, userMoney - ticketPrice);

        // Schedule draw if not already scheduled
        if (!lottery.drawScheduled && lottery.getTotalTickets() >= 1) {
            lottery.drawScheduled = true;
            lottery.drawTime = Date.now() + (30 * 60 * 1000); // 30 minutes

            setTimeout(async () => {
                await conductDraw(interaction.client, lottery);
            }, 30 * 60 * 1000);
        }

        const embed = new EmbedBuilder()
            .setTitle('🎫 Lottery Ticket Purchased!')
            .setColor('#00FF00')
            .setDescription(
                `**Your Numbers:** ${result.numbers.join(', ')}\n\n` +
                `**Ticket Price:** ${ticketPrice.toLocaleString()}\n` +
                `**New Balance:** ${(userMoney - ticketPrice).toLocaleString()}\n\n` +
                `**Current Prize Pool:** ${lottery.prizePool.toLocaleString()}\n` +
                `**Estimated Jackpot (5/5):** ${lottery.getEstimatedJackpot().toLocaleString()}\n` +
                `**Total Tickets:** ${lottery.getTotalTickets()}\n\n` +
                `Good luck! 🍀`
            )
            .setTimestamp();

        if (lottery.drawTime) {
            const timeLeft = lottery.drawTime - Date.now();
            const minutesLeft = Math.floor(timeLeft / 60000);
            embed.setFooter({ text: `Draw in ${minutesLeft} minutes` });
        }

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('Error in lottery buy:', error);
        await interaction.reply({
            content: '❌ An error occurred while buying a lottery ticket. Please try again.',
            ephemeral: true
        });
    }
}

async function conductDraw(client, lottery) {
    const { setUserMoney, getUserMoney } = require('../utils/data');

    lottery.draw();

    // Pay out winners
    for (const winner of lottery.winners) {
        const currentMoney = await getUserMoney(winner.userId);
        await setUserMoney(winner.userId, currentMoney + winner.prize);
    }

    // Announce results in all channels where tickets were bought
    const announcedChannels = new Set();

    for (const ticket of lottery.tickets) {
        try {
            const user = await client.users.fetch(ticket.userId);

            const userWinnings = lottery.getTotalPrizeForUser(ticket.userId);
            const userTickets = lottery.getUserTickets(ticket.userId);

            const embed = new EmbedBuilder()
                .setTitle('🎰 LOTTERY DRAW RESULTS 🎰')
                .setColor(userWinnings > 0 ? '#FFD700' : '#808080')
                .setDescription(
                    `**Winning Numbers:** ${lottery.winningNumbers.join(', ')}\n\n` +
                    `**Total Prize Pool:** ${lottery.prizePool.toLocaleString()}\n` +
                    `**Total Winners:** ${lottery.winners.length}\n\n` +
                    `**Your Tickets:** ${userTickets.length}\n` +
                    (userWinnings > 0
                        ? `\n🎉 **YOU WON ${userWinnings.toLocaleString()}!** 🎉\n`
                        : '\nBetter luck next time!')
                )
                .setTimestamp();

            if (userWinnings > 0) {
                const userWinners = lottery.getWinnersForUser(ticket.userId);
                for (const w of userWinners) {
                    embed.addFields({
                        name: `${w.matches}/5 Matches`,
                        value: `Numbers: ${w.numbers.join(', ')}\nPrize: ${w.prize.toLocaleString()}`,
                        inline: false
                    });
                }
            }

            await user.send({ embeds: [embed] });

        } catch (error) {
            console.log(`Could not DM lottery results to user ${ticket.userId}`);
        }
    }

    // Reset lottery
    client.currentLottery = null;
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
