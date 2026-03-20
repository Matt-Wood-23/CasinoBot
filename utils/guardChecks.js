/**
 * Shared guard checks for gambling commands.
 *
 * Usage:
 *   const { checkGamblingBan, checkCooldown, setCooldown } = require('../utils/guardChecks');
 *
 *   // In execute():
 *   if (await checkGamblingBan(interaction)) return;
 *   if (checkCooldown(interaction, 'slots', 3000)) return;  // 3-second cooldown
 *   setCooldown(interaction, 'slots', 3000);
 */

const { isGamblingBanned, getGamblingBanTime } = require('../database/queries');

// Per-user per-command cooldown store: Map<`${commandName}_${userId}`, expiresAt>
const cooldowns = new Map();

/**
 * Checks whether the user is banned from gambling.
 * Sends an ephemeral reply and returns true if banned.
 * Returns false if the user may proceed.
 */
async function checkGamblingBan(interaction) {
    const isBanned = await isGamblingBanned(interaction.user.id);
    if (!isBanned) return false;

    const banUntil = await getGamblingBanTime(interaction.user.id);
    const timeLeft = Math.max(0, banUntil - Date.now());
    const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
    const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

    await interaction.reply({
        content: `🚫 You're banned from gambling after a failed heist!\nBan expires in: ${hoursLeft}h ${minutesLeft}m`,
        ephemeral: true
    });
    return true;
}

/**
 * Checks whether the user is on cooldown for a given command.
 * Sends an ephemeral reply and returns true if on cooldown.
 * Returns false if the user may proceed.
 *
 * @param {Interaction} interaction
 * @param {string} commandName  - Unique key for the cooldown (e.g. 'slots')
 * @param {number} cooldownMs   - Cooldown duration in milliseconds
 */
function checkCooldown(interaction, commandName, cooldownMs) {
    const key = `${commandName}_${interaction.user.id}`;
    const expiresAt = cooldowns.get(key);
    if (!expiresAt || Date.now() >= expiresAt) return false;

    const secondsLeft = ((expiresAt - Date.now()) / 1000).toFixed(1);
    interaction.reply({
        content: `⏳ You're on cooldown! Please wait **${secondsLeft}s** before using this command again.`,
        ephemeral: true
    }).catch(() => {});
    return true;
}

/**
 * Records a cooldown for the user on the given command.
 * Should be called just before the game starts (after all validation passes).
 *
 * @param {Interaction} interaction
 * @param {string} commandName
 * @param {number} cooldownMs
 */
function setCooldown(interaction, commandName, cooldownMs) {
    const key = `${commandName}_${interaction.user.id}`;
    cooldowns.set(key, Date.now() + cooldownMs);

    // Auto-clean after expiry to prevent unbounded Map growth
    setTimeout(() => cooldowns.delete(key), cooldownMs + 1000);
}

module.exports = { checkGamblingBan, checkCooldown, setCooldown };
