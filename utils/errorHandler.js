/**
 * Centralized error handling utilities for the casino bot
 * Provides consistent error logging and user-friendly error messages
 */

/**
 * Error types for categorizing different kinds of errors
 */
const ErrorTypes = {
    INSUFFICIENT_FUNDS: 'insufficient_funds',
    INVALID_BET: 'invalid_bet',
    GAME_ERROR: 'game_error',
    DATABASE_ERROR: 'database_error',
    PERMISSION_ERROR: 'permission_error',
    COOLDOWN_ERROR: 'cooldown_error',
    VALIDATION_ERROR: 'validation_error',
    UNKNOWN_ERROR: 'unknown_error'
};

/**
 * Logs an error with context information
 * @param {Error} error - The error object
 * @param {Object} context - Additional context about the error
 * @param {string} context.command - The command that caused the error
 * @param {string} context.userId - The user ID who triggered the error
 * @param {string} context.guildId - The guild ID where the error occurred
 */
function logError(error, context = {}) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ERROR:`, {
        message: error.message,
        stack: error.stack,
        ...context
    });
}

/**
 * Creates a user-friendly error embed
 * @param {string} title - Error title
 * @param {string} description - Error description
 * @param {Object} options - Additional options
 * @param {string} options.solution - Suggested solution
 * @param {Array<{name: string, value: string}>} options.fields - Additional fields
 * @returns {Object} Discord embed object
 */
function createErrorEmbed(title, description, options = {}) {
    const embed = {
        color: 0xFF0000, // Red
        title: `❌ ${title}`,
        description: description,
        timestamp: new Date().toISOString(),
        footer: { text: 'If this error persists, contact an administrator' }
    };

    if (options.solution) {
        embed.fields = [
            { name: '💡 Suggestion', value: options.solution, inline: false }
        ];
    }

    if (options.fields) {
        embed.fields = [...(embed.fields || []), ...options.fields];
    }

    return embed;
}

/**
 * Handles insufficient funds errors
 * @param {number} userBalance - User's current balance
 * @param {number} required - Amount required
 * @returns {Object} Error embed
 */
function handleInsufficientFunds(userBalance, required) {
    const shortage = required - userBalance;
    return createErrorEmbed(
        'Insufficient Funds',
        `You don't have enough money for this action.`,
        {
            fields: [
                { name: 'Your Balance', value: `$${userBalance.toLocaleString()}`, inline: true },
                { name: 'Required', value: `$${required.toLocaleString()}`, inline: true },
                { name: 'Short By', value: `$${shortage.toLocaleString()}`, inline: true }
            ],
            solution: 'Try using `/work`, `/daily`, or play with a smaller bet amount.'
        }
    );
}

/**
 * Handles invalid bet errors
 * @param {number} bet - The invalid bet amount
 * @param {number} min - Minimum bet
 * @param {number} max - Maximum bet
 * @returns {Object} Error embed
 */
function handleInvalidBet(bet, min, max) {
    return createErrorEmbed(
        'Invalid Bet Amount',
        `Your bet of $${bet.toLocaleString()} is outside the allowed range.`,
        {
            fields: [
                { name: 'Minimum Bet', value: `$${min.toLocaleString()}`, inline: true },
                { name: 'Maximum Bet', value: `$${max.toLocaleString()}`, inline: true }
            ],
            solution: `Please bet between $${min.toLocaleString()} and $${max.toLocaleString()}.`
        }
    );
}

/**
 * Handles cooldown errors
 * @param {string} commandName - Name of the command on cooldown
 * @param {number} remainingSeconds - Seconds remaining on cooldown
 * @returns {Object} Error embed
 */
function handleCooldown(commandName, remainingSeconds) {
    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = Math.floor(remainingSeconds % 60);

    let timeString = '';
    if (hours > 0) timeString += `${hours}h `;
    if (minutes > 0) timeString += `${minutes}m `;
    if (seconds > 0) timeString += `${seconds}s`;

    return createErrorEmbed(
        'Command on Cooldown',
        `You need to wait before using \`/${commandName}\` again.`,
        {
            fields: [
                { name: '⏱️ Time Remaining', value: timeString.trim(), inline: false }
            ]
        }
    );
}

/**
 * Handles database errors with bet refund
 * @param {string} userId - User ID to refund
 * @param {number} betAmount - Amount to refund
 * @returns {Object} Error embed
 */
