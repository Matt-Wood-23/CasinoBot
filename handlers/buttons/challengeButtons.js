const { getUserMoney, setUserMoney } = require('../../utils/data');
const { EmbedBuilder } = require('discord.js');

async function handleClaimChallengeRewards(interaction, userId) {
    const { getUserChallenges, awardChallengeReward } = require('../utils/challenges');
    const { markChallengeClaimedDB } = require('../utils/data');

    try {
        const challenges = await getUserChallenges(userId);
        if (!challenges) {
            return interaction.reply({
                content: '❌ Unable to load your challenges.',
                ephemeral: true
            });
        }

        // Find all completed but not yet claimed challenges
        const completedChallenges = [...challenges.daily, ...challenges.weekly].filter(c => c.completed && !c.claimed);

        if (completedChallenges.length === 0) {
            return interaction.reply({
                content: '❌ You have no completed challenges to claim!',
                ephemeral: true
            });
        }

        // Award all rewards
        let totalReward = 0;
        const claimedChallenges = [];

        for (const challenge of completedChallenges) {
            const reward = await awardChallengeReward(userId, challenge);
            totalReward += reward;
            claimedChallenges.push(`${challenge.emoji} **${challenge.name}** - $${reward.toLocaleString()}`);

            // Mark challenge as claimed in the database
            await markChallengeClaimedDB(userId, challenge.id);
        }

        // Challenges remain in DB as "completed & claimed" until reset period expires

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('🎉 Challenge Rewards Claimed!')
            .setDescription(`You've earned a total of **$${totalReward.toLocaleString()}**!`)
            .addFields({
                name: 'Completed Challenges',
                value: claimedChallenges.join('\n'),
                inline: false
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('Error claiming challenge rewards:', error);
        await interaction.reply({
            content: '❌ An error occurred while claiming your rewards. Please try again.',
            ephemeral: true
        });
    }
}

module.exports = { handleClaimChallengeRewards };
