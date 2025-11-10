const { EmbedBuilder } = require('discord.js');
const { getUserGuild } = require('../utils/guilds');
const { getUserMoney, setUserMoney } = require('../utils/data');
const { hasPermission, getMemberRank } = require('../utils/guildRanks');
const {
    getGuildVaultBalance,
    depositToVault,
    withdrawFromVault,
    getVaultSettings,
    getDailyWithdrawalAmount,
    getGuildWithLevel
} = require('../database/queries');

module.exports = {
    data: {
        name: 'guild-vault',
        description: 'Manage guild vault (shared storage)',
        options: [
            {
                name: 'action',
                description: 'Vault action',
                type: 3, // STRING
                required: true,
                choices: [
                    { name: 'Deposit - Add money to vault', value: 'deposit' },
                    { name: 'Withdraw - Take money from vault', value: 'withdraw' },
                    { name: 'Balance - View vault balance', value: 'balance' }
                ]
            },
            {
                name: 'amount',
                description: 'Amount to deposit or withdraw',
                type: 4, // INTEGER
                required: false,
                min_value: 100
            },
            {
                name: 'reason',
                description: 'Reason for withdrawal (optional)',
                type: 3, // STRING
                required: false,
                max_length: 200
            }
        ]
    },

    async execute(interaction) {
        try {
            const userId = interaction.user.id;
            const action = interaction.options.getString('action');

            switch (action) {
                case 'deposit':
                    await depositToVaultCommand(interaction, userId);
                    break;
                case 'withdraw':
                    await withdrawFromVaultCommand(interaction, userId);
                    break;
                case 'balance':
                    await showVaultBalance(interaction, userId);
                    break;
                default:
                    await interaction.reply({
                        content: '❌ Invalid action!',
                        ephemeral: true
                    });
            }
        } catch (error) {
            console.error('Error in guild-vault command:', error);
            await interaction.reply({
                content: '❌ An error occurred while processing your request.',
                ephemeral: true
            });
        }
    }
};

// Deposit to vault
async function depositToVaultCommand(interaction, userId) {
    const amount = interaction.options.getInteger('amount');

    if (!amount) {
        return interaction.reply({
            content: '❌ Please specify an amount to deposit! Example: `/guild-vault deposit amount:10000`',
            ephemeral: true
        });
    }

    const userGuild = await getUserGuild(userId);

    if (!userGuild) {
        return interaction.reply({
            content: '❌ You\'re not in a guild! Use `/guild create` or `/guild join` to get started.',
            ephemeral: true
        });
    }

    const userMoney = await getUserMoney(userId);

    if (userMoney < amount) {
        return interaction.reply({
            content: `❌ You don't have enough money! You have $${userMoney.toLocaleString()}, but need $${amount.toLocaleString()}.`,
            ephemeral: true
        });
    }

    // Deduct money from user
    await setUserMoney(userId, userMoney - amount);

    // Deposit to vault
    const result = await depositToVault(userGuild.guildId, userId, amount, 'Member deposit');

    if (!result.success) {
        // Refund if deposit failed
        await setUserMoney(userId, userMoney);
        return interaction.reply({
            content: `❌ Failed to deposit to vault: ${result.error}`,
            ephemeral: true
        });
    }

    const guild = await getGuildWithLevel(userGuild.guildId);

    const embed = new EmbedBuilder()
        .setColor('#2ECC71')
        .setTitle('🏦 Vault Deposit Successful')
        .setDescription(`You deposited **$${amount.toLocaleString()}** to ${guild.name}'s vault!`)
        .addFields(
            {
                name: '💰 Previous Balance',
                value: `$${result.balanceBefore.toLocaleString()}`,
                inline: true
            },
            {
                name: '💰 New Balance',
                value: `$${result.balanceAfter.toLocaleString()}`,
                inline: true
            },
            {
                name: '📊 Your Remaining Money',
                value: `$${(userMoney - amount).toLocaleString()}`,
                inline: false
            }
        )
        .setTimestamp()
        .setFooter({ text: 'Thank you for your contribution!' });

    await interaction.reply({ embeds: [embed] });
}

