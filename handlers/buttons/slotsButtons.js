const { getUserMoney, setUserMoney, recordGameResult } = require('../../utils/data');
const { createGameEmbed } = require('../../utils/embeds');
const { createButtons } = require('../../utils/buttons');
const { applyHolidayWinningsBonus } = require('../../utils/holidayEvents');
const { awardGameXP, awardWagerXP } = require('../../utils/guildXP');
const { recordGameToEvents } = require('../../utils/eventIntegration');
const SlotsGame = require('../../gameLogic/slotsGame');

async function handleSlotsSpinAgain(interaction, userId, client) {
    // Check if the message was created by this user (interaction.user must match original command user)
    if (interaction.message.interaction && interaction.message.interaction.user.id !== userId) {
        return interaction.reply({
            content: '❌ This is not your game!',
            ephemeral: true
        });
    }

    let bet = 10; // Default fallback bet

    try {
        const embed = interaction.message.embeds[0];
        const description = embed.description;

        const betMatch = description.match(/Bet: (\d+)/);
        if (betMatch && betMatch[1]) {
            bet = Number(betMatch[1]);
        } else {
            console.error('Could not parse bet from embed description:', description);
        }
    } catch (error) {
        console.error('Error parsing slots bet:', error);
    }

    const userMoney = await getUserMoney(userId);

    if (userMoney < bet) {
        return interaction.reply({
            content: `❌ You don't have enough money! You have ${userMoney.toLocaleString()}.`,
            ephemeral: true
        });
    }

    await setUserMoney(userId, userMoney - bet);
    const slotsGame = new SlotsGame(userId, bet);
    const adjustedWinnings = applyHolidayWinningsBonus(slotsGame.winnings);
    await setUserMoney(userId, userMoney - bet + adjustedWinnings);
    await recordGameResult(userId, 'slots', bet, adjustedWinnings, adjustedWinnings > 0 ? 'win' : 'lose');

    // Award guild XP (async, don't wait)
    awardWagerXP(userId, bet, 'Slots').catch(err =>
        console.error('Error awarding wager XP:', err)
    );
    const won = adjustedWinnings > 0;
    awardGameXP(userId, 'Slots', won).catch(err =>
        console.error('Error awarding game XP:', err)
    );

    // Record to active guild events (async, don't wait)
    recordGameToEvents(userId, 'Slots', bet, adjustedWinnings > 0 ? adjustedWinnings : 0).catch(err =>
        console.error('Error recording game to events:', err)
    );

    const embed = await createGameEmbed(slotsGame, userId, client);
    const buttons = await createButtons(slotsGame, userId, client);

    await interaction.update({
        embeds: [embed],
        components: buttons ? [buttons] : []
    });
}

module.exports = { handleSlotsSpinAgain };
