const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Get help and learn how to use the casino bot')
        .addStringOption(option =>
            option.setName('topic')
                .setDescription('Specific help topic')
                .setRequired(false)
                .addChoices(
                    { name: 'Games - Card Games', value: 'card_games' },
                    { name: 'Games - Dice & Chance', value: 'chance_games' },
                    { name: 'Games - Specialty', value: 'specialty_games' },
                    { name: 'Economy System', value: 'economy' },
                    { name: 'Guild System', value: 'guilds' },
                    { name: 'VIP System', value: 'vip' },
                    { name: 'Achievements & Challenges', value: 'progression' },
                    { name: 'Commands List', value: 'commands' }
                )
        ),

    async execute(interaction) {
        const topic = interaction.options.getString('topic');

        if (topic) {
            await showSpecificHelp(interaction, topic);
        } else {
            await showMainHelp(interaction);
        }
    }
};

/**
 * Shows the main help overview
 */
async function showMainHelp(interaction) {
    const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('🎰 Casino Bot - Help & Guide')
        .setDescription('Welcome to the Casino Bot! Here\'s everything you need to know.')
        .addFields(
            {
                name: '🎮 Games',
                value: '**Card Games:** Blackjack, Poker, War\n' +
                       '**Dice & Chance:** Craps, Slots, Roulette, Crash\n' +
                       '**Specialty:** Horse Racing, Bingo, Coinflip, Hi-Lo, Plinko\n' +
                       '**Tournaments:** Poker tournaments with prizes',
                inline: false
            },
            {
                name: '💰 Economy System',
                value: 'Earn money through `/work`, `/daily`, and smart gambling.\n' +
                       'Buy items from the `/shop`, properties for passive income,\n' +
                       'and manage your finances with `/balance` and `/loan`.',
                inline: false
            },
            {
                name: '👥 Guild System',
                value: 'Join or create guilds with `/guild`!\n' +
                       'Participate in heists, boss raids, and guild events.\n' +
                       'Level up your guild for exclusive perks and bonuses.',
                inline: false
            },
            {
                name: '⭐ Progression',
                value: 'Unlock achievements, complete daily/weekly challenges,\n' +
                       'and climb the VIP tiers for exclusive benefits!',
                inline: false
            },
            {
                name: '📋 Quick Start',
                value: '1️⃣ Check your balance: `/balance`\n' +
                       '2️⃣ Earn starting money: `/work` or `/daily`\n' +
                       '3️⃣ Try a game: `/blackjack`, `/slots`, or `/roulette`\n' +
                       '4️⃣ View your stats: `/stats`',
                inline: false
            },
            {
                name: '🔍 Get Detailed Help',
                value: 'Use `/help <topic>` for detailed information:\n' +
                       '• `/help topic:card_games` - Card game rules\n' +
                       '• `/help topic:economy` - Economy system guide\n' +
                       '• `/help topic:guilds` - Guild system guide\n' +
                       '• And more!',
                inline: false
            }
        )
        .setFooter({ text: 'Have fun and gamble responsibly!' })
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

/**
 * Shows specific help topics
 */
async function showSpecificHelp(interaction, topic) {
    let embed;

    switch (topic) {
        case 'card_games':
            embed = createCardGamesHelp();
            break;
        case 'chance_games':
            embed = createChanceGamesHelp();
            break;
        case 'specialty_games':
            embed = createSpecialtyGamesHelp();
            break;
        case 'economy':
            embed = createEconomyHelp();
            break;
        case 'guilds':
            embed = createGuildsHelp();
            break;
        case 'vip':
            embed = createVIPHelp();
            break;
        case 'progression':
            embed = createProgressionHelp();
            break;
        case 'commands':
            embed = createCommandsHelp();
            break;
        default:
            await showMainHelp(interaction);
            return;
    }

    await interaction.reply({ embeds: [embed] });
}

function createCardGamesHelp() {
    return new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('🃏 Card Games Guide')
        .setDescription('Master the art of card games!')
        .addFields(
            {
                name: '♠️ Blackjack (`/blackjack`)',
                value: '**Goal:** Get 21 or closer than the dealer without going over.\n' +
                       '**Actions:** Hit (draw card), Stand (keep hand), Double (2x bet, 1 card), Split (separate pairs)\n' +
                       '**Natural Blackjack:** Ace + 10-value card = 1.5x payout + jackpot chance!\n' +
                       '**Bet Range:** $10 - $10,000',
                inline: false
            },
            {
                name: '🎴 Three Card Poker (`/threecard`)',
                value: '**Goal:** Beat the dealer\'s 3-card hand.\n' +
                       '**Play:** Ante bet → View cards → Fold or Play (2x ante)\n' +
                       '**Pair Plus:** Optional side bet for bonus payouts on pairs or better\n' +
                       '**Dealer Qualifies:** Must have Queen-high or better',
                inline: false
            },
            {
                name: '⚔️ War (`/war`)',
                value: '**Goal:** Draw a higher card than the dealer.\n' +
                       '**War:** On ties, choose to "Go to War" (double bet) or Surrender (lose half)\n' +
                       '**Payout:** 1:1 on wins, 2:1 if you win the war\n' +
                       '**Simple & Fast:** Perfect for quick games!',
                inline: false
            },
            {
                name: '🏆 Poker Tournament (`/tournament`)',
                value: '**Multiplayer:** Compete against other players\n' +
                       '**Buy-in:** Entry fee goes into prize pool\n' +
                       '**Last Standing:** Elimination-style, winner takes all\n' +
                       '**Strategy:** Manage your chips wisely!',
                inline: false
            }
        )
        .setFooter({ text: 'Tip: Practice with small bets first!' });
}

function createChanceGamesHelp() {
    return new EmbedBuilder()
        .setColor(0xFF1493)
        .setTitle('🎲 Dice & Chance Games Guide')
        .setDescription('Test your luck with these exciting games!')
        .addFields(
            {
                name: '🎰 Slots (`/slots`)',
                value: '**How to Play:** Spin the reels and match symbols\n' +
                       '**Payouts:** 3 matching symbols on any payline\n' +
                       '**Symbols:** 🍒 (2x), 🍋 (3x), 🍊 (5x), 🍇 (10x), 💎 (50x), 7️⃣ (100x)\n' +
                       '**Tip:** Higher bets = higher potential wins!',
                inline: false
            },
            {
                name: '🔴 Roulette (`/roulette`)',
                value: '**Interactive Betting:** Place chips on the board\n' +
                       '**Bet Types:** Numbers (35:1), Red/Black (1:1), Dozens (2:1), and more\n' +
                       '**Strategy:** Combine multiple bets for better odds\n' +
                       '**Chip Values:** $10, $50, $100, $500, $1000',
                inline: false
            },
            {
                name: '🎲 Craps (`/craps`)',
                value: '**Come Out Roll:** 7/11 wins, 2/3/12 loses, others set a point\n' +
                       '**Bets:** Pass/Don\'t Pass, Come/Don\'t Come, Odds bets\n' +
                       '**Complex:** But rewarding once you learn it!\n' +
                       '**Best Odds:** Take odds bets for lower house edge',
                inline: false
            },
            {
                name: '📉 Crash (`/crash`)',
                value: '**Watch:** Multiplier increases from 1.00x\n' +
                       '**Cash Out:** Before it crashes!\n' +
                       '**Risk/Reward:** Higher multipliers = more profit, more risk\n' +
                       '**Auto Cash Out:** Set target multiplier for automatic wins',
                inline: false
            }
        )
        .setFooter({ text: 'Remember: The house always has an edge!' });
}

function createSpecialtyGamesHelp() {
    return new EmbedBuilder()
        .setColor(0x00FF00)
        .setTitle('🎪 Specialty Games Guide')
        .setDescription('Unique games for variety and fun!')
        .addFields(
            {
                name: '🏇 Horse Racing (`/horserace`)',
                value: '**Bet on Horses:** Choose your favorite (1-6)\n' +
                       '**Watch Race:** Animated race with live updates\n' +
                       '**Payouts:** Odds based on random race dynamics\n' +
                       '**Tip:** Bet on multiple horses to increase chances!',
                inline: false
            },
            {
                name: '🅱️ Bingo (`/bingo`)',
                value: '**Multiplayer:** Join a bingo lobby with others\n' +
                       '**Mark Numbers:** As they\'re called\n' +
                       '**Win Patterns:** Lines, corners, or full card\n' +
                       '**Social:** Chat and play with friends!',
                inline: false
            },
            {
                name: '🪙 Coinflip (`/coinflip`)',
                value: '**Simple:** Choose Heads or Tails\n' +
                       '**Payout:** 2x on wins, 50/50 odds\n' +
                       '**Fast:** Perfect for quick gambling\n' +
                       '**Streaks:** Try to build winning streaks!',
                inline: false
            },
            {
                name: '📊 Hi-Lo (`/hilo`)',
                value: '**Guess:** Next card higher or lower\n' +
                       '**Build Streaks:** Each correct guess increases multiplier\n' +
                       '**Cash Out:** Anytime to claim your winnings\n' +
                       '**Strategy:** Know when to take profits!',
                inline: false
            },
            {
                name: '📌 Plinko (`/plinko`)',
                value: '**Drop Ball:** Watch it bounce down the board\n' +
                       '**Multipliers:** Land in slots for different payouts\n' +
                       '**Risk Levels:** Choose low, medium, or high risk\n' +
                       '**Fun:** Exciting to watch and play!',
                inline: false
            }
        )
        .setFooter({ text: 'Mix it up with different games!' });
}

function createEconomyHelp() {
    return new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('💰 Economy System Guide')
        .setDescription('Learn how to manage your money and grow your wealth!')
        .addFields(
            {
                name: '💵 Earning Money',
                value: '**`/daily`** - Claim daily bonus ($500-$2,000 based on VIP)\n' +
                       '**`/work`** - Work a shift ($200-$1,000, 4hr cooldown)\n' +
                       '**`/weekly`** - VIP weekly bonuses (Gold/Platinum only)\n' +
                       '**Gambling** - Win money playing casino games\n' +
                       '**Properties** - Passive income from owned properties',
                inline: false
            },
            {
                name: '🏦 Loans',
                value: '**`/loan`** - Borrow money when you\'re short\n' +
                       '**Credit Score:** 200-850+ affects interest rates (5%-25%)\n' +
                       '**Auto-Deduction:** 25% of winnings go to loan repayment\n' +
                       '**Penalties:** 5% daily penalty if 3+ days overdue\n' +
                       '**Warning:** Can\'t gamble if severely overdue!',
                inline: false
            },
            {
                name: '🏪 Shop & Items',
                value: '**`/shop`** - Browse items and boosts\n' +
                       '**Boosts:** Win multipliers, insurance, XP boosters\n' +
                       '**Mystery Boxes:** Random rewards\n' +
                       '**Properties:** Buy properties for passive income\n' +
                       '**`/inventory`** - View and use owned items',
                inline: false
            },
            {
                name: '💸 Managing Money',
                value: '**`/balance`** - Check your current money\n' +
                       '**`/gift`** - Send money to other players\n' +
                       '**`/stats`** - View detailed financial statistics\n' +
                       '**`/history`** - See your last 50 games',
                inline: false
            },
            {
                name: '💡 Money Tips',
                value: '• Do `/daily` and `/work` regularly for steady income\n' +
                       '• Don\'t bet more than you can afford to lose\n' +
                       '• Use loans wisely - pay them back quickly\n' +
                       '• Buy properties for passive income\n' +
                       '• Save up for VIP status for better bonuses',
                inline: false
            }
        )
        .setFooter({ text: 'Smart money management = long-term success!' });
}

function createGuildsHelp() {
    return new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle('👥 Guild System Guide')
        .setDescription('Join forces with other players in guilds!')
        .addFields(
            {
                name: '🏰 Guild Basics',
                value: '**Create:** `/guild create <name>` ($25,000 cost)\n' +
                       '**Join:** `/guild join <name>` or get invited\n' +
                       '**Leave:** `/guild leave`\n' +
                       '**Info:** `/guild info` - View guild details',
                inline: false
            },
            {
                name: '📊 Guild Ranks',
                value: '**Owner** - Full control over guild\n' +
                       '**Officer** - Can invite, kick, manage events\n' +
                       '**Veteran** - Trusted members with special perks\n' +
                       '**Member** - Standard guild member\n' +
                       '*Earn ranks through loyalty and contributions*',
                inline: false
            },
            {
                name: '⬆️ Guild Levels',
                value: '**XP:** Earned through gambling and challenges\n' +
                       '**Levels 1-100:** Each level unlocks new perks\n' +
                       '**Benefits:** Bonus XP, better payouts, exclusive items\n' +
                       '**Check:** `/guild info` to see current level',
                inline: false
            },
            {
                name: '💰 Guild Treasury',
                value: '**Donate:** `/guild donate <amount>` - Help your guild\n' +
                       '**Vault:** Secure storage for guild funds\n' +
                       '**Usage:** Fund heists, events, and member bonuses\n' +
                       '**Officers:** Can manage treasury',
                inline: false
            },
            {
                name: '🎯 Guild Events',
                value: '**Boss Raids:** Team up to defeat powerful bosses\n' +
                       '**Casino Domination:** Compete in gambling contests\n' +
                       '**Heist Festival:** Special collaborative heists\n' +
                       '**Rewards:** Exclusive prizes for top performers',
                inline: false
            },
            {
                name: '🏪 Guild Shop',
                value: '**Exclusive Items:** Only available to guild members\n' +
                       '**Guild Boosts:** Benefit the entire guild\n' +
                       '**Discounts:** Higher guild level = better prices',
                inline: false
            }
        )
        .setFooter({ text: 'Guilds make the game more fun - join one today!' });
}

function createVIPHelp() {
    return new EmbedBuilder()
        .setColor(0xFFD700)
        .setTitle('⭐ VIP System Guide')
        .setDescription('Unlock exclusive benefits with VIP status!')
        .addFields(
            {
                name: '🥉 Bronze VIP - $5,000',
                value: '• 10% bonus to `/work` earnings\n' +
                       '• +$100 daily bonus\n' +
                       '• +10% betting limits\n' +
                       '• Bronze badge on profile',
                inline: false
            },
            {
                name: '🥈 Silver VIP - $15,000',
                value: '• 25% bonus to `/work` earnings\n' +
                       '• +$250 daily bonus\n' +
                       '• +25% betting limits\n' +
                       '• Silver badge on profile\n' +
                       '• Priority support',
                inline: false
            },
            {
                name: '🥇 Gold VIP - $50,000',
                value: '• 50% bonus to `/work` earnings\n' +
                       '• +$500 daily bonus\n' +
                       '• $2,500 weekly bonus\n' +
                       '• +50% betting limits\n' +
                       '• Gold badge on profile\n' +
                       '• Exclusive emotes',
                inline: false
            },
            {
                name: '💎 Platinum VIP - $100,000',
                value: '• 100% bonus to `/work` earnings\n' +
                       '• +$1,000 daily bonus\n' +
                       '• $10,000 weekly bonus\n' +
                       '• +100% betting limits\n' +
                       '• Platinum badge on profile\n' +
                       '• Exclusive perks & features\n' +
                       '• Prestige status',
                inline: false
            },
            {
                name: '💡 VIP Tips',
                value: '• VIP status lasts 30 days from purchase\n' +
                       '• Renew before expiry to maintain benefits\n' +
                       '• Higher tiers include all lower tier benefits\n' +
                       '• Weekly bonuses can pay for itself!\n' +
                       '• Best investment for active players',
                inline: false
            }
        )
        .setFooter({ text: 'VIP = More earnings, bigger bets, better rewards!' });
}

function createProgressionHelp() {
    return new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle('🏆 Achievements & Challenges Guide')
        .setDescription('Track your progress and earn rewards!')
        .addFields(
            {
                name: '🏅 Achievements',
                value: '**Unlock:** Complete specific milestones\n' +
                       '**Categories:** Money, wins, streaks, game-specific\n' +
                       '**Rewards:** Money bonuses and exclusive titles\n' +
                       '**View:** `/achievements` - See your progress\n' +
                       '**Examples:** "Millionaire" ($1M earned), "Blackjack Master" (100 wins)',
                inline: false
            },
            {
                name: '📅 Daily Challenges',
                value: '**New Daily:** Reset every 24 hours\n' +
                       '**Tasks:** Win X games, earn Y amount, play Z rounds\n' +
                       '**Rewards:** Money and XP bonuses\n' +
                       '**Check:** `/challenges` - View active challenges\n' +
                       '**Tip:** Complete dailies for consistent rewards!',
                inline: false
            },
            {
                name: '📆 Weekly Challenges',
                value: '**New Weekly:** Reset every Monday\n' +
                       '**Bigger Tasks:** Harder challenges, better rewards\n' +
                       '**Guild:** Some challenges contribute to guild progress\n' +
                       '**Planning:** Plan your week to complete them all',
                inline: false
            },
            {
                name: '📊 Statistics',
                value: '**Track Everything:** Win rates, total wagered, profits\n' +
                       '**Per-Game Stats:** Detailed stats for each game\n' +
                       '**View:** `/stats` - See your complete statistics\n' +
                       '**Leaderboards:** `/leaderboard` - Compare with others',
                inline: false
            },
            {
                name: '💡 Progression Tips',
                value: '• Check challenges daily to maximize rewards\n' +
                       '• Focus on achievements you\'re close to completing\n' +
                       '• Win streaks give bonus achievement progress\n' +
                       '• Guild challenges reward the whole guild\n' +
                       '• Use `/stats` to identify your strongest games',
                inline: false
            }
        )
        .setFooter({ text: 'Keep playing to unlock all achievements!' });
}

function createCommandsHelp() {
    return new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle('📋 Commands List')
        .setDescription('Complete list of all available commands')
        .addFields(
            {
                name: '🎮 Game Commands',
                value: '`/blackjack` `/slots` `/roulette` `/threecard` `/craps` `/war`\n' +
                       '`/coinflip` `/horserace` `/crash` `/bingo` `/hilo` `/plinko`\n' +
                       '`/tournament` - Start various casino games',
                inline: false
            },
            {
                name: '💰 Economy Commands',
                value: '`/balance` `/daily` `/work` `/weekly`\n' +
                       '`/loan` `/gift` `/shop` `/inventory`',
                inline: false
            },
            {
                name: '👥 Guild Commands',
                value: '`/guild create` `/guild join` `/guild leave` `/guild info`\n' +
                       '`/guild donate` `/guild heist` `/guild events`',
                inline: false
            },
            {
                name: '📊 Stats & Info',
                value: '`/stats` `/history` `/achievements` `/challenges`\n' +
                       '`/leaderboard` `/help`',
                inline: false
            },
            {
                name: '⭐ VIP & Items',
                value: '`/vip` - Purchase VIP status\n' +
                       '`/property` - Buy and manage properties\n' +
                       '`/use` - Use items from inventory',
                inline: false
            }
        )
        .setFooter({ text: 'Use /help <topic> for detailed guides!' });
}
