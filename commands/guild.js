const { EmbedBuilder } = require('discord.js');
const {
    createGuild,
    joinGuild,
    leaveGuild,
    donateToGuild,
    getUserGuild,
    getGuildLeaderboards
} = require('../utils/guilds');
const { getUserMoney } = require('../utils/data');

module.exports = {
    data: {
        name: 'guild',
        description: 'Manage your guild',
        options: [
            {
                name: 'action',
                description: 'Guild action',
                type: 3, // STRING
                required: true,
                choices: [
                    { name: 'Create - Create a new guild ($25,000)', value: 'create' },
                    { name: 'Join - Join an existing guild', value: 'join' },
                    { name: 'Leave - Leave your current guild', value: 'leave' },
                    { name: 'Info - View your guild info', value: 'info' },
                    { name: 'Donate - Donate to guild treasury', value: 'donate' },
                    { name: 'Members - View guild members', value: 'members' },
                    { name: 'Leaderboard - View guild leaderboards', value: 'leaderboard' }
                ]
            },
            {
                name: 'guild_name',
                description: 'Guild name (for create/join actions)',
                type: 3, // STRING
                required: false
            },
            {
                name: 'amount',
                description: 'Amount to donate (for donate action)',
                type: 4, // INTEGER
                required: false,
                min_value: 100
            }
        ]
    },

    async execute(interaction) {
        try {
            const userId = interaction.user.id;
            const action = interaction.options.getString('action');

            switch (action) {
                case 'create':
                    await createGuildCommand(interaction, userId);
                    break;
                case 'join':
                    await joinGuildCommand(interaction, userId);
                    break;
                case 'leave':
                    await leaveGuildCommand(interaction, userId);
                    break;
                case 'info':
                    await showGuildInfo(interaction, userId);
                    break;
                case 'donate':
                    await donateToGuildCommand(interaction, userId);
                    break;
                case 'members':
                    await showGuildMembers(interaction, userId);
                    break;
                case 'leaderboard':
                    await showGuildLeaderboard(interaction);
                    break;
                default:
                    await interaction.reply({
                        content: '❌ Invalid action!',
                        ephemeral: true
                    });
            }

        } catch (error) {
            console.error('Error in guild command:', error);

            const errorMessage = {
                content: '❌ An error occurred while processing your guild request. Please try again.',
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

async function createGuildCommand(interaction, userId) {
    const guildName = interaction.options.getString('guild_name');

    if (!guildName) {
        return interaction.reply({
            content: '❌ Please provide a guild name! Example: `/guild create My Guild`',
            ephemeral: true
        });
    }

    await interaction.deferReply();

    const result = await createGuild(userId, guildName);

    if (!result.success) {
        const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Guild Creation Failed')
            .setDescription(result.message)
            .setTimestamp();

        return interaction.editReply({ embeds: [errorEmbed] });
    }

    const guild = result.guild;

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ Guild Created!')
        .setDescription(`**${guild.name}**\nYou are now the guild owner!`)
        .addFields(
            {
                name: '💰 Creation Cost',
                value: '$25,000',
                inline: true
            },
            {
                name: '👥 Members',
                value: `${guild.members.length}/10`,
                inline: true
            },
            {
                name: '💵 Treasury',
                value: `$${guild.treasury.toLocaleString()}`,
                inline: true
            }
        )
        .setFooter({ text: 'Invite friends with /guild join' })
        .setTimestamp();

    const currentMoney = await getUserMoney(userId);
    embed.addFields({
        name: '💳 Your Balance',
        value: `$${currentMoney.toLocaleString()}`,
        inline: true
    });

    await interaction.editReply({ embeds: [embed] });
}

async function joinGuildCommand(interaction, userId) {
    const guildName = interaction.options.getString('guild_name');

    if (!guildName) {
        return interaction.reply({
            content: '❌ Please provide a guild name! Example: `/guild join Guild Name`',
            ephemeral: true
        });
    }

    await interaction.deferReply();

    const result = await joinGuild(userId, guildName);

    if (!result.success) {
        const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Failed to Join Guild')
            .setDescription(result.message)
            .setTimestamp();

        return interaction.editReply({ embeds: [errorEmbed] });
    }

    const guild = result.guild;

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ Joined Guild!')
        .setDescription(`Welcome to **${guild.name}**!`)
        .addFields(
            {
                name: '👥 Members',
                value: `${guild.members.length}/10`,
                inline: true
            },
            {
                name: '💵 Treasury',
                value: `$${guild.treasury.toLocaleString()}`,
                inline: true
            }
        )
        .setFooter({ text: 'Use /guild donate to contribute to the treasury' })
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function leaveGuildCommand(interaction, userId) {
    await interaction.deferReply();

    const result = await leaveGuild(userId);

    if (!result.success) {
        const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Failed to Leave Guild')
            .setDescription(result.message)
            .setTimestamp();

        return interaction.editReply({ embeds: [errorEmbed] });
    }

    const embed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle(result.disbanded ? '⚠️ Guild Disbanded' : '👋 Left Guild')
        .setDescription(result.disbanded
            ? 'The guild has been disbanded as you were the last member.'
            : 'You have left the guild.')
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}

async function showGuildInfo(interaction, userId) {
    const guild = await getUserGuild(userId);

    if (!guild) {
        return interaction.reply({
            content: '❌ You\'re not in a guild! Use `/guild create` or `/guild join` to get started.',
            ephemeral: true
        });
    }

    const ownerUser = await interaction.client.users.fetch(guild.ownerId).catch(() => null);

    const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle(`🏰 ${guild.name}`)
        .setDescription('Guild Information')
        .addFields(
            {
                name: '👑 Owner',
                value: ownerUser ? ownerUser.username : 'Unknown',
                inline: true
            },
            {
                name: '👥 Members',
                value: `${guild.members.length}/10`,
                inline: true
            },
            {
                name: '💵 Treasury',
                value: `$${guild.treasury.toLocaleString()}`,
                inline: true
            }
        )
        .setTimestamp();

    const createdDate = new Date(guild.createdAt);
    embed.setFooter({ text: `Created on ${createdDate.toLocaleDateString()}` });

    await interaction.reply({ embeds: [embed] });
}

async function donateToGuildCommand(interaction, userId) {
    const amount = interaction.options.getInteger('amount');

    if (!amount) {
        return interaction.reply({
            content: '❌ Please specify an amount to donate! Example: `/guild donate 1000`',
            ephemeral: true
        });
    }

    await interaction.deferReply();

    const result = await donateToGuild(userId, amount);

    if (!result.success) {
        const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Donation Failed')
            .setDescription(result.message)
            .setTimestamp();

        return interaction.editReply({ embeds: [errorEmbed] });
    }

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('💰 Donation Successful!')
        .setDescription(`You donated **$${result.amount.toLocaleString()}** to your guild!`)
        .addFields({
            name: '🏛️ Guild Treasury',
            value: `$${result.newTreasury.toLocaleString()}`,
            inline: true
        })
        .setTimestamp();

    const currentMoney = await getUserMoney(userId);
    embed.addFields({
        name: '💳 Your Balance',
        value: `$${currentMoney.toLocaleString()}`,
        inline: true
    });

    await interaction.editReply({ embeds: [embed] });
}

async function showGuildMembers(interaction, userId) {
    const guild = await getUserGuild(userId);

    if (!guild) {
        return interaction.reply({
            content: '❌ You\'re not in a guild!',
            ephemeral: true
        });
    }

    const embed = new EmbedBuilder()
        .setColor('#00D9FF')
        .setTitle(`👥 ${guild.name} - Members`)
        .setTimestamp();

    // Sort members by contribution
    const sortedMembers = [...guild.members].sort((a, b) => b.contributedTotal - a.contributedTotal);

    const memberList = await Promise.all(sortedMembers.map(async (member) => {
        const user = await interaction.client.users.fetch(member.userId).catch(() => null);
        const username = user ? user.username : 'Unknown User';
        const isOwner = member.userId === guild.ownerId ? '👑' : '';
        const contribution = member.contributedTotal > 0 ? `(Contributed: $${member.contributedTotal.toLocaleString()})` : '';

        return `${isOwner} **${username}** ${contribution}`;
    }));

    embed.setDescription(memberList.join('\n') || 'No members');
    embed.setFooter({ text: `${guild.members.length}/10 members` });

    await interaction.reply({ embeds: [embed] });
}

async function showGuildLeaderboard(interaction) {
    const leaderboards = await getGuildLeaderboards();

    const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('🏆 Guild Leaderboards')
        .setTimestamp();

    // By Wealth
    if (leaderboards.byWealth.length > 0) {
        const wealthText = leaderboards.byWealth.slice(0, 5).map((guild, index) => {
            return `${index + 1}. **${guild.name}** - $${guild.totalWealth.toLocaleString()} (${guild.memberCount} members)`;
        }).join('\n');

        embed.addFields({
            name: '💰 Top Guilds by Total Wealth',
            value: wealthText,
            inline: false
        });
    }

    // By Games Won
    if (leaderboards.byGamesWon.length > 0) {
        const gamesText = leaderboards.byGamesWon.slice(0, 5).map((guild, index) => {
            return `${index + 1}. **${guild.name}** - ${guild.totalGamesWon.toLocaleString()} wins`;
        }).join('\n');

        embed.addFields({
            name: '🎮 Top Guilds by Games Won',
            value: gamesText,
            inline: false
        });
    }

    // By Wagered
    if (leaderboards.byWagered.length > 0) {
        const wageredText = leaderboards.byWagered.slice(0, 5).map((guild, index) => {
            return `${index + 1}. **${guild.name}** - $${guild.totalWagered.toLocaleString()} wagered`;
        }).join('\n');

        embed.addFields({
            name: '💸 Top Guilds by Total Wagered',
            value: wageredText,
            inline: false
        });
    }

    if (leaderboards.byWealth.length === 0) {
        embed.setDescription('No guilds exist yet! Create one with `/guild create`');
    }

    await interaction.reply({ embeds: [embed] });
}
