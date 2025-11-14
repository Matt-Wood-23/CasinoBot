const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getUserTransactions, getTransactionCount, TransactionTypes } = require('../utils/transactions');

const TRANSACTIONS_PER_PAGE = 10;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('transactions')
        .setDescription('View your transaction history')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Filter by transaction type')
                .setRequired(false)
                .addChoices(
                    { name: 'All Transactions', value: 'all' },
                    { name: 'Loans', value: 'loan' },
                    { name: 'Gifts', value: 'gift' },
                    { name: 'Purchases', value: 'purchase' },
                    { name: 'Admin Actions', value: 'admin' },
                    { name: 'Income (Work/Daily/Weekly)', value: 'income' },
                    { name: 'Games', value: 'game' }
                ))
        .addIntegerOption(option =>
            option.setName('page')
                .setDescription('Page number (default: 1)')
                .setRequired(false)
                .setMinValue(1)),

    async execute(interaction) {
        const userId = interaction.user.id;
        const typeFilter = interaction.options.getString('type') || 'all';
        const page = interaction.options.getInteger('page') || 1;

        try {
            // Map filter choices to transaction types
            let typeCondition = null;
            if (typeFilter !== 'all') {
                const typeMap = {
                    'loan': [TransactionTypes.LOAN_TAKEN, TransactionTypes.LOAN_REPAYMENT],
                    'gift': [TransactionTypes.GIFT_SENT, TransactionTypes.GIFT_RECEIVED],
                    'purchase': [TransactionTypes.SHOP_PURCHASE, TransactionTypes.PROPERTY_PURCHASE, TransactionTypes.VIP_PURCHASE],
                    'admin': [TransactionTypes.ADMIN_GIVE, TransactionTypes.ADMIN_TAKE],
                    'income': [TransactionTypes.WORK, TransactionTypes.DAILY, TransactionTypes.WEEKLY, TransactionTypes.WELFARE],
                    'game': [TransactionTypes.GAME_WIN, TransactionTypes.GAME_LOSS]
                };
                typeCondition = typeMap[typeFilter];
            }

            // Get transactions
            const offset = (page - 1) * TRANSACTIONS_PER_PAGE;
            const transactions = await getUserTransactions(userId, {
                limit: TRANSACTIONS_PER_PAGE,
                offset: offset
            });

            // Filter by type if needed (doing in JS since DB query is simpler)
            let filteredTransactions = transactions;
            if (typeCondition) {
                filteredTransactions = transactions.filter(t => typeCondition.includes(t.transaction_type));
            }

            // Get total count
            const totalCount = await getTransactionCount(userId);
            const totalPages = Math.ceil(totalCount / TRANSACTIONS_PER_PAGE);

            if (filteredTransactions.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor(0xFFAA00)
                    .setTitle('📜 Transaction History')
                    .setDescription('No transactions found.')
                    .setFooter({ text: 'Transactions are automatically tracked for loans, gifts, purchases, and more.' })
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
                return;
            }

            // Create embed
            const embed = new EmbedBuilder()
                .setColor(0x3498DB)
                .setTitle('📜 Transaction History')
                .setDescription(`Showing your ${typeFilter === 'all' ? 'recent' : typeFilter} transactions`)
                .setFooter({ text: `Page ${page}/${totalPages} • Total: ${totalCount} transactions` })
                .setTimestamp();

            // Add transaction fields
            for (const transaction of filteredTransactions) {
                const date = new Date(transaction.created_at);
                const formattedDate = date.toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                const amountDisplay = transaction.amount >= 0
                    ? `+$${transaction.amount.toLocaleString()}`
                    : `-$${Math.abs(transaction.amount).toLocaleString()}`;

                const amountEmoji = transaction.amount >= 0 ? '💰' : '💸';
                const typeEmoji = getTransactionTypeEmoji(transaction.transaction_type);

                embed.addFields({
                    name: `${typeEmoji} ${transaction.description}`,
                    value: `${amountEmoji} ${amountDisplay} • Balance: $${transaction.balance_after.toLocaleString()}\n` +
                           `📅 ${formattedDate}`,
                    inline: false
                });
            }

            // Add pagination buttons if needed
            if (totalPages > 1) {
                const row = new ActionRowBuilder();

                if (page > 1) {
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`transactions_prev_${page}`)
                            .setLabel('◀️ Previous')
                            .setStyle(ButtonStyle.Primary)
                    );
                }

                if (page < totalPages) {
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`transactions_next_${page}`)
                            .setLabel('Next ▶️')
                            .setStyle(ButtonStyle.Primary)
                    );
                }

                await interaction.reply({ embeds: [embed], components: [row] });
            } else {
                await interaction.reply({ embeds: [embed] });
            }

        } catch (error) {
            console.error('Error in transactions command:', error);

            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ Error')
                .setDescription('An error occurred while fetching your transaction history.')
                .setFooter({ text: 'Please try again later.' })
                .setTimestamp();

            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
};

/**
 * Gets appropriate emoji for transaction type
 * @param {string} type - Transaction type
 * @returns {string} Emoji
 */
function getTransactionTypeEmoji(type) {
    const emojiMap = {
        'loan_taken': '🏦',
        'loan_repayment': '💳',
        'gift_sent': '🎁',
        'gift_received': '🎉',
        'shop_purchase': '🛒',
        'property_purchase': '🏠',
        'vip_purchase': '⭐',
        'admin_give': '👑',
        'admin_take': '⚠️',
        'work': '💼',
        'daily': '📅',
        'weekly': '📆',
        'welfare': '🆘',
        'game_win': '🎰',
        'game_loss': '🎲'
    };

    return emojiMap[type] || '📝';
}