// Withdraw from vault
async function withdrawFromVaultCommand(interaction, userId) {
    const amount = interaction.options.getInteger('amount');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (!amount) {
        return interaction.reply({
            content: '❌ Please specify an amount to withdraw! Example: `/guild-vault withdraw amount:5000`',
            ephemeral: true
        });
    }

    const userGuild = await getUserGuild(userId);

    if (!userGuild) {
        return interaction.reply({
            content: '❌ You\'re not in a guild! Use `/guild create` or `/guild join` to get started.',
            ephemeral: true
        });
    }

    // Check if user has permission to withdraw
    const canWithdraw = await hasPermission(userGuild.guildId, userId, 'manage_vault');

    if (!canWithdraw) {
        return interaction.reply({
            content: '❌ You don\'t have permission to withdraw from the vault! Only Officers and Leaders can withdraw.',
            ephemeral: true
        });
    }

    const vaultBalance = await getGuildVaultBalance(userGuild.guildId);

    if (vaultBalance < amount) {
        return interaction.reply({
            content: `❌ Insufficient vault balance! The vault has $${vaultBalance.toLocaleString()}, but you're trying to withdraw $${amount.toLocaleString()}.`,
            ephemeral: true
        });
    }

    // Check daily withdrawal limits
    const settings = await getVaultSettings(userGuild.guildId);
    if (settings.dailyWithdrawLimit) {
        const todayWithdrawn = await getDailyWithdrawalAmount(userGuild.guildId, userId);
        const remainingLimit = settings.dailyWithdrawLimit - todayWithdrawn;

        if (amount > remainingLimit) {
            return interaction.reply({
                content: `❌ Daily withdrawal limit exceeded! You can withdraw $${remainingLimit.toLocaleString()} more today (limit: $${settings.dailyWithdrawLimit.toLocaleString()}).`,
                ephemeral: true
            });
        }
    }

    // Withdraw from vault
    const result = await withdrawFromVault(userGuild.guildId, userId, amount, reason);

    if (!result.success) {
        return interaction.reply({
            content: `❌ Failed to withdraw from vault: ${result.error}`,
            ephemeral: true
        });
    }

    // Add money to user
    const userMoney = await getUserMoney(userId);
    await setUserMoney(userId, userMoney + amount);

    const guild = await getGuildWithLevel(userGuild.guildId);
    const rank = await getMemberRank(userGuild.guildId, userId);

    const embed = new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('🏦 Vault Withdrawal Successful')
        .setDescription(`**${rank?.rankName || 'Member'}** withdrew **$${amount.toLocaleString()}** from ${guild.name}'s vault!`)
        .addFields(
            {
                name: '💰 Previous Balance',
                value: `$${result.balanceBefore.toLocaleString()}`,
                inline: true
            },
            {
                name: '💰 New Balance',
                value: `$${result.balanceAfter.toLocaleString()}`,
                inline: true
            },
            {
                name: '📋 Reason',
                value: reason,
                inline: false
            },
            {
                name: '📊 Your New Balance',
                value: `$${(userMoney + amount).toLocaleString()}`,
                inline: false
            }
        )
        .setTimestamp()
        .setFooter({ text: 'Withdrawal logged for transparency' });

    await interaction.reply({ embeds: [embed] });
}

// Show vault balance
async function showVaultBalance(interaction, userId) {
    const userGuild = await getUserGuild(userId);

    if (!userGuild) {
        return interaction.reply({
            content: '❌ You\'re not in a guild! Use `/guild create` or `/guild join` to get started.',
            ephemeral: true
        });
    }

    const guild = await getGuildWithLevel(userGuild.guildId);
    const vaultBalance = await getGuildVaultBalance(userGuild.guildId);
    const settings = await getVaultSettings(userGuild.guildId);
    const canWithdraw = await hasPermission(userGuild.guildId, userId, 'manage_vault');

    const embed = new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle(`🏦 ${guild.name} - Vault Balance`)
        .setDescription('The vault is a secure shared storage for guild funds.')
        .addFields({
            name: '💰 Current Balance',
            value: `$${vaultBalance.toLocaleString()}`,
            inline: false
        })
        .setTimestamp();

    if (canWithdraw) {
        const todayWithdrawn = await getDailyWithdrawalAmount(userGuild.guildId, userId);
        const limitText = settings.dailyWithdrawLimit
            ? `$${settings.dailyWithdrawLimit.toLocaleString()} per day`
            : 'No limit';
        const withdrawnText = settings.dailyWithdrawLimit
            ? `$${todayWithdrawn.toLocaleString()} / $${settings.dailyWithdrawLimit.toLocaleString()}`
            : `$${todayWithdrawn.toLocaleString()}`;

        embed.addFields(
            {
                name: '📊 Withdrawal Info',
                value: `**Your Status:** Can withdraw\n**Daily Limit:** ${limitText}\n**Withdrawn Today:** ${withdrawnText}`,
                inline: false
            }
        );
    } else {
        embed.addFields({
            name: '🔒 Access',
            value: 'You cannot withdraw from the vault. Only Officers and Leaders can withdraw.',
            inline: false
        });
    }

    embed.setFooter({ text: 'Use /guild-vault deposit or /guild-vault withdraw' });

    await interaction.reply({ embeds: [embed] });
}
