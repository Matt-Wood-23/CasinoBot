const { EmbedBuilder } = require('discord.js');

// Utility functions for creating specific embed types
function createErrorEmbed(title, description) {
    return new EmbedBuilder()
        .setTitle(`❌ ${title}`)
        .setDescription(description)
        .setColor('#FF0000')
        .setTimestamp();
}

function createSuccessEmbed(title, description) {
    return new EmbedBuilder()
        .setTitle(`✅ ${title}`)
        .setDescription(description)
        .setColor('#00FF00')
        .setTimestamp();
}

function createInfoEmbed(title, description) {
    return new EmbedBuilder()
        .setTitle(`ℹ️ ${title}`)
        .setDescription(description)
        .setColor('#0099FF')
        .setTimestamp();
}

module.exports = {
    createErrorEmbed,
    createSuccessEmbed,
    createInfoEmbed
};
