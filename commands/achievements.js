const { EmbedBuilder } = require('discord.js');
const { getUserAchievements, getAchievementsByCategory } = require('../utils/achievements');

module.exports = {
    data: {
        name: 'achievements',
        description: 'View your unlocked achievements and progress'
    },

    async execute(interaction) {
        try {
            const userId = interaction.user.id;
            const { unlocked, locked, progress, stats } = getUserAchievements(userId);

            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle(`🏆 ${interaction.user.username}'s Achievements`)
                .setTimestamp();

            // Show unlocked achievements
            if (unlocked.length > 0) {
                const unlockedText = unlocked
                    .sort((a, b) => b.unlockedAt - a.unlockedAt) // Most recent first
                    .slice(0, 10) // Show first 10
                    .map(achievement => {
                        const date = new Date(achievement.unlockedAt);
                        return `${achievement.emoji} **${achievement.name}**\n*${achievement.description}*\nUnlocked: ${date.toLocaleDateString()}`;
                    })
                    .join('\n\n');

                embed.addFields({
                    name: `✅ Unlocked Achievements (${unlocked.length})`,
                    value: unlockedText || 'None yet',
                    inline: false
                });
            }

            // Show progress towards locked achievements
            const progressText = [];

            // Win streak progress
            if (progress.currentWinStreak > 0) {
                progressText.push(`🍀 Win Streak: ${progress.currentWinStreak}/10 (Best: ${progress.bestWinStreak || 0})`);
            }

            // High Roller progress
            const wageredProgress = stats.totalWagered || 0;
            if (wageredProgress < 100000) {
                progressText.push(`🎰 Total Wagered: $${wageredProgress.toLocaleString()}/$100,000`);
            }

            // Blackjack Master progress
            const blackjacks = stats.blackjacks || 0;
            if (blackjacks < 100) {
                progressText.push(`🃏 Blackjacks: ${blackjacks}/100`);
            }

            // Slots Champion progress
            const slotsWins = stats.slotsWins || 0;
            if (slotsWins < 500) {
                progressText.push(`🎰 Slots Wins: ${slotsWins}/500`);
            }

            // Roulette King progress
            const rouletteWins = stats.rouletteWins || 0;
            if (rouletteWins < 100) {
                progressText.push(`👑 Roulette Wins: ${rouletteWins}/100`);
            }

            // Work progress
            const workShifts = progress.workShifts || 0;
            if (workShifts < 100) {
                progressText.push(`💼 Work Shifts: ${workShifts}/100`);
            }

            // Loans progress
            if (progress.loansRepaid < 10) {
                progressText.push(`✨ Loans Repaid: ${progress.loansRepaid || 0}/10`);
            }

            if (progressText.length > 0) {
                embed.addFields({
                    name: '📊 Progress',
                    value: progressText.slice(0, 8).join('\n'),
                    inline: false
                });
            }

            // Show some locked achievements
            if (locked.length > 0) {
                const lockedText = locked
                    .slice(0, 5)
                    .map(achievement => `${achievement.emoji} **${achievement.name}**\n*${achievement.description}*`)
                    .join('\n\n');

                embed.addFields({
                    name: `🔒 Locked Achievements (${locked.length})`,
                    value: lockedText,
                    inline: false
                });
            }

            embed.setFooter({ text: `You have unlocked ${unlocked.length} out of ${unlocked.length + locked.length} achievements!` });

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in achievements command:', error);

            const errorMessage = {
                content: '❌ An error occurred while fetching your achievements. Please try again.',
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
