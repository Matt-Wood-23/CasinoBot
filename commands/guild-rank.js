const { EmbedBuilder } = require('discord.js');
const { getUserGuild } = require('../utils/guilds');
const {
    hasPermission,
    isGuildLeader,
    canManageMember,
    getRankEmoji,
    formatPermissions
} = require('../utils/guildRanks');
const {
    getGuildRanks,
    getMemberRank,
    assignMemberRank,
    getGuildWithLevel,
    getGuildMembers
} = require('../database/queries');

module.exports = {
    data: {
        name: 'guild-rank',
        description: 'Manage guild ranks (Leader only)',
        options: [
            {
                name: 'action',
                description: 'Rank action',
                type: 3, // STRING
                required: true,
                choices: [
                    { name: 'Assign - Assign rank to a member', value: 'assign' },
                    { name: 'List - View all ranks', value: 'list' },
                    { name: 'View - View a member\'s rank', value: 'view' }
                ]
            },
            {
                name: 'member',
                description: 'Guild member to manage',
                type: 6, // USER
                required: false
            },
            {
                name: 'rank',
                description: 'Rank name to assign',
                type: 3, // STRING
                required: false
            }
        ]
    },

    async execute(interaction) {
        try {
            const userId = interaction.user.id;
            const action = interaction.options.getString('action');

            switch (action) {
                case 'assign':
                    await assignRankCommand(interaction, userId);
                    break;
                case 'list':
                    await listRanksCommand(interaction, userId);
                    break;
                case 'view':
                    await viewMemberRankCommand(interaction, userId);
                    break;
                default:
                    await interaction.reply({
                        content: '❌ Invalid action!',
                        ephemeral: true
                    });
            }
        } catch (error) {
            console.error('Error in guild-rank command:', error);
            await interaction.reply({
                content: '❌ An error occurred while processing your request.',
                ephemeral: true
            });
        }
    }
};

// Assign rank to member
async function assignRankCommand(interaction, userId) {
    const targetUser = interaction.options.getUser('member');
    const rankName = interaction.options.getString('rank');

    if (!targetUser || !rankName) {
        return interaction.reply({
            content: '❌ Please specify both a member and a rank! Example: `/guild-rank assign member:@user rank:Officer`',
            ephemeral: true
        });
    }

    const userGuild = await getUserGuild(userId);

    if (!userGuild) {
        return interaction.reply({
            content: '❌ You\'re not in a guild!',
            ephemeral: true
        });
    }

    // Check if user has manage_ranks permission
    const canManageRanks = await hasPermission(userGuild.guildId, userId, 'manage_ranks');

    if (!canManageRanks) {
        return interaction.reply({
            content: '❌ You don\'t have permission to manage ranks! Only Leaders can manage ranks.',
            ephemeral: true
        });
    }

    // Check if target user is in the same guild
    const targetGuild = await getUserGuild(targetUser.id);

    if (!targetGuild || targetGuild.guildId !== userGuild.guildId) {
        return interaction.reply({
            content: '❌ That user is not in your guild!',
            ephemeral: true
        });
    }

    // Check if user can manage this member (rank hierarchy)
    const canManage = await canManageMember(userGuild.guildId, userId, targetUser.id);

    if (!canManage) {
        return interaction.reply({
            content: '❌ You cannot manage this member! You can only manage members with lower ranks than yours.',
            ephemeral: true
        });
    }

    // Get all ranks and find the target rank
    const ranks = await getGuildRanks(userGuild.guildId);
    const targetRank = ranks.find(r => r.rankName.toLowerCase() === rankName.toLowerCase());

    if (!targetRank) {
        const availableRanks = ranks.map(r => r.rankName).join(', ');
        return interaction.reply({
            content: `❌ Rank not found! Available ranks: ${availableRanks}`,
            ephemeral: true
        });
    }

    // Don't allow assigning leader rank
    if (targetRank.rankOrder === 0) {
        return interaction.reply({
            content: '❌ The Leader rank cannot be manually assigned! Transfer guild leadership using a separate command.',
            ephemeral: true
        });
    }

    // Assign the rank
    const result = await assignMemberRank(userGuild.guildId, targetUser.id, targetRank.id, userId);

    if (!result.success) {
        return interaction.reply({
            content: `❌ Failed to assign rank: ${result.error}`,
            ephemeral: true
        });
    }

    const guild = await getGuildWithLevel(userGuild.guildId);
    const emoji = getRankEmoji(targetRank.rankOrder);

    const embed = new EmbedBuilder()
        .setColor('#9B59B6')
        .setTitle('✅ Rank Assigned Successfully')
        .setDescription(`<@${targetUser.id}> has been assigned the **${emoji} ${targetRank.rankName}** rank in ${guild.name}!`)
        .addFields({
            name: '📊 Rank Details',
            value: `**Order:** ${targetRank.rankOrder}\n**Previous Rank:** ${result.oldRank || 'None'}\n**New Rank:** ${result.newRank}`,
            inline: false
        })
        .setTimestamp()
        .setFooter({ text: `Changed by ${interaction.user.username}` });

    await interaction.reply({ embeds: [embed] });
}

// List all ranks
async function listRanksCommand(interaction, userId) {
    const userGuild = await getUserGuild(userId);

    if (!userGuild) {
        return interaction.reply({
            content: '❌ You\'re not in a guild!',
            ephemeral: true
        });
    }

    const guild = await getGuildWithLevel(userGuild.guildId);
    const ranks = await getGuildRanks(userGuild.guildId);
    const memberRank = await getMemberRank(userGuild.guildId, userId);

    const embed = new EmbedBuilder()
        .setColor('#9B59B6')
        .setTitle(`${guild.name} - Guild Ranks`)
        .setDescription(`Your current rank: **${memberRank ? memberRank.rankName : 'No Rank'}**\n\nAll available ranks:`)
        .setTimestamp();

    for (const rank of ranks) {
        const emoji = getRankEmoji(rank.rankOrder);
        const permList = formatPermissions(rank.permissions);

        embed.addFields({
            name: `${emoji} ${rank.rankName} (Order: ${rank.rankOrder})`,
            value: `**Permissions:**\n• ${permList}`,
            inline: false
        });
    }

    embed.setFooter({ text: 'Lower order = higher rank | Use /guild-rank assign to change ranks' });

    await interaction.reply({ embeds: [embed] });
}

// View a member's rank
async function viewMemberRankCommand(interaction, userId) {
    const targetUser = interaction.options.getUser('member') || interaction.user;

    const userGuild = await getUserGuild(userId);

    if (!userGuild) {
        return interaction.reply({
            content: '❌ You\'re not in a guild!',
            ephemeral: true
        });
    }

    // Check if target user is in the same guild
    const targetGuild = await getUserGuild(targetUser.id);

    if (!targetGuild || targetGuild.guildId !== userGuild.guildId) {
        return interaction.reply({
            content: '❌ That user is not in your guild!',
            ephemeral: true
        });
    }

    const guild = await getGuildWithLevel(userGuild.guildId);
    const rank = await getMemberRank(userGuild.guildId, targetUser.id);

    if (!rank) {
        return interaction.reply({
            content: `❌ <@${targetUser.id}> doesn't have a rank in this guild.`,
            ephemeral: true
        });
    }

    const emoji = getRankEmoji(rank.rankOrder);
    const permList = formatPermissions(rank.permissions);

    const embed = new EmbedBuilder()
        .setColor('#9B59B6')
        .setTitle(`${guild.name} - Member Rank`)
        .setDescription(`<@${targetUser.id}>'s rank information`)
        .addFields(
            {
                name: '👤 Member',
                value: `<@${targetUser.id}>`,
                inline: true
            },
            {
                name: '🏅 Rank',
                value: `${emoji} **${rank.rankName}**`,
                inline: true
            },
            {
                name: '📊 Order',
                value: `${rank.rankOrder}`,
                inline: true
            },
            {
                name: '🔑 Permissions',
                value: `• ${permList}`,
                inline: false
            }
        )
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}
