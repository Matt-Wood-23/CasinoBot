const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getUserChallenges, awardChallengeReward } = require('../utils/challenges');

module.exports = {
    data: {
        name: 'challenges',
        description: 'View your active daily and weekly challenges'
    },

    async execute(interaction) {
        try {
            const userId = interaction.user.id;
            const challenges = getUserChallenges(userId);

            if (!challenges) {
                return interaction.reply({
                    content: '❌ Unable to load your challenges. Please try again.',
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setColor('#00D9FF')
                .setTitle(`📋 ${interaction.user.username}'s Challenges`)
                .setTimestamp();

            // Daily challenges section
            if (challenges.daily && challenges.daily.length > 0) {
                const dailyText = challenges.daily.map(challenge => {
                    const progressBar = createProgressBar(challenge.progress, challenge.target);
                    const status = challenge.completed ? '✅' : '⏳';
                    const reward = challenge.completed ? `~~$${challenge.reward}~~` : `$${challenge.reward}`;

                    return `${status} ${challenge.emoji} **${challenge.name}**\n` +
                        `*${challenge.description}*\n` +
                        `${progressBar} ${Math.min(challenge.progress, challenge.target)}/${challenge.target}\n` +
                        `Reward: ${reward}`;
                }).join('\n\n');

                const timeUntilReset = getTimeUntilReset(challenges.lastDailyReset, 24);
                embed.addFields({
                    name: `🌅 Daily Challenges (Resets in ${timeUntilReset})`,
                    value: dailyText,
                    inline: false
                });
            }

            // Weekly challenges section
            if (challenges.weekly && challenges.weekly.length > 0) {
                const weeklyText = challenges.weekly.map(challenge => {
                    const progressBar = createProgressBar(challenge.progress, challenge.target);
                    const status = challenge.completed ? '✅' : '⏳';
                    const reward = challenge.completed ? `~~$${challenge.reward}~~` : `$${challenge.reward}`;

                    return `${status} ${challenge.emoji} **${challenge.name}**\n` +
                        `*${challenge.description}*\n` +
                        `${progressBar} ${Math.min(challenge.progress, challenge.target)}/${challenge.target}\n` +
                        `Reward: ${reward}`;
                }).join('\n\n');

                const timeUntilReset = getTimeUntilReset(challenges.lastWeeklyReset, 168); // 7 days in hours
                embed.addFields({
                    name: `📅 Weekly Challenges (Resets in ${timeUntilReset})`,
                    value: weeklyText,
                    inline: false
                });
            }

            // Add challenge stats
            const completedDaily = challenges.daily.filter(c => c.completed).length;
            const completedWeekly = challenges.weekly.filter(c => c.completed).length;
            const totalCompleted = challenges.completionHistory.length;

            embed.setFooter({
                text: `Daily: ${completedDaily}/${challenges.daily.length} | Weekly: ${completedWeekly}/${challenges.weekly.length} | Total Completed: ${totalCompleted}`
            });

            // Add claim button if any challenges are completed
            const hasCompletedChallenges = [...challenges.daily, ...challenges.weekly].some(c => c.completed);

            if (hasCompletedChallenges) {
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('claim_challenge_rewards')
                            .setLabel('Claim Rewards')
                            .setStyle(ButtonStyle.Success)
                            .setEmoji('💰')
                    );

                await interaction.reply({ embeds: [embed], components: [row] });
            } else {
                await interaction.reply({ embeds: [embed] });
            }

        } catch (error) {
            console.error('Error in challenges command:', error);
            await interaction.reply({
                content: '❌ An error occurred while fetching your challenges. Please try again.',
                ephemeral: true
            });
        }
    }
};

// Helper function to create a progress bar
function createProgressBar(current, target, length = 10) {
    const percentage = Math.min(current / target, 1);
    const filled = Math.floor(percentage * length);
    const empty = length - filled;

    return '▰'.repeat(filled) + '▱'.repeat(empty);
}

// Helper function to get time until reset
function getTimeUntilReset(lastReset, hoursUntilReset) {
    const now = Date.now();
    const resetTime = lastReset + (hoursUntilReset * 60 * 60 * 1000);
    const timeLeft = resetTime - now;

    if (timeLeft <= 0) return 'Soon';

    const hours = Math.floor(timeLeft / (60 * 60 * 1000));
    const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

    if (hours > 24) {
        const days = Math.floor(hours / 24);
        return `${days}d ${hours % 24}h`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}
