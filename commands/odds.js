const { EmbedBuilder } = require('discord.js');

module.exports = {
    data: {
        name: 'odds',
        description: 'View the odds and payouts for all casino games',
        options: []
    },

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🎰 Casino Game Odds & Payouts')
            .setDescription('All odds are mathematically fair and match standard casino rules. Our code is transparent and auditable.')
            .setColor('#FFD700')
            .addFields(
                {
                    name: '🃏 Blackjack',
                    value:
                        '**Payouts:**\n' +
                        '• Blackjack (21 with 2 cards): 3:2 (1.5x)\n' +
                        '• Regular Win: 1:1 (2x total)\n' +
                        '• Push (tie): Bet returned\n' +
                        '• Insurance (dealer blackjack): 2:1\n\n' +
                        '**House Edge:** ~0.5% (with optimal play)\n' +
                        '**Dealer Rules:** Stands on 17, hits on 16 or less',
                    inline: false
                },
                {
                    name: '🎰 Slots (3-Reel, 3-Line)',
                    value:
                        '**Payouts (per matching line):**\n' +
                        '• 7️⃣7️⃣7️⃣ (Triple Sevens): 50x\n' +
                        '• ⭐⭐⭐ (Triple Stars): 20x\n' +
                        '• 🔔🔔🔔 (Triple Bells): 10x\n' +
                        '• 🍇🍇🍇 (Triple Grapes): 5x\n' +
                        '• 🍊🍊🍊 (Triple Oranges): 4x\n' +
                        '• 🍋🍋🍋 (Triple Lemons): 3x\n' +
                        '• 🍒🍒🍒 (Triple Cherries): 2x\n\n' +
                        '**Lines:** Top, Middle, Bottom (3 chances per spin)\n' +
                        '**Symbol Probability:** Equal (1/7 each = ~14.3%)\n' +
                        '**Triple Match Chance:** (1/7)³ ≈ 0.29% per line',
                    inline: false
                },
                {
                    name: '🃏 Three Card Poker',
                    value:
                        '**Ante Bonus (automatic if you win):**\n' +
                        '• Straight Flush: 5:1\n' +
                        '• Three of a Kind: 4:1\n' +
                        '• Straight: 1:1\n\n' +
                        '**Pair Plus Side Bet:**\n' +
                        '• Straight Flush: 40:1\n' +
                        '• Three of a Kind: 30:1\n' +
                        '• Straight: 6:1\n' +
                        '• Flush: 3:1\n' +
                        '• Pair: 1:1\n\n' +
                        '**Dealer Qualification:** Queen high or better\n' +
                        '**House Edge:** ~3.4% (Ante), ~7.3% (Pair Plus)',
                    inline: false
                },
                {
                    name: '🎰 American Roulette',
                    value:
                        '**Payouts:**\n' +
                        '• Straight Up (single number): 35:1\n' +
                        '• Green (0 or 00): 17:1\n' +
                        '• Dozens (1-12, 13-24, 25-36): 2:1\n' +
                        '• Red/Black: 1:1\n' +
                        '• Odd/Even: 1:1\n' +
                        '• High (19-36) / Low (1-18): 1:1\n\n' +
                        '**Numbers:** 0, 00, 1-36 (38 total)\n' +
                        '**Red Numbers:** 1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36\n' +
                        '**Black Numbers:** 2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35\n' +
                        '**House Edge:** 5.26% (due to 0 and 00)',
                    inline: false
                },
                {
                    name: '🎲 Craps',
                    value:
                        '**Pass Line Bet:**\n' +
                        '• Come-out: Win on 7/11, lose on 2/3/12\n' +
                        '• Point phase: Win if point rolled before 7\n' +
                        '• Payout: 1:1\n\n' +
                        '**Don\'t Pass Bet:**\n' +
                        '• Come-out: Win on 2/3, lose on 7/11, push on 12\n' +
                        '• Point phase: Win if 7 rolled before point\n' +
                        '• Payout: 1:1\n\n' +
                        '**Field Bet (one-roll):**\n' +
                        '• Wins on 2, 3, 4, 9, 10, 11, 12\n' +
                        '• 2 pays 2:1, 12 pays 3:1, others pay 1:1\n' +
                        '• Loses on 5, 6, 7, 8\n\n' +
                        '**House Edge:** ~1.4% (Pass/Don\'t Pass), ~5.6% (Field)',
                    inline: false
                },
                {
                    name: '⚔️ Casino War',
                    value:
                        '**Basic Rules:**\n' +
                        '• Player vs Dealer - highest card wins\n' +
                        '• Regular win: 1:1 (even money)\n' +
                        '• Regular loss: Lose entire bet\n\n' +
                        '**On a Tie:**\n' +
                        '• Surrender: Get half your bet back\n' +
                        '• Go to War: Match your original bet\n' +
                        '  - 6 cards burned, then one card each\n' +
                        '  - Win: Get both bets back + 1:1 on original\n' +
                        '  - Lose: Lose both bets\n' +
                        '  - Tie again: Automatic win!\n\n' +
                        '**House Edge:** ~2.88% (going to war on ties)',
                    inline: false
                },
                {
                    name: '🪙 Coin Flip',
                    value:
                        '**Payouts:**\n' +
                        '• Win: 1:1 (double your bet)\n' +
                        '• Loss: Lose entire bet\n\n' +
                        '**Probability:**\n' +
                        '• Heads: 50%\n' +
                        '• Tails: 50%\n\n' +
                        '**House Edge:** 0% (true 50/50 odds)\n' +
                        '**RTP:** 100% (fair game)',
                    inline: false
                },
                {
                    name: '🏇 Horse Racing',
                    value:
                        '**Horses & Odds:**\n' +
                        '• #1 Lightning Bolt: 3:1\n' +
                        '• #2 Thunder Strike: 4:1\n' +
                        '• #3 Midnight Runner: 5:1\n' +
                        '• #4 Golden Flash: 6:1\n' +
                        '• #5 Storm Chaser: 8:1\n' +
                        '• #6 Wild Wind: 10:1\n\n' +
                        '**How It Works:**\n' +
                        '• Lower odds = higher chance to win\n' +
                        '• Higher odds = bigger payout but riskier\n' +
                        '• Race simulated with weighted probabilities\n\n' +
                        '**Payout:** (Odds × Bet) + Original Bet',
                    inline: false
                },
                {
                    name: '🎰 Lottery',
                    value:
                        '**How to Play:**\n' +
                        '• Pick 5 numbers from 1-50\n' +
                        '• Ticket cost: 100\n' +
                        '• Draw occurs 10 minutes after first ticket\n\n' +
                        '**Prize Distribution:**\n' +
                        '• Match 5/5: 60% of prize pool (Jackpot)\n' +
                        '• Match 4/5: 25% of prize pool\n' +
                        '• Match 3/5: 15% of prize pool\n' +
                        '• Match 2 or less: No prize\n\n' +
                        '**Odds:**\n' +
                        '• Match 5/5: ~1 in 2,118,760\n' +
                        '• Match 4/5: ~1 in 9,631\n' +
                        '• Match 3/5: ~1 in 344\n\n' +
                        '*Prize pool grows with each ticket sold*\n' +
                        '*Multiple winners split the prize tier*',
                    inline: false
                },
                {
                    name: '🚀 Crash',
                    value:
                        '**How to Play:**\n' +
                        '• Place your bet\n' +
                        '• Watch the multiplier climb from 1.00x\n' +
                        '• Cash out before it crashes!\n\n' +
                        '**Mechanics:**\n' +
                        '• Multiplier increases by 0.10x each step\n' +
                        '• Crash point is randomly generated (1.00x - 100.00x)\n' +
                        '• Cash out to win: Bet × Current Multiplier\n' +
                        '• If you don\'t cash out before crash: Lose bet\n\n' +
                        '**House Edge:** 3%\n' +
                        '**RTP:** 97% (average)\n' +
                        '*Uses inverse exponential distribution for fairness*',
                    inline: false
                },
                {
                    name: '🎴 Hi-Lo',
                    value:
                        '**How to Play:**\n' +
                        '• Guess if next card is Higher or Lower\n' +
                        '• Build a streak for bigger payouts\n' +
                        '• Cash out anytime to keep your winnings\n\n' +
                        '**Payouts (per correct guess):**\n' +
                        '• Streak 1-2: 1.5x multiplier\n' +
                        '• Streak 3-4: 1.8x multiplier\n' +
                        '• Streak 5-6: 2.0x multiplier\n' +
                        '• Streak 7+: 2.5x multiplier\n\n' +
                        '**Rules:**\n' +
                        '• Aces are low (1)\n' +
                        '• If equal card, you lose\n' +
                        '• Wrong guess = lose everything\n\n' +
                        '**House Edge:** ~2%',
                    inline: false
                },
                {
                    name: '🃏 Poker Tournament',
                    value:
                        '**Format:**\n' +
                        '• Texas Hold\'em tournament style\n' +
                        '• 2-8 players compete\n' +
                        '• Last player standing wins pot\n\n' +
                        '**Chip Distribution:**\n' +
                        '• Each player starts with 1000 chips\n' +
                        '• Blinds increase every few hands\n' +
                        '• Eliminated when chips reach 0\n\n' +
                        '**Actions:**\n' +
                        '• Fold: Give up your hand\n' +
                        '• Check: Pass without betting (if no bet)\n' +
                        '• Call: Match current bet\n' +
                        '• Raise: Increase the bet\n\n' +
                        '**Prize:** Winner takes entire pot\n' +
                        '**House Edge:** 0% (player vs player)',
                    inline: false
                },
                {
                    name: '💡 Probability Guide',
                    value:
                        '**Understanding Odds:**\n' +
                        '• "3:2" means win $3 for every $2 bet\n' +
                        '• "35:1" means win $35 for every $1 bet (plus original bet back)\n' +
                        '• House edge = casino advantage over infinite plays\n' +
                        '• All games use standard cryptographically secure RNG\n\n' +
                        '**Code Transparency:**\n' +
                        'Our game logic is open source. You can verify:\n' +
                        '• Deck shuffling uses Fisher-Yates algorithm\n' +
                        '• All payouts match displayed odds exactly\n' +
                        '• No hidden multipliers or reduced payouts',
                    inline: false
                },
                {
                    name: '📊 Return to Player (RTP)',
                    value:
                        '• **Bingo:** 100% (player vs player, no house edge)\n' +
                        '• **Blackjack:** ~99.5% (with basic strategy)\n' +
                        '• **Casino War:** ~97.12% (going to war on ties)\n' +
                        '• **Coin Flip:** 100% (true 50/50)\n' +
                        '• **Crash:** 97% (3% house edge)\n' +
                        '• **Craps:** ~98.6% (Pass/Don\'t Pass), ~94.4% (Field)\n' +
                        '• **Hi-Lo:** ~98% (2% house edge)\n' +
                        '• **Horse Racing:** Varies by odds (80-90% avg)\n' +
                        '• **Lottery:** 100% of pool distributed to winners\n' +
                        '• **Poker Tournament:** 100% (player vs player)\n' +
                        '• **Roulette:** ~94.74% (American wheel)\n' +
                        '• **Slots:** ~94-96% (varies by symbol distribution)\n' +
                        '• **Three Card Poker:** ~96.6% (Ante only)\n\n' +
                        '*RTP = Expected % of bets returned over time*',
                    inline: false
                }
            )
            .setFooter({ text: 'All odds are programmatically enforced and cannot be modified without code changes' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
