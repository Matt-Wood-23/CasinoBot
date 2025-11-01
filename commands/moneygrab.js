const { EmbedBuilder } = require('discord.js');
const { getUserMoney, setUserMoney, getAllUserData } = require('../utils/data');
const { ADMIN_USER_ID } = require('../config');

module.exports = {
    data: {
        name: 'moneygrab',
        description: '[ADMIN ONLY] Start a 30-second money grab event',
        options: [
            {
                name: 'amount',
                description: 'Amount to give (default: 1000)',
                type: 4,
                required: false,
                min_value: 100,
                max_value: 100000
            }
        ]
    },

    async execute(interaction) {
        try {
            // Check if user is admin
            if (interaction.user.id !== ADMIN_USER_ID) {
                return interaction.reply({
                    content: '❌ This command is only available to administrators!',
                    ephemeral: true
                });
            }

            const amount = interaction.options.getInteger('amount') || 1000;

            // Get all registered users and create mention string
            const allUserData = await getAllUserData();
            const userIds = Object.keys(allUserData);

            // Split mentions into chunks to avoid message length limits (Discord has 2000 char limit)
            const mentionChunks = [];
            let currentChunk = '';

            for (const userId of userIds) {
                const mention = `<@${userId}> `;
                if ((currentChunk + mention).length > 1900) {
                    mentionChunks.push(currentChunk);
                    currentChunk = mention;
                } else {
                    currentChunk += mention;
                }
            }
            if (currentChunk) {
                mentionChunks.push(currentChunk);
            }

            // Create the initial money grab embed
            const createEmbed = (timeLeft) => {
                return new EmbedBuilder()
                    .setTitle('💰 MONEY GRAB! 💰')
                    .setDescription(
                        `**React with 💰 to claim ${amount.toLocaleString()}!**\n\n` +
                        `⏰ Time remaining: **${timeLeft} seconds**\n` +
                        `React now to claim your money!`
                    )
                    .setColor(timeLeft > 10 ? '#FFD700' : timeLeft > 5 ? '#FFA500' : '#FF0000')
                    .setFooter({ text: `${timeLeft} seconds remaining` })
                    .setTimestamp();
            };

            // Send initial message with mentions
            let messageContent = mentionChunks.length > 0 ? mentionChunks[0] : '';
            const message = await interaction.reply({
                content: messageContent || '🚨 **MONEY GRAB ALERT!** 🚨',
                embeds: [createEmbed(30)],
                fetchReply: true
            });

            // Send additional mention chunks as follow-up messages if needed
            for (let i = 1; i < mentionChunks.length; i++) {
                await interaction.followUp({
                    content: mentionChunks[i],
                    ephemeral: false
                });
            }

            // Add the money bag reaction
            await message.react('💰');

            // Track users who already claimed
            const claimedUsers = new Set();

            // Create reaction collector
            const filter = (reaction, user) => {
                return reaction.emoji.name === '💰' && !user.bot;
            };

            const collector = message.createReactionCollector({
                filter,
                time: 30000 // 30 seconds
            });

            collector.on('collect', async (reaction, user) => {
                // Check if user already claimed
                if (claimedUsers.has(user.id)) {
                    return;
                }

                claimedUsers.add(user.id);

                // Give money to user
                try {
                    const currentMoney = await getUserMoney(user.id);
                    await setUserMoney(user.id, currentMoney + amount);

                    console.log(`Money grab: ${user.username} claimed ${amount}`);
                } catch (error) {
                    console.error(`Error giving money to ${user.username}:`, error);
                }
            });

            // Countdown timer - update every 5 seconds, but don't block the collector
            const startTime = Date.now();
            const countdownTimer = setInterval(async () => {
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                const timeLeft = 30 - elapsed;

                if (timeLeft <= 0) {
                    clearInterval(countdownTimer);
                    return;
                }

                // Update at specific intervals: 25, 20, 15, 10, 5, 4, 3, 2, 1
                if ([25, 20, 15, 10, 5, 4, 3, 2, 1].includes(timeLeft)) {
                    try {
                        await message.edit({
                            content: messageContent || '🚨 **MONEY GRAB ALERT!** 🚨',
                            embeds: [createEmbed(timeLeft)]
                        });
                    } catch (error) {
                        console.error('Error updating countdown:', error);
                    }
                }
            }, 1000); // Check every second

            collector.on('end', async (collected) => {
                clearInterval(countdownTimer);

                // Process any remaining reactions that weren't caught by the collector
                try {
                    const reaction = message.reactions.cache.get('💰');
                    if (reaction) {
                        const users = await reaction.users.fetch();
                        for (const [userId, user] of users) {
                            if (!user.bot && !claimedUsers.has(userId)) {
                                claimedUsers.add(userId);
                                try {
                                    const currentMoney = await getUserMoney(userId);
                                    await setUserMoney(userId, currentMoney + amount);
                                    console.log(`Money grab (end): ${user.username} claimed ${amount}`);
                                } catch (error) {
                                    console.error(`Error giving money to ${user.username}:`, error);
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error fetching final reactions:', error);
                }

                // Update embed to show it's over
                const endEmbed = new EmbedBuilder()
                    .setTitle('💰 MONEY GRAB - ENDED! 💰')
                    .setDescription(
                        `**The money grab has ended!**\n\n` +
                        `${claimedUsers.size} player${claimedUsers.size !== 1 ? 's' : ''} claimed ${amount.toLocaleString()}!\n` +
                        `Total distributed: **${(claimedUsers.size * amount).toLocaleString()}**`
                    )
                    .setColor('#808080')
                    .setTimestamp();

                try {
                    await message.edit({
                        content: '⏰ **ENDED**',
                        embeds: [endEmbed]
                    });

                    // Remove all reactions AFTER counting them
                    await message.reactions.removeAll();
                } catch (error) {
                    console.error('Error updating money grab message:', error);
                }

                console.log(`Money grab ended. ${claimedUsers.size} users claimed ${amount} each.`);
            });

        } catch (error) {
            console.error('Error in moneygrab command:', error);

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ An error occurred while starting the money grab. Please try again.',
                    ephemeral: true
                });
            }
        }
    }
};
