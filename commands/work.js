const { EmbedBuilder } = require('discord.js');
const { getUserMoney, setUserMoney, getUserData, setLastWork } = require('../utils/data');
const { makePayment } = require('../utils/loanSystem');
const { getUserGuild } = require('../utils/guilds');
const { getGuildWithLevel } = require('../database/queries');
const { getPerkValue } = require('../utils/guildLevels');
const { awardWorkXP } = require('../utils/guildXP');
const { recordTransaction, TransactionTypes } = require('../utils/transactions');

// Work cooldown: 4 hours
const WORK_COOLDOWN = 4 * 60 * 60 * 1000;

const WORK_JOBS = [
    { name: '🍕 Delivered pizzas', pay: [50, 150] },
    { name: '🧹 Cleaned the casino', pay: [75, 125] },
    { name: '🚗 Drove a taxi', pay: [80, 180] },
    { name: '📦 Sorted packages', pay: [60, 140] },
    { name: '💼 Filed paperwork', pay: [70, 130] },
    { name: '🎰 Dealt cards', pay: [90, 160] },
    { name: '🍔 Flipped burgers', pay: [55, 145] },
    { name: '🏗️ Helped construction', pay: [100, 200] },
    { name: '🎨 Created art', pay: [85, 175] },
    { name: '📚 Tutored students', pay: [95, 155] }
];

module.exports = {
    data: {
        name: 'work',
        description: 'Work to earn money (4 hour cooldown)',
        options: []
    },

    async execute(interaction) {
        const userId = interaction.user.id;
        const userData = await getUserData(userId);

        if (!userData) {
            return interaction.reply({
                content: '❌ User data not found!',
                ephemeral: true
            });
        }

        // Check cooldown
        const lastWork = userData.lastWork || 0;
        const timeLeft = (lastWork + WORK_COOLDOWN) - Date.now();

        if (timeLeft > 0) {
            const hours = Math.floor(timeLeft / (60 * 60 * 1000));
            const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));

            // Check if user has a work reset token
            const { canResetWork } = require('../utils/guildShopEffects');
            const hasResetToken = await canResetWork(userId);

            let message = `⏰ You're too tired to work! Come back in ${hours}h ${minutes}m.`;
            if (hasResetToken) {
                message += `\n\n💎 You have a **Work Reset Token**! Use \`/use-reset-token work\` to work again now!`;
            }

            return interaction.reply({
                content: message,
                ephemeral: true
            });
        }

        // Random job and pay
        const job = WORK_JOBS[Math.floor(Math.random() * WORK_JOBS.length)];
        let earnings = Math.floor(Math.random() * (job.pay[1] - job.pay[0] + 1)) + job.pay[0];

        // Apply VIP work bonus
        const { getVIPWorkBonus } = require('../utils/vip');
        const vipBonus = await getVIPWorkBonus(userId);
        let vipBonusAmount = 0;

        if (vipBonus > 0) {
            vipBonusAmount = Math.floor(earnings * vipBonus);
            earnings += vipBonusAmount;
        }

        // Apply Guild work bonus
        let guildBonusAmount = 0;
        const userGuild = await getUserGuild(userId);
        if (userGuild) {
            const guildData = await getGuildWithLevel(userGuild.guildId);
            if (guildData) {
                const guildLevel = guildData.level || 1;
                const workBonusMultiplier = getPerkValue(guildLevel, 'work_bonus');
                if (workBonusMultiplier > 0) {
                    guildBonusAmount = Math.floor(earnings * workBonusMultiplier);
                    earnings += guildBonusAmount;
                }
            }
        }

        // Check for guild shop work boost (Overtime Pass)
        const { useWorkBoost } = require('../utils/guildShopEffects');
        const workBoostResult = await useWorkBoost(userId);
        let workBoostAmount = 0;
        if (workBoostResult.success) {
            const beforeBoost = earnings;
            earnings = Math.floor(earnings * workBoostResult.multiplier);
            workBoostAmount = earnings - beforeBoost;
        }

        // Update last work time
        await setLastWork(userId);

        // Award guild XP for work (async, don't wait)
        awardWorkXP(userId).catch(err =>
            console.error('Error awarding work XP:', err)
        );

        // Check if has loan
        let loanDeduction = 0;
        let afterLoan = earnings;

        if (userData.activeLoan) {
            const loan = userData.activeLoan;
            const remaining = loan.totalOwed - loan.amountPaid;

            // Take 75% of earnings for loan if overdue, otherwise 50%
            const deductionRate = loan.daysOverdue > 0 ? 0.75 : 0.5;
            loanDeduction = Math.min(Math.floor(earnings * deductionRate), remaining);

            if (loanDeduction > 0) {
                const paymentResult = await makePayment(userId, loanDeduction);
                afterLoan = earnings - loanDeduction;
            }
        }

        // Give money
        const currentMoney = await getUserMoney(userId);
        const newBalance = currentMoney + afterLoan;
        await setUserMoney(userId, newBalance);

        // Record transaction
        await recordTransaction({
            userId: userId,
            type: TransactionTypes.WORK,
            amount: afterLoan,
            balanceAfter: newBalance,
            description: `${job.name} - earned $${earnings.toLocaleString()}${loanDeduction > 0 ? ` (loan payment: $${loanDeduction.toLocaleString()})` : ''}`,
            metadata: {
                jobName: job.name,
                baseEarnings: earnings,
                loanDeduction: loanDeduction,
                netEarnings: afterLoan,
                vipBonus: vipBonusAmount,
                guildBonus: guildBonusAmount,
                workBoost: workBoostAmount
            }
        });

        // Check work achievements and update challenges
        const { checkWorkAchievements } = require('../utils/achievements');
        const { updateChallengeProgress } = require('../utils/challenges');

        await checkWorkAchievements(userId);
        await updateChallengeProgress(userId, { type: 'work' });

        const embed = new EmbedBuilder()
            .setTitle('💼 Work Complete!')
            .setColor(loanDeduction > 0 ? '#FFA500' : '#00FF00')
            .setDescription(`${job.name} and earned **${earnings.toLocaleString()}**!`);

        if (loanDeduction > 0) {
            const updatedUserData = await getUserData(userId);
            const stillHasLoan = updatedUserData.activeLoan !== null;

            embed.addFields(
                { name: '💵 Earnings', value: `${earnings.toLocaleString()}`, inline: true },
                { name: '⚠️ Loan Payment', value: `-${loanDeduction.toLocaleString()}`, inline: true },
                { name: '💰 Net Earnings', value: `${afterLoan.toLocaleString()}`, inline: true }
            );

            if (!stillHasLoan) {
                embed.addFields({
                    name: '✅ LOAN PAID OFF!',
                    value: 'Your loan has been fully repaid with this payment!',
                    inline: false
                });
                embed.setColor('#00FF00');
            }
        } else {
            embed.addFields(
                { name: '💰 Earned', value: `${earnings.toLocaleString()}`, inline: true },
                { name: '💵 New Balance', value: `${newBalance.toLocaleString()}`, inline: true }
            );
        }

        embed.setFooter({ text: 'You can work again in 4 hours' });
        embed.setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
