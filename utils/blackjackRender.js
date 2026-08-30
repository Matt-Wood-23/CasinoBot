/**
 * Rendering helpers shared by every blackjack code path.
 *
 * Building the embed, normalising createButtons()' return value (it hands back
 * a single ActionRow for some states and an array for others) and editing the
 * message was repeated a dozen times across main.js and the button handler.
 */

const { createGameEmbed } = require('./embeds');
const { createButtons } = require('./buttons');

/**
 * Build the message payload for a game's current state.
 */
async function buildBlackjackView(game, userId, client, options = {}) {
    const [embed, buttons] = await Promise.all([
        createGameEmbed(game, userId, client, options),
        createButtons(game, userId, client, options)
    ]);

    let components = [];
    if (buttons) {
        components = Array.isArray(buttons) ? buttons : [buttons];
    }

    return { embeds: [embed], components };
}

/**
 * Render the game onto its message.
 *
 * @param {Object} target - a Message to edit, or an interaction to editReply on
 *   when the game has no message of its own (duels reply through the token).
 * @returns {Promise<boolean>} false if the edit failed; the caller decides
 *   whether that is fatal.
 */
async function renderBlackjack(target, game, userId, client, options = {}) {
    const view = await buildBlackjackView(game, userId, client, options);

    try {
        if (target && typeof target.edit === 'function') {
            await target.edit(view);
        } else {
            await target.editReply(view);
        }
        return true;
    } catch (error) {
        console.error('Error updating blackjack message:', error);
        return false;
    }
}

/** Pause, used to pace the dealing and dealer animations. */
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { buildBlackjackView, renderBlackjack, wait };
