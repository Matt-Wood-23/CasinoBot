const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getUserMoney } = require('../utils/data');
const { recordGameToEvents, getEventNotifications } = require('../utils/eventIntegration');
const { checkGamblingBan, checkCooldown, setCooldown } = require('../utils/guardChecks');

module.exports = {
    data: {
        name: 'roulette',
        description: 'Play roulette with various betting options',
        options: []
    },

    async execute(interaction) {
        try {
            // Cooldown: 3 seconds between spins
            if (checkCooldown(interaction, 'roulette', 3000)) return;

            // Check if user is gambling banned
            if (await checkGamblingBan(interaction)) return;

            // Ensure user has money
            const userMoney = await getUserMoney(interaction.user.id);

            if (userMoney < 10) {
                return interaction.reply({
                    content: '❌ You need at least 10 to play roulette!',
                    ephemeral: true
                });
            }

            // All checks passed — set cooldown
            setCooldown(interaction, 'roulette', 3000);

            // Create interactive betting interface
            const embed = new EmbedBuilder()
                .setTitle('🎰 American Roulette - Place Your Bets')
                .setDescription('Select your chip value, then click betting areas below.\n\n**Current Chip:** 10\n**Total Bet:** 0\n**Your Balance:** ' + userMoney.toLocaleString())
                .setColor('#FFD700')
                .addFields(
                    {
                        name: '🎯 Betting Options',
                        value: 'Use the buttons below to place bets on different areas of the roulette table.',
                        inline: false
                    }
                );

            // Row 1: Chip selection
            const chipRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('roulette_chip_10')
                        .setLabel('$10')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('🪙'),
                    new ButtonBuilder()
                        .setCustomId('roulette_chip_25')
                        .setLabel('$25')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('roulette_chip_50')
                        .setLabel('$50')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('roulette_chip_100')
                        .setLabel('$100')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('roulette_chip_500')
                        .setLabel('$500')
                        .setStyle(ButtonStyle.Primary)
                );

            // Row 2: Color bets
            const colorRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('roulette_bet_red')
                        .setLabel('Red (1:1)')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('roulette_bet_black')
                        .setLabel('Black (1:1)')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('roulette_bet_green')
                        .setLabel('Green (17:1)')
                        .setStyle(ButtonStyle.Success)
                );

            // Row 3: Even money bets
            const evenMoneyRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('roulette_bet_odd')
                        .setLabel('Odd (1:1)')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('roulette_bet_even')
                        .setLabel('Even (1:1)')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('roulette_bet_low')
                        .setLabel('1-18 (1:1)')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('roulette_bet_high')
                        .setLabel('19-36 (1:1)')
                        .setStyle(ButtonStyle.Primary)
                );

            // Row 4: Dozens and columns
            const dozenRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('roulette_bet_1st12')
                        .setLabel('1st 12 (2:1)')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('roulette_bet_2nd12')
                        .setLabel('2nd 12 (2:1)')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('roulette_bet_3rd12')
                        .setLabel('3rd 12 (2:1)')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('roulette_bet_number')
                        .setLabel('Pick Number (35:1)')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('🔢')
                );

            // Row 5: Action buttons
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('roulette_clear_bets')
                        .setLabel('Clear Bets')
                        .setStyle(ButtonStyle.Danger)
                        .setEmoji('🗑️'),
                    new ButtonBuilder()
                        .setCustomId('roulette_spin')
                        .setLabel('SPIN!')
                        .setStyle(ButtonStyle.Success)
                        .setEmoji('🎰')
                        .setDisabled(true) // Disabled until bets are placed
                );

            await interaction.reply({
                embeds: [embed],
                components: [chipRow, colorRow, evenMoneyRow, dozenRow, actionRow]
            });

        } catch (error) {
            console.error('Error in roulette command:', error);

            const errorMessage = {
                content: '❌ An error occurred while starting roulette. Please try again.',
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