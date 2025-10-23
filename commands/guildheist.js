const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
    startGuildHeist,
    executeGuildHeist,
    getActiveGuildHeist,
    GUILD_HEIST_COST_PER_PERSON,
    GUILD_HEIST_MIN_MEMBERS
} = require('../utils/heist');
const { getUserGuild } = require('../utils/guilds');
const { getUserMoney } = require('../utils/data');

module.exports = {
    data: {
        name: 'guildheist',
        description: 'Start a guild heist! Better odds with more members ($10,000 entry per person)'
    },

    async execute(interaction) {
        try {
            const userId = interaction.user.id;

            // Check if user is in a guild
            const guild = getUserGuild(userId);
            if (!guild) {
                return interaction.reply({
                    content: '❌ You must be in a guild to start a guild heist!\n\nUse `/guild join` or `/guild create` to get started.',
                    ephemeral: true
                });
            }

            // Check if user can afford
            const currentMoney = await getUserMoney(userId);
            if (currentMoney < GUILD_HEIST_COST_PER_PERSON) {
                return interaction.reply({
                    content: `❌ You need $${GUILD_HEIST_COST_PER_PERSON.toLocaleString()} to start a guild heist!\n\nYou have: $${currentMoney.toLocaleString()}`,
                    ephemeral: true
                });
            }

            // Start the guild heist
            const result = startGuildHeist(guild.id, userId);

            if (!result.success) {
                return interaction.reply({
                    content: `❌ ${result.message}`,
                    ephemeral: true
                });
            }

            // Show signup embed
            const signupEmbed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle(`🎭 ${guild.name} - Guild Heist Starting!`)
                .setDescription(`💼 **${interaction.user.username}** is organizing a heist!\n\n` +
                    `Guild members have **60 seconds** to join!\n\n` +
                    `**How It Works:**\n` +
                    `• Entry: $${GUILD_HEIST_COST_PER_PERSON.toLocaleString()} per person\n` +
                    `• Minimum ${GUILD_HEIST_MIN_MEMBERS} members required\n` +
                    `• Success Rate: 30% + 4% per member\n` +
                    `• Success: 5x-15x multiplier (split evenly)\n` +
                    `• Failure: 8-hour gambling ban + fine\n\n` +
                    `**Current Participants:** 1`)
                .setFooter({ text: 'Click "Join Heist" to participate!' })
                .setTimestamp();

            const joinButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`guildheist_join_${guild.id}`)
                        .setLabel('Join Heist')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🎭')
                );

            await interaction.reply({ embeds: [signupEmbed], components: [joinButton] });

            // Wait 60 seconds for signups
            await new Promise(resolve => setTimeout(resolve, 60000));

            // Get updated heist data
            const heist = getActiveGuildHeist(guild.id);

            if (!heist) {
                const cancelledEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Guild Heist Cancelled')
                    .setDescription('The heist was cancelled.')
                    .setTimestamp();

                return interaction.editReply({ embeds: [cancelledEmbed], components: [] });
            }

            if (heist.participants.length < GUILD_HEIST_MIN_MEMBERS) {
                const cancelledEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Guild Heist Cancelled')
                    .setDescription(`Not enough participants! Minimum ${GUILD_HEIST_MIN_MEMBERS} members required.\n\nOnly ${heist.participants.length} member(s) joined.`)
                    .setTimestamp();

                return interaction.editReply({ embeds: [cancelledEmbed], components: [] });
            }

            // Disable join button
            const disabledButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('guildheist_join_disabled')
                        .setLabel('Signup Closed')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true)
                );

            await interaction.editReply({ components: [disabledButton] });

            // Show planning phase
            const planningEmbed = new EmbedBuilder()
                .setColor('#808080')
                .setTitle(`🎭 ${guild.name} - Guild Heist`)
                .setDescription(`💼 Planning the heist...\n\n👥 ${heist.participants.length} members ready\n\n🗺️ Studying the blueprints...`)
                .setTimestamp();

            await interaction.editReply({ embeds: [planningEmbed], components: [] });

            // Wait for dramatic effect
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Show preparation
            const prepEmbed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle(`🎭 ${guild.name} - Guild Heist`)
                .setDescription(`👥 Crew assembled: ${heist.participants.length} members\n\n🔫 Loading equipment...\n\n🚗 Vehicles ready!`)
                .setTimestamp();

            await interaction.editReply({ embeds: [prepEmbed] });

            // Wait again
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Show infiltration
            const infiltrateEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle(`🎭 ${guild.name} - Guild Heist IN PROGRESS`)
                .setDescription(`🚨 Infiltrating the casino...\n\n⏰ Bypassing security systems...\n\n💰 Approaching the vault...`)
                .setFooter({ text: 'No turning back now!' })
                .setTimestamp();

            await interaction.editReply({ embeds: [infiltrateEmbed] });

            // Wait for final suspense
            await new Promise(resolve => setTimeout(resolve, 2500));

            // Execute the heist
            const heistResult = await executeGuildHeist(guild.id);

            if (!heistResult.success) {
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Heist Error')
                    .setDescription(heistResult.message)
                    .setTimestamp();

                return interaction.editReply({ embeds: [errorEmbed] });
            }

            if (heistResult.heistSuccess) {
                // SUCCESS!
                const successEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ GUILD HEIST SUCCESSFUL!')
                    .setDescription(`🎉 **${guild.name}** pulled it off! The crew escaped with the loot!\n\n💰 **THE SCORE**`)
                    .addFields(
                        {
                            name: '👥 Participants',
                            value: `${heistResult.participantCount} members`,
                            inline: true
                        },
                        {
                            name: '🎯 Success Rate',
                            value: `${heistResult.successRate}%`,
                            inline: true
                        },
                        {
                            name: '💸 Multiplier',
                            value: `${heistResult.multiplier}x`,
                            inline: true
                        },
                        {
                            name: '💵 Total Winnings',
                            value: `$${heistResult.totalWinnings.toLocaleString()}`,
                            inline: false
                        },
                        {
                            name: '💰 Your Share',
                            value: `$${heistResult.winningsPerPerson.toLocaleString()}`,
                            inline: true
                        },
                        {
                            name: '📊 Your Net Profit',
                            value: `$${heistResult.netProfitPerPerson.toLocaleString()}`,
                            inline: true
                        }
                    )
                    .setFooter({ text: 'The perfect crime! Guild heist available again in 24 hours.' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [successEmbed] });

            } else {
                // FAILURE!
                const failureEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('🚨 GUILD HEIST FAILED!')
                    .setDescription(`❌ **${guild.name}** got caught! Security caught the crew!\n\n⚠️ **CONSEQUENCES FOR ALL PARTICIPANTS**`)
                    .addFields(
                        {
                            name: '👥 Participants',
                            value: `${heistResult.participantCount} members`,
                            inline: true
                        },
                        {
                            name: '🎯 Success Rate Was',
                            value: `${heistResult.successRate}%`,
                            inline: true
                        },
                        {
                            name: '💸 Entry Fee Lost',
                            value: `$${GUILD_HEIST_COST_PER_PERSON.toLocaleString()}`,
                            inline: true
                        },
                        {
                            name: '⚖️ Fine Per Person',
                            value: `$${heistResult.finePerPerson.toLocaleString()}`,
                            inline: true
                        },
                        {
                            name: '📊 Total Loss Per Person',
                            value: `$${heistResult.totalLossPerPerson.toLocaleString()}`,
                            inline: true
                        },
                        {
                            name: '🚫 Gambling Ban',
                            value: `${heistResult.gamblingBanHours} hours`,
                            inline: true
                        },
                        {
                            name: '⏰ Next Guild Heist',
                            value: '24 hours',
                            inline: false
                        }
                    )
                    .setFooter({ text: 'Better coordination next time!' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [failureEmbed] });
            }

        } catch (error) {
            console.error('Error in guildheist command:', error);

            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error')
                .setDescription('The guild heist was compromised! Try again later.')
                .setTimestamp();

            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ embeds: [errorEmbed], components: [] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
};
