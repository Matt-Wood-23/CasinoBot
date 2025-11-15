// Main embeds export file
// This file re-exports all embed functions from categorized files
// to maintain backwards compatibility with existing imports

module.exports = {
    ...require('./embeds/gameEmbeds'),
    ...require('./embeds/statsEmbeds'),
    ...require('./embeds/utilityEmbeds')
};