function handleDatabaseError(userId, betAmount) {
    return createErrorEmbed(
        'Database Error',
        'An error occurred while processing your request.',
        {
            fields: betAmount ? [
                { name: '💰 Refund', value: `Your bet of $${betAmount.toLocaleString()} has been refunded.`, inline: false }
            ] : [],
            solution: 'Please try again in a moment.'
        }
    );
}

/**
 * Handles generic game errors with bet refund
 * @param {string} gameName - Name of the game
 * @param {number} betAmount - Amount to refund (if any)
 * @returns {Object} Error embed
 */
function handleGameError(gameName, betAmount = null) {
    return createErrorEmbed(
        `${gameName} Error`,
        `An error occurred while playing ${gameName}.`,
        {
            fields: betAmount ? [
                { name: '💰 Refund', value: `Your bet of $${betAmount.toLocaleString()} has been refunded.`, inline: false }
            ] : [],
            solution: 'Please try starting a new game.'
        }
    );
}

/**
 * Handles permission errors
 * @param {string} requiredPermission - The permission that was required
 * @returns {Object} Error embed
 */
function handlePermissionError(requiredPermission) {
    return createErrorEmbed(
        'Permission Denied',
        `You don't have permission to use this command.`,
        {
            fields: [
                { name: 'Required Permission', value: requiredPermission, inline: false }
            ]
        }
    );
}

/**
 * Handles unknown/generic errors
 * @param {Error} error - The error object
 * @returns {Object} Error embed
 */
function handleUnknownError(error) {
    return createErrorEmbed(
        'An Error Occurred',
        'Something went wrong while processing your request.',
        {
            solution: 'Please try again. If the problem continues, contact an administrator.'
        }
    );
}

/**
 * Main error handler - routes errors to appropriate handlers
 * @param {Error|Object} error - Error object or custom error
 * @param {Object} context - Context about where the error occurred
 * @param {Object} interaction - Discord interaction object
 * @returns {Promise<void>}
 */
async function handleError(error, context = {}, interaction = null) {
    // Log the error
    logError(error, context);

    // Determine error type and create appropriate response
    let errorEmbed;

    if (error.type) {
        // Custom error with type
        switch (error.type) {
            case ErrorTypes.INSUFFICIENT_FUNDS:
                errorEmbed = handleInsufficientFunds(error.userBalance, error.required);
                break;
            case ErrorTypes.INVALID_BET:
                errorEmbed = handleInvalidBet(error.bet, error.min, error.max);
                break;
            case ErrorTypes.COOLDOWN_ERROR:
                errorEmbed = handleCooldown(error.commandName, error.remainingSeconds);
                break;
            case ErrorTypes.DATABASE_ERROR:
                errorEmbed = handleDatabaseError(error.userId, error.betAmount);
                break;
            case ErrorTypes.GAME_ERROR:
                errorEmbed = handleGameError(error.gameName, error.betAmount);
                break;
            case ErrorTypes.PERMISSION_ERROR:
                errorEmbed = handlePermissionError(error.requiredPermission);
                break;
            default:
                errorEmbed = handleUnknownError(error);
        }
    } else {
        // Standard JavaScript error
        errorEmbed = handleUnknownError(error);
    }

    // Send error to user if interaction is provided
    if (interaction) {
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ embeds: [errorEmbed], components: [] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        } catch (replyError) {
            console.error('Failed to send error message to user:', replyError);
        }
    }

    return errorEmbed;
}

/**
 * Wraps a command execution with error handling
 * @param {Function} commandFunction - The command function to wrap
 * @param {Object} context - Context about the command
 * @returns {Function} Wrapped function with error handling
 */
function wrapCommandWithErrorHandler(commandFunction, context = {}) {
    return async (interaction) => {
        try {
            await commandFunction(interaction);
        } catch (error) {
            await handleError(error, {
                command: interaction.commandName,
                userId: interaction.user.id,
                guildId: interaction.guildId,
                ...context
            }, interaction);
        }
    };
}

module.exports = {
    ErrorTypes,
    logError,
    createErrorEmbed,
    handleInsufficientFunds,
    handleInvalidBet,
    handleCooldown,
    handleDatabaseError,
    handleGameError,
    handlePermissionError,
    handleUnknownError,
    handleError,
    wrapCommandWithErrorHandler
};
