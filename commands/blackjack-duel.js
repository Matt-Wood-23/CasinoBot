const { getUserMoney, setUserMoney } = require('../utils/data');
const { createGameEmbed } = require('../utils/embeds');
const { validateBet } = require('../utils/vip');
const { checkGamblingBan, checkCooldown, setCooldown } = require('../utils/guardChecks');
const BlackjackGame = require('../gameLogic/blackjackGame');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: {
        name: 'blackjack-duel',
        description: 'Challenge another player to a PvP Blackjack duel!',
        options: [
            {
                name: 'user',
                description: 'The player you want to challenge',
                type: 6,
                required: true
            },
            {
                name: 'bet',
                description: 'Amount to bet (10-50,000)',
                type: 4,
                required: true,
                min_value: 10,
                max_value: 50000
            }
        ]
    },

    async execute(interaction, activeGames) {
        const targetUser = interaction.options.getUser('user');
        const bet = interaction.options.getInteger('bet');
        const challengerId = interaction.user.id;
        let userMoney = null;
        let moneyDeducted = false;

        try {
            // Cooldown: 10 seconds between duel challenges
            if (checkCooldown(interaction, 'blackjack-duel', 10000)) return;

            // Validate target
            if (targetUser.id === challengerId) {
                return await interaction.reply({
                    content: '❌ You cannot challenge yourself!',
                    ephemeral: true
                });
            }

            if (targetUser.bot) {
                return await interaction.reply({
                    content: '❌ You cannot challenge bots!',
                    ephemeral: true
                });
            }

            userMoney = await getUserMoney(challengerId);

            // Validate bet against VIP limits
            const betValidation = await validateBet(challengerId, bet, 10, 50000);
            if (!betValidation.valid) {
                return await interaction.reply({
                    content: betValidation.message,
                    ephemeral: true
                });
            }

            // Check gambling ban
            if (await checkGamblingBan(interaction)) return;

            // Check if challenger has enough money
            if (userMoney < bet) {
                return await interaction.reply({
                    content: `❌ You don't have enough money! You have ${userMoney.toLocaleString()}.`,
                    ephemeral: true
                });
            }

            // Check if there's already an active duel challenge between these players
            const challengeKey = `duel_challenge_${challengerId}_${targetUser.id}`;
            if (activeGames.has(challengeKey)) {
                return await interaction.reply({
                    content: `❌ You already have a pending challenge with ${targetUser.username}!`,
                    ephemeral: true
                });
            }

            // Check if either player is already in a duel game
            for (const [key, game] of activeGames) {
                if (key.startsWith('duel_game_') && game.isDuel) {
                    if (game.players.has(challengerId) || game.players.has(targetUser.id)) {
                        return await interaction.reply({
                            content: '❌ One of you is already in a duel game! Wait for it to finish.',
                            ephemeral: true
                        });
                    }
                }
            }

            // Set cooldown
            setCooldown(interaction, 'blackjack-duel', 10000);

            // Deduct bet from challenger (held until accepted or cancelled)
            await setUserMoney(challengerId, userMoney - bet);
            moneyDeducted = true;

            // Store challenge state
            const challengeData = {
                challengerId,
                challengedId: targetUser.id,
                bet,
                channelId: interaction.channelId,
                serverId: interaction.guildId,
                createdAt: Date.now()
            };
            activeGames.set(challengeKey, challengeData);

            // Create challenge embed
            const challengeEmbed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('⚔️ Blackjack Duel Challenge!')
                .setDescription(`${interaction.user.tag} is challenging ${targetUser.tag} to a PvP Blackjack duel!`)
                .addFields(
                    { name: 'Bet Amount', value: `${bet.toLocaleString()}`, inline: true },
                    { name: 'Pot', value: `${(bet * 2).toLocaleString()}`, inline: true },
                    { name: 'Rules', value: 'Head-to-head blackjack! Higher score without busting wins the pot.', inline: false }
                )
                .setFooter({ text: 'Challenge expires in 2 minutes' })
                .setTimestamp();

            // Create accept/cancel buttons
            const acceptButton = new ButtonBuilder()
                .setCustomId(`duel_accept_${challengerId}_${targetUser.id}`)
                .setLabel('Accept')
                .setStyle(ButtonStyle.Success);

            const cancelButton = new ButtonBuilder()
                .setCustomId(`duel_cancel_${challengerId}_${targetUser.id}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder()
                .addComponents(acceptButton, cancelButton);

            const reply = await interaction.reply({
                content: `${targetUser}`,
                embeds: [challengeEmbed],
                components: [row],
                fetchReply: true
            });

            // Auto-cancel after 2 minutes if not accepted
            setTimeout(async () => {
                if (activeGames.has(challengeKey)) {
                    activeGames.delete(challengeKey);

                    // Refund challenger
                    const currentMoney = await getUserMoney(challengerId);
                    await setUserMoney(challengerId, currentMoney + bet);

                    try {
                        const message = await interaction.channel.messages.fetch(reply.id);
                        await message.edit({
                            content: '❌ Challenge expired - no response from challenged player.',
                            embeds: [],
                            components: []
                        });
                    } catch (e) {
                        // Message may have been deleted
                    }
                }
            }, 120000);

        } catch (error) {
            console.error('Error in blackjack-duel command:', error);

            // Refund money if it was deducted
            if (moneyDeducted && userMoney !== null) {
                try {
                    await setUserMoney(challengerId, userMoney);
                    console.log(`Refunded bet to user ${challengerId} due to duel startup error`);
                } catch (refundError) {
                    console.error('Error refunding bet after failure:', refundError);
                }
            }

            const errorMessage = {
                content: `❌ An error occurred while creating the duel challenge. If your bet was deducted, it has been refunded.`,
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
