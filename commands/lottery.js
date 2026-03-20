const { EmbedBuilder } = require('discord.js');
const { getUserMoney } = require('../utils/data');
const { query } = require('../database/connection');
const { checkGamblingBan, checkCooldown, setCooldown } = require('../utils/guardChecks');

module.exports = {
    data: {
        name: 'lottery',
        description: 'Play the lottery! Auto-generated 5 numbers from 1-50',
        options: [
            {
                name: 'buy',
                description: 'Buy a lottery ticket',
                type: 1,
                options: [
                    {
                        type: 4, // INTEGER
                        name: 'quantity',
                        description: 'Number of tickets to buy (1-10)',
                        required: false
                    }
                ]
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

// ─────────────────────────────────────────────
// DB persistence helpers
// ─────────────────────────────────────────────

async function saveLotteryState(client) {
    try {
        const lottery = client.currentLottery;
        if (!lottery) {
            await query(`DELETE FROM bot_state WHERE key = 'current_lottery'`);
            return;
        }
        const state = {
            tickets: lottery.tickets,
            prizePool: lottery.prizePool,
            rolloverAmount: lottery.rolloverAmount,
            drawScheduled: lottery.drawScheduled,
            drawTime: lottery.drawTime
        };
        await query(
            `INSERT INTO bot_state (key, value, updated_at)
             VALUES ('current_lottery', $1, $2)
             ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = $2`,
            [JSON.stringify(state), Date.now()]
        );
    } catch (err) {
        console.error('Error saving lottery state:', err);
    }
}

/**
 * Called on bot startup. Restores any in-progress lottery from the DB and
 * re-schedules the draw timer (or runs the draw immediately if it was overdue).
 */
async function resumeLotteryIfNeeded(client) {
    try {
        const result = await query(`SELECT value FROM bot_state WHERE key = 'current_lottery'`);
        if (result.rows.length === 0) return;

        const state = result.rows[0].value;
        if (!state || !state.tickets || state.tickets.length === 0) return;

        const LotteryGame = require('../gameLogic/lotteryGame');
        const lottery = new LotteryGame(state.rolloverAmount || 0);
        lottery.tickets = state.tickets;
        lottery.prizePool = state.prizePool || 0;
        lottery.rolloverAmount = state.rolloverAmount || 0;
        lottery.drawScheduled = state.drawScheduled || false;
        lottery.drawTime = state.drawTime || null;

        client.currentLottery = lottery;
        console.log(`Restored lottery with ${lottery.tickets.length} tickets, prize pool ${lottery.prizePool}`);

        if (lottery.drawScheduled && lottery.drawTime) {
            const timeUntilDraw = lottery.drawTime - Date.now();
            if (timeUntilDraw > 0) {
                console.log(`Rescheduling lottery draw in ${Math.round(timeUntilDraw / 60000)} minutes`);
                setTimeout(() => conductDraw(client, lottery), timeUntilDraw);
            } else {
                // Draw was overdue — run immediately
                console.log('Lottery draw was overdue, running now...');
                await conductDraw(client, lottery);
            }
        }
    } catch (err) {
        console.error('Error restoring lottery state:', err);
    }
}

module.exports.resumeLotteryIfNeeded = resumeLotteryIfNeeded;

// ─────────────────────────────────────────────
// Command handlers
// ─────────────────────────────────────────────

async function handleBuyTicket(interaction) {
    try {
        const { setUserMoney } = require('../utils/data');
        const LotteryGame = require('../gameLogic/lotteryGame');

        // Cooldown: 5 seconds between ticket purchases
        if (checkCooldown(interaction, 'lottery', 5000)) return;

        // Check if user is gambling banned
        if (await checkGamblingBan(interaction)) return;

        const quantity = interaction.options.getInteger('quantity') || 1;

        // Validate quantity
        if (quantity < 1 || quantity > 10) {
            return interaction.reply({
                content: '❌ You can only buy between 1 and 10 tickets at a time!',
                ephemeral: true
            });
        }

        const userMoney = await getUserMoney(interaction.user.id);
        const ticketPrice = 100;
        const totalCost = ticketPrice * quantity;

        if (userMoney < totalCost) {
            return interaction.reply({
                content: `❌ You don't have enough money! ${quantity} ticket${quantity > 1 ? 's' : ''} cost${quantity === 1 ? 's' : ''} ${totalCost.toLocaleString()}. You have ${userMoney.toLocaleString()}.`,
                ephemeral: true
            });
        }

        // All checks passed — set cooldown
        setCooldown(interaction, 'lottery', 5000);

        // Get or create current lottery
        if (!interaction.client.currentLottery) {
            interaction.client.currentLottery = new LotteryGame();
        }

        const lottery = interaction.client.currentLottery;

        // Buy multiple tickets
        const purchasedTickets = [];
        for (let i = 0; i < quantity; i++) {
            // Auto-generate 5 random unique numbers between 1-50
            const numbers = [];
            while (numbers.length < 5) {
                const num = Math.floor(Math.random() * 50) + 1;
                if (!numbers.includes(num)) {
                    numbers.push(num);
                }
            }
            numbers.sort((a, b) => a - b);

            const result = lottery.buyTicket(interaction.user.id, numbers);

            if (!result.success) {
                return interaction.reply({
                    content: `❌ ${result.reason}`,
                    ephemeral: true
                });
            }

            purchasedTickets.push(result.numbers);
        }

        // Deduct money
        await setUserMoney(interaction.user.id, userMoney - totalCost);

        // Schedule draw if not already scheduled
        if (!lottery.drawScheduled && lottery.getTotalTickets() >= 1) {
            lottery.drawScheduled = true;
            lottery.drawTime = Date.now() + (30 * 60 * 1000); // 30 minutes

            setTimeout(async () => {
                await conductDraw(interaction.client, lottery);
            }, 30 * 60 * 1000);
        }

        // Persist lottery state to DB after every ticket purchase
        await saveLotteryState(interaction.client);

        let ticketDescription = `**Tickets Purchased:** ${quantity}\n`;

        const displayCount = Math.min(purchasedTickets.length, 5);
        for (let i = 0; i < displayCount; i++) {
            ticketDescription += `🎫 ${purchasedTickets[i].join(', ')}\n`;
        }
        if (purchasedTickets.length > 5) {
            ticketDescription += `... and ${purchasedTickets.length - 5} more ticket${purchasedTickets.length - 5 > 1 ? 's' : ''}\n`;
        }

        ticketDescription += `\n**Total Cost:** ${totalCost.toLocaleString()}\n` +
            `**New Balance:** ${(userMoney - totalCost).toLocaleString()}\n\n` +
            `**Current Prize Pool:** ${lottery.prizePool.toLocaleString()}\n`;

        if (lottery.rolloverAmount > 0) {
            ticketDescription += `💰 **Includes Rollover:** ${lottery.rolloverAmount.toLocaleString()}\n`;
        }

        ticketDescription += `**Estimated Jackpot (5/5):** ${lottery.getEstimatedJackpot().toLocaleString()}\n` +
            `**Total Tickets in Pool:** ${lottery.getTotalTickets()}\n\n` +
            `Good luck! 🍀`;

        const embed = new EmbedBuilder()
            .setTitle(`🎫 Lottery Ticket${quantity > 1 ? 's' : ''} Purchased!`)
            .setColor('#00FF00')
            .setDescription(ticketDescription)
            .setTimestamp();

        if (lottery.drawTime) {
            const timeLeft = lottery.drawTime - Date.now();
            const minutesLeft = Math.floor(timeLeft / 60000);
            embed.setFooter({ text: `Draw in ${minutesLeft} minutes` });
        }

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('Error in lottery buy:', error);

        const errorMessage = {
            content: '❌ An error occurred while buying a lottery ticket. Please try again.',
            ephemeral: true
        };

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
}

async function conductDraw(client, lottery) {
    const { setUserMoney, getUserMoney } = require('../utils/data');
    const LotteryGame = require('../gameLogic/lotteryGame');

    lottery.draw();

    // Pay out winners
    for (const winner of lottery.winners) {
        const currentMoney = await getUserMoney(winner.userId);
        await setUserMoney(winner.userId, currentMoney + winner.prize);
    }

    // Notify all ticket holders
    const dmFailedWinners = new Set();

    for (const ticket of lottery.tickets) {
        try {
            const user = await client.users.fetch(ticket.userId);

            const userWinnings = lottery.getTotalPrizeForUser(ticket.userId);
            const userTickets = lottery.getUserTickets(ticket.userId);

            let description = `**Winning Numbers:** ${lottery.winningNumbers.join(', ')}\n\n` +
                `**Total Prize Pool:** ${lottery.prizePool.toLocaleString()}\n` +
                `**Total Winners:** ${lottery.winners.length}\n\n` +
                `**Your Tickets:** ${userTickets.length}\n` +
                (userWinnings > 0
                    ? `\n🎉 **YOU WON ${userWinnings.toLocaleString()}!** 🎉\n`
                    : '\nBetter luck next time!');

            if (lottery.rolloverForNextGame > 0) {
                description += `\n\n💰 **Next Jackpot starts at ${lottery.rolloverForNextGame.toLocaleString()}!**`;
            }

            const embed = new EmbedBuilder()
                .setTitle('🎰 LOTTERY DRAW RESULTS 🎰')
                .setColor(userWinnings > 0 ? '#FFD700' : '#808080')
                .setDescription(description)
                .setTimestamp();

            if (userWinnings > 0) {
                const userWinnerEntries = lottery.getWinnersForUser(ticket.userId);
                for (const w of userWinnerEntries) {
                    embed.addFields({
                        name: `${w.matches}/5 Matches`,
                        value: `Numbers: ${w.numbers.join(', ')}\nPrize: ${w.prize.toLocaleString()}`,
                        inline: false
                    });
                }
            }

            await user.send({ embeds: [embed] });

        } catch (error) {
            const userWinnings = lottery.getTotalPrizeForUser(ticket.userId);
            if (userWinnings > 0 && !dmFailedWinners.has(ticket.userId)) {
                // DM failed for a winner — announce in channel as fallback
                dmFailedWinners.add(ticket.userId);
                console.log(`Could not DM lottery winner ${ticket.userId} — sending channel fallback`);
                try {
                    const { ALLOWED_CHANNEL_IDS } = require('../config');
                    for (const channelId of ALLOWED_CHANNEL_IDS) {
                        const ch = client.channels.cache.get(channelId);
                        if (ch) {
                            await ch.send({
                                content: `🎉 <@${ticket.userId}> won **${userWinnings.toLocaleString()}** in the lottery but has DMs disabled! Congratulations! 🎰`
                            });
                            break;
                        }
                    }
                } catch (chErr) {
                    console.error(`Could not send channel fallback for lottery winner ${ticket.userId}:`, chErr);
                }
            } else {
                console.log(`Could not DM lottery results to user ${ticket.userId}`);
            }
        }
    }

    // Create new lottery with rollover amount
    const rollover = lottery.rolloverForNextGame || 0;
    client.currentLottery = rollover > 0 ? new LotteryGame(rollover) : null;

    // Persist new state (or clear if no rollover lottery)
    await saveLotteryState(client);
}

async function handleStatus(interaction) {
    try {
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
        if (lottery.rolloverAmount > 0) {
            description += `💰 **Rollover from Last Draw:** ${lottery.rolloverAmount.toLocaleString()}\n`;
        }
        description += `**Estimated Jackpot (5/5):** ${lottery.getEstimatedJackpot().toLocaleString()}\n`;
        description += `**Total Tickets Sold:** ${lottery.getTotalTickets()}\n`;
        description += `**Ticket Price:** 100\n\n`;

        if (lottery.drawTime) {
            const timeLeft = lottery.drawTime - Date.now();
            const minutesLeft = Math.max(0, Math.floor(timeLeft / 60000));
            description += `⏰ **Draw in:** ${minutesLeft} minutes\n\n`;
        }

        description += `**Prize Distribution:**\n`;
        description += `🥇 Match 5/5: 60% of pool\n`;
        description += `🥈 Match 4/5: 25% of pool\n`;
        description += `🥉 Match 3/5: 15% of pool\n\n`;

        if (userTickets.length > 0) {
            description += `**Your Tickets (${userTickets.length}):**\n`;
            for (const ticket of userTickets.slice(0, 5)) {
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

        const errorMessage = {
            content: '❌ An error occurred while checking lottery status. Please try again.',
            ephemeral: true
        };

        if (interaction.replied || interaction.deferred) {
            await interaction.followUp(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
    }
}
