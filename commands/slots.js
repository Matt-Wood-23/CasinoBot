const { getUserMoney, setUserMoney, recordGameResult } = require('../utils/data');
const { getServerJackpot, addToJackpot, resetJackpot } = require('../database/queries');
const { createGameEmbed } = require('../utils/embeds');
const { createButtons } = require('../utils/buttons');
const { validateBet } = require('../utils/vip');
const { checkGamblingBan, checkCooldown, setCooldown } = require('../utils/guardChecks');
const { applyHolidayWinningsBonus } = require('../utils/holidayEvents');
const SlotsGame = require('../gameLogic/slotsGame');
const { awardGameXP, awardWagerXP } = require('../utils/guildXP');
const { applyWinningsBoost } = require('../utils/guildShopEffects');
const { recordGameToEvents, getEventNotifications } = require('../utils/eventIntegration');

module.exports = {
    data: {
        name: 'slots',
        description: 'Play slots - Chance to win the progressive jackpot!',
        options: [
            {
                name: 'bet',
                description: 'Amount to bet per spin (VIP gets higher limits!)',
                type: 4,
                required: true,
                min_value: 1,
                max_value: 2000
            }
        ]
    },

    async execute(interaction) {
        try {
            const bet = interaction.options.getInteger('bet');
            const userMoney = await getUserMoney(interaction.user.id);
            const serverId = interaction.guildId;

            // Cooldown: 3 seconds between spins
            if (checkCooldown(interaction, 'slots', 3000)) return;

            // Validate bet against VIP limits
            const betValidation = await validateBet(interaction.user.id, bet, 1, 1000);
            if (!betValidation.valid) {
                return await interaction.reply({
                    content: betValidation.message,
                    ephemeral: true
                });
            }

            // Check if user is gambling banned
            if (await checkGamblingBan(interaction)) return;

            // Check if user has enough money
            if (userMoney < bet) {
                return await interaction.reply({
                    content: `❌ You don't have enough money! You have ${userMoney.toLocaleString()}.`,
                    ephemeral: true
                });
            }

            // All checks passed — set cooldown
            setCooldown(interaction, 'slots', 3000);

            // Contribute to jackpot (0.5% of bet)
            if (serverId) {
                const jackpotContribution = Math.floor(bet * 0.005);
                await addToJackpot(serverId, jackpotContribution);
            }

            // Check for jackpot win (0.05% chance = 1 in 2000)
            const jackpotChance = Math.random();
            const wonJackpot = jackpotChance < 0.0005 && serverId; // 0.05% chance

            let jackpotAmount = 0;
            if (wonJackpot) {
                const jackpotData = await getServerJackpot(serverId);
                if (jackpotData && jackpotData.currentAmount > 0) {
                    jackpotAmount = jackpotData.currentAmount;
                    await resetJackpot(serverId, interaction.user.id, jackpotAmount);
                }
            }

            // Deduct bet, spin, then credit net result in one final write
            // (avoids leaving user short-changed if an error occurs between two setUserMoney calls)
            const slotsGame = new SlotsGame(interaction.user.id, bet);

            // Apply holiday bonus to slot winnings (not jackpot)
            let adjustedSlotWinnings = applyHolidayWinningsBonus(slotsGame.winnings);

            // Apply guild shop winnings boost (Lucky Streak, etc)
            adjustedSlotWinnings = await applyWinningsBoost(interaction.user.id, adjustedSlotWinnings);

            // Add jackpot to winnings if won
            const totalWinnings = adjustedSlotWinnings + jackpotAmount;

            // Single atomic write: deduct bet and credit winnings together
            await setUserMoney(interaction.user.id, userMoney - bet + totalWinnings);

            // Record the game result
            await recordGameResult(
                interaction.user.id,
                'slots',
                bet,
                totalWinnings,
                totalWinnings > 0 ? 'win' : 'lose'
            );

            // Award guild XP (async, don't wait)
            awardWagerXP(interaction.user.id, bet, 'Slots').catch(err =>
                console.error('Error awarding wager XP:', err)
            );
            const won = totalWinnings > 0;
            awardGameXP(interaction.user.id, 'Slots', won).catch(err =>
                console.error('Error awarding game XP:', err)
            );

            // Record to active guild events (async, don't wait)
            let eventResults = null;
            try {
                eventResults = await recordGameToEvents(interaction.user.id, 'Slots', bet, totalWinnings);
            } catch (err) {
                console.error('Error recording game to events:', err);
            }

            // Create and send the result
            const embed = await createGameEmbed(slotsGame, interaction.user.id, interaction.client);
            const buttons = await createButtons(slotsGame, interaction.user.id, interaction.client);

            // Add event notifications to embed
            if (eventResults) {
                const notifications = getEventNotifications(eventResults);
                if (notifications.length > 0) {
                    embed.addFields({
                        name: '🎉 Guild Event Progress',
                        value: notifications.join('\n'),
                        inline: false
                    });
                }
            }

            // Add jackpot info to embed
            if (serverId) {
                const currentJackpot = await getServerJackpot(serverId);
                if (currentJackpot) {
                    embed.addFields({
                        name: '💎 Progressive Jackpot',
                        value: `Current: $${currentJackpot.currentAmount.toLocaleString()}`,
                        inline: true
                    });
                }
            }

            // If jackpot was won, announce it!
            if (wonJackpot && jackpotAmount > 0) {
                embed.setColor('#FFD700');
                embed.setTitle('💎🎰 JACKPOT WINNER! 🎰💎');
                embed.addFields({
                    name: '🎉 PROGRESSIVE JACKPOT WON!',
                    value: `**$${jackpotAmount.toLocaleString()}**\n🏆 Congratulations! 🏆`,
                    inline: false
                });

                // Announce in channel
                try {
                    await interaction.channel.send({
                        content: `🎉🎉🎉 **JACKPOT ALERT!** 🎉🎉🎉\n<@${interaction.user.id}> just won the **$${jackpotAmount.toLocaleString()}** Progressive Jackpot on Slots! 💎🎰`
                    });
                } catch (error) {
                    console.error('Error sending jackpot announcement:', error);
                }
            }

            await interaction.reply({
                embeds: [embed],
                components: buttons ? [buttons] : []
            });

        } catch (error) {
            console.error('Error in slots command:', error);

            const errorMessage = {
                content: '❌ An error occurred while playing slots. Please try again.',
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