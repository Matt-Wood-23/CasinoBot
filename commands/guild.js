const { EmbedBuilder, MessageFlags } = require('discord.js');
const {
    createGuild,
    joinGuild,
    leaveGuild,
    donateToGuild,
    getUserGuild,
    getGuildLeaderboards
} = require('../utils/guilds');
const { getUserMoney } = require('../utils/data');
const { getGuildWithLevel } = require('../database/queries');
const {
    calculateLevel,
    getLevelProgress,
    getActivePerks,
    getPerksAtLevel,
    createProgressBar,
    formatXP,
    getMaxMembers
} = require('../utils/guildLevels');
const { getWeeklyChallenges, getFormattedTimeUntilReset } = require('../utils/guildChallenges');
const {
    getGuildRanks,
    getMemberRank,
    formatPermissions,
    getRankEmoji
} = require('../utils/guildRanks');
const {
    getGuildVaultBalance,
    getVaultLogs,
    getContributionPoints
} = require('../database/queries');

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
                    { name: 'Leaderboard - View guild leaderboards', value: 'leaderboard' },
                    { name: 'Level - View guild level and XP', value: 'level' },
                    { name: 'Perks - View active guild perks', value: 'perks' },
                    { name: 'Challenges - View weekly challenges (Lvl 5+)', value: 'challenges' },
                    { name: 'Ranks - View guild ranks and permissions', value: 'ranks' },
                    { name: 'Vault - View/manage guild vault', value: 'vault' },
                    { name: 'Shop - Browse guild shop', value: 'shop' },
                    { name: 'Contributions - View contribution points', value: 'contributions' }
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
                case 'level':
                    await showGuildLevel(interaction, userId);
                    break;
                case 'perks':
                    await showGuildPerks(interaction, userId);
                    break;
                case 'challenges':
                    await showGuildChallenges(interaction, userId);
                    break;
                case 'ranks':
                    await showGuildRanks(interaction, userId);
                    break;
                case 'vault':
                    await showGuildVault(interaction, userId);
                    break;
                case 'shop':
                    await showGuildShop(interaction, userId);
                    break;
                case 'contributions':
                    await showContributions(interaction, userId);
                    break;
                default:
                    await interaction.reply({
                        content: '❌ Invalid action!',
                        flags: [MessageFlags.Ephemeral]
                    });
            }

        } catch (error) {
            console.error('Error in guild command:', error);

            const errorMessage = {
                content: '❌ An error occurred while processing your guild request. Please try again.',
                flags: [MessageFlags.Ephemeral]
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
            flags: [MessageFlags.Ephemeral]
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

    // Fetch members separately since createGuild doesn't return them
    const { getGuildMembers } = require('../database/queries');
    const members = await getGuildMembers(guild.name);

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
                value: `${members.length}/10`,
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
            flags: [MessageFlags.Ephemeral]
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

    // Fetch members separately since joinGuild doesn't return them
    const { getGuildMembers } = require('../database/queries');
    const members = await getGuildMembers(guild.name);

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ Joined Guild!')
        .setDescription(`Welcome to **${guild.name}**!`)
        .addFields(
            {
                name: '👥 Members',
                value: `${members.length}/10`,
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
    const userGuild = await getUserGuild(userId);

    if (!userGuild) {
        return interaction.reply({
            content: '❌ You\'re not in a guild! Use `/guild create` or `/guild join` to get started.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    // Get full guild info with members
    const { getGuildInfo } = require('../utils/guilds');
    const guild = await getGuildInfo(userGuild.guildName);

    if (!guild) {
        return interaction.reply({
            content: '❌ Failed to load guild information.',
            flags: [MessageFlags.Ephemeral]
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
            flags: [MessageFlags.Ephemeral]
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
    const userGuild = await getUserGuild(userId);

    if (!userGuild) {
        return interaction.reply({
            content: '❌ You\'re not in a guild!',
            flags: [MessageFlags.Ephemeral]
        });
    }

    // Get full guild info with members
    const { getGuildInfo } = require('../utils/guilds');
    const guild = await getGuildInfo(userGuild.guildName);

    if (!guild) {
        return interaction.reply({
            content: '❌ Failed to load guild information.',
            flags: [MessageFlags.Ephemeral]
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

async function showGuildLevel(interaction, userId) {
    const userGuild = await getUserGuild(userId);

    if (!userGuild) {
        return interaction.reply({
            content: '❌ You\'re not in a guild! Use `/guild create` or `/guild join` to get started.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    const guild = await getGuildWithLevel(userGuild.guildId);

    if (!guild) {
        return interaction.reply({
            content: '❌ Failed to load guild information.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    const currentLevel = guild.level || 1;
    const currentXP = guild.experience || 0;
    const progress = getLevelProgress(currentXP, currentLevel);
    const nextLevelPerks = getPerksAtLevel(currentLevel + 1);

    const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle(`⭐ ${guild.name} - Level ${currentLevel}`)
        .setDescription(`Season ${guild.seasonId || 1} Progress`)
        .addFields(
            {
                name: '📊 Experience',
                value: `${formatXP(currentXP)} XP`,
                inline: true
            },
            {
                name: '🏆 Legacy Points',
                value: `${guild.legacyPoints || 0} pts`,
                inline: true
            },
            {
                name: '📈 Season Peak',
                value: `Level ${guild.seasonMaxLevel || 1}`,
                inline: true
            }
        );

    if (!progress.isMaxLevel) {
        const progressBar = createProgressBar(progress.percentage);
        embed.addFields({
            name: '🎯 Progress to Next Level',
            value: `${progressBar}\n${formatXP(progress.current)} / ${formatXP(progress.required)} XP (${progress.percentage}%)`,
            inline: false
        });

        if (nextLevelPerks.length > 0) {
            const perksText = nextLevelPerks.map(p => `• ${p.name}`).join('\n');
            embed.addFields({
                name: `🎁 Unlocks at Level ${currentLevel + 1}`,
                value: perksText,
                inline: false
            });
        }
    } else {
        embed.addFields({
            name: '👑 MAX LEVEL REACHED!',
            value: 'Your guild has reached the maximum level for this season!',
            inline: false
        });
    }

    embed.setFooter({ text: 'Earn XP by playing games, completing challenges, and doing heists!' })
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function showGuildPerks(interaction, userId) {
    const userGuild = await getUserGuild(userId);

    if (!userGuild) {
        return interaction.reply({
            content: '❌ You\'re not in a guild! Use `/guild create` or `/guild join` to get started.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    const guild = await getGuildWithLevel(userGuild.guildId);

    if (!guild) {
        return interaction.reply({
            content: '❌ Failed to load guild information.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    const currentLevel = guild.level || 1;
    const activePerks = getActivePerks(currentLevel);

    const embed = new EmbedBuilder()
        .setColor('#9B59B6')
        .setTitle(`✨ ${guild.name} - Active Perks`)
        .setDescription(`Level ${currentLevel} | ${activePerks.length} Active Perks`)
        .setTimestamp();

    if (activePerks.length === 0) {
        embed.addFields({
            name: 'No Perks Yet',
            value: 'Level up your guild to unlock powerful perks!',
            inline: false
        });
    } else {
        // Group perks by category
        const perksByCategory = {
            economic: [],
            gameplay: [],
            social: [],
            cosmetic: [],
            special: []
        };

        activePerks.forEach(perk => {
            if (perksByCategory[perk.category]) {
                perksByCategory[perk.category].push(perk);
            }
        });

        // Display each category
        const categoryIcons = {
            economic: '💰',
            gameplay: '🎮',
            social: '👥',
            cosmetic: '🎨',
            special: '⭐'
        };

        const categoryNames = {
            economic: 'Economic Perks',
            gameplay: 'Gameplay Perks',
            social: 'Social Perks',
            cosmetic: 'Cosmetic Perks',
            special: 'Special Features'
        };

        for (const [category, perks] of Object.entries(perksByCategory)) {
            if (perks.length > 0) {
                const perksText = perks.map(p =>
                    `**${p.name}** (Lvl ${p.level})\n${p.description}`
                ).join('\n\n');

                embed.addFields({
                    name: `${categoryIcons[category]} ${categoryNames[category]}`,
                    value: perksText,
                    inline: false
                });
            }
        }
    }

    embed.setFooter({ text: 'Use /guild level to see your progress!' });

    await interaction.reply({ embeds: [embed] });
}

async function showGuildChallenges(interaction, userId) {
    const userGuild = await getUserGuild(userId);

    if (!userGuild) {
        return interaction.reply({
            content: '❌ You\'re not in a guild! Use `/guild create` or `/guild join` to get started.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    const guild = await getGuildWithLevel(userGuild.guildId);

    if (!guild) {
        return interaction.reply({
            content: '❌ Failed to load guild information.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    const currentLevel = guild.level || 1;

    // Check if challenges are unlocked (level 5+)
    if (currentLevel < 5) {
        return interaction.reply({
            content: `❌ Guild challenges are unlocked at **Level 5**!\n\nYour guild is currently Level ${currentLevel}. Keep earning XP to unlock this feature!`,
            flags: [MessageFlags.Ephemeral]
        });
    }

    const challenges = await getWeeklyChallenges(userGuild.guildId);
    const timeUntilReset = getFormattedTimeUntilReset();

    const embed = new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle(`📋 ${guild.name} - Weekly Challenges`)
        .setDescription(`Complete challenges together to earn guild XP!\n⏰ Resets in: **${timeUntilReset}**`)
        .setTimestamp();

    if (challenges.length === 0) {
        embed.addFields({
            name: 'No Challenges Available',
            value: 'Challenges will be generated at the start of each week (Monday 00:00 UTC)',
            inline: false
        });
    } else {
        for (const challenge of challenges) {
            const progressBar = createProgressBar(challenge.progressPercentage, 15);
            const status = challenge.completed ? '✅ Completed!' : '🔄 In Progress';
            const progress = `${challenge.progress.toLocaleString()} / ${challenge.target.toLocaleString()}`;

            embed.addFields({
                name: `${challenge.icon} ${challenge.name} ${challenge.completed ? '✅' : ''}`,
                value: `${challenge.description}\n${progressBar} ${progress}\n${status} | Reward: **${challenge.xpReward} XP**`,
                inline: false
            });
        }

        const completedCount = challenges.filter(c => c.completed).length;
        embed.setFooter({ text: `${completedCount}/${challenges.length} challenges completed` });
    }

    await interaction.reply({ embeds: [embed] });
}

// Show guild ranks
async function showGuildRanks(interaction, userId) {
    const userGuild = await getUserGuild(userId);

    if (!userGuild) {
        return interaction.reply({
            content: '❌ You\'re not in a guild! Use `/guild create` or `/guild join` to get started.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    const guild = await getGuildWithLevel(userGuild.guildId);
    const ranks = await getGuildRanks(userGuild.guildId);
    const memberRank = await getMemberRank(userGuild.guildId, userId);

    if (ranks.length === 0) {
        return interaction.reply({
            content: '❌ No ranks found for this guild.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    const embed = new EmbedBuilder()
        .setColor('#9B59B6')
        .setTitle(`${guild.name} - Guild Ranks`)
        .setDescription(`Your current rank: **${memberRank ? memberRank.rankName : 'No Rank'}**`)
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

    embed.setFooter({ text: 'Lower order = higher rank | Use separate commands to manage ranks' });

    await interaction.reply({ embeds: [embed] });
}

// Show guild vault
async function showGuildVault(interaction, userId) {
    const userGuild = await getUserGuild(userId);

    if (!userGuild) {
        return interaction.reply({
            content: '❌ You\'re not in a guild! Use `/guild create` or `/guild join` to get started.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    const guild = await getGuildWithLevel(userGuild.guildId);
    const vaultBalance = await getGuildVaultBalance(userGuild.guildId);
    const recentLogs = await getVaultLogs(userGuild.guildId, 5);

    const embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle(`🏦 ${guild.name} - Guild Vault`)
        .setDescription(`The vault is a secure shared storage for guild funds.`)
        .addFields({
            name: '💰 Current Balance',
            value: `$${vaultBalance.toLocaleString()}`,
            inline: false
        })
        .setTimestamp();

    if (recentLogs.length > 0) {
        const logText = recentLogs.map(log => {
            const action = log.action === 'deposit' ? '📥' : '📤';
            const amount = log.amount.toLocaleString();
            const date = new Date(log.timestamp).toLocaleDateString();
            return `${action} <@${log.userId}> ${log.action} $${amount} (${date})`;
        }).join('\n');

        embed.addFields({
            name: '📜 Recent Transactions',
            value: logText || 'No recent transactions',
            inline: false
        });
    }

    embed.setFooter({ text: 'Use /guild-vault to deposit or withdraw funds' });

    await interaction.reply({ embeds: [embed] });
}

// Show guild shop
async function showGuildShop(interaction, userId) {
    const userGuild = await getUserGuild(userId);

    if (!userGuild) {
        return interaction.reply({
            content: '❌ You\'re not in a guild! Use `/guild create` or `/guild join` to get started.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    return interaction.reply({
        content: '🏪 **Guild Shop Coming Soon!**\n\nThe guild shop will allow you to spend contribution points on exclusive items, boosts, and cosmetics!\n\nEarn contribution points by:\n• Playing games\n• Wagering money\n• Donating to the treasury\n• Completing challenges\n• Participating in heists',
        flags: [MessageFlags.Ephemeral]
    });
}

// Show contributions
async function showContributions(interaction, userId) {
    const userGuild = await getUserGuild(userId);

    if (!userGuild) {
        return interaction.reply({
            content: '❌ You\'re not in a guild! Use `/guild create` or `/guild join` to get started.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    const guild = await getGuildWithLevel(userGuild.guildId);
    const points = await getContributionPoints(userGuild.guildId, userId);

    const embed = new EmbedBuilder()
        .setColor('#F39C12')
        .setTitle(`${guild.name} - Contribution Points`)
        .setDescription('Contribution points are earned through guild activities and can be spent in the guild shop!')
        .addFields({
            name: '🎖️ Your Contribution Points',
            value: `**${points.toLocaleString()}** points`,
            inline: false
        })
        .addFields({
            name: '📊 How to Earn Points',
            value: '• **1 point** per game played\n• **1 point** per $500 wagered\n• **5 points** per $10,000 donated\n• **10 points** for failed heists\n• **25 points** for successful heists\n• **50 points** per weekly challenge',
            inline: false
        })
        .setTimestamp()
        .setFooter({ text: 'Use /guild shop to spend your points!' });

    await interaction.reply({ embeds: [embed] });
}
