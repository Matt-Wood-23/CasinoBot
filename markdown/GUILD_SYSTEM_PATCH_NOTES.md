# 🏰 Guild System Update - Complete Patch Notes

## Welcome to the Guild Era!

We're excited to announce the **complete guild system** for CasinoBot! Form alliances, compete in epic events, unlock exclusive rewards, and dominate the leaderboards with your guild!

---

## 🎯 Table of Contents

1. [Guild Basics](#guild-basics)
2. [Guild Levels & XP](#guild-levels--xp)
3. [Guild Ranks & Permissions](#guild-ranks--permissions)
4. [Guild Vault](#guild-vault)
5. [Contribution Points & Shop](#contribution-points--shop)
6. [Guild Events](#guild-events)
7. [Leaderboard Rewards](#leaderboard-rewards)
8. [Commands Reference](#commands-reference)

---

## 🏰 Guild Basics

### What are Guilds?
Guilds are groups of players working together to earn XP, complete challenges, compete in events, and earn massive rewards!

### How to Get Started
- **Create a guild:** `/guild create <name> <tag>`
- **Join a guild:** `/guild join <tag>`
- **View your guild:** `/guild info`
- **Leave a guild:** `/guild leave`

### Guild Features
- **Up to 10 members** (starts at 5, increases with level)
- **Shared treasury** for guild funds
- **Guild-exclusive shop** with unique items
- **Rank system** with customizable permissions
- **Weekly and seasonal rewards** for top guilds
- **Special events** with massive prize pools

---

## 📊 Guild Levels & XP

### How It Works
Your guild gains XP when members play games, wager money, complete challenges, and participate in heists!

### 20 Levels of Progression
- **Level 1:** 5 members max, 0 XP required
- **Level 5:** 6 members max, 50,000 XP required
- **Level 10:** 8 members max, 450,000 XP required
- **Level 15:** 9 members max, 1,500,000 XP required
- **Level 20:** 10 members max, 3,500,000 XP required

### How to Earn Guild XP

**Play Games:**
- Every game you play: **100 XP**
- Win a game: **+50 bonus XP**

**Wager Money:**
- Every $100 wagered: **10 XP**
- High rollers earn more XP!

**Complete Weekly Challenges:**
- Finish a weekly challenge: **500 XP**

**Participate in Heists:**
- Successful heist: **200 XP**
- Failed heist: **50 XP**

**Donate to Treasury:**
- Every $10,000 donated: **100 XP**

### View Guild Progress
Use `/guild info` to see:
- Current level and XP
- XP progress to next level
- Total XP earned
- Member count and max capacity

---

## 👑 Guild Ranks & Permissions

### Default Ranks
Every guild starts with 5 ranks:

1. **👑 Leader** (Rank 0)
   - Full control over everything
   - Automatically assigned to guild creator

2. **🛡️ Officer** (Rank 1)
   - Invite/kick members
   - Manage ranks (below Officer)
   - Manage vault
   - Edit guild info

3. **⭐ Veteran** (Rank 2)
   - Invite members only
   - View vault only

4. **🎖️ Member** (Rank 3)
   - Standard member
   - Can use guild features

5. **🆕 Recruit** (Rank 4)
   - New members
   - Limited permissions

### Rank Commands
- **View ranks:** `/guild ranks`
- **Assign rank:** `/guild-rank assign <member> <rank>`
- **View member's rank:** `/guild-rank view <member>`

### Customizable Permissions
Leaders can customize permissions for each rank:
- Invite members
- Kick members
- Manage ranks
- Manage vault (deposit/withdraw)
- Edit guild info
- View vault balance

---

## 💰 Guild Vault

### What is the Vault?
A shared treasury where guild members can pool money for events, rewards, and guild expenses!

### Vault Commands
- **Deposit money:** `/guild vault deposit <amount>`
- **Withdraw money:** `/guild vault withdraw <amount>` (requires permission)
- **Check balance:** `/guild vault balance`
- **View transactions:** `/guild vault` (shows recent activity)

### Vault Features
- **Daily withdrawal limits** (configurable by leader)
- **Permission-based access** (only Officers+ can withdraw by default)
- **Full transaction log** (see who deposited/withdrew what)
- **Safe and secure** (requires proper rank permissions)

### Vault Settings
Leaders can configure:
- Daily withdrawal limits
- Withdrawal permissions by rank
- Minimum balance requirements

---

## ⭐ Contribution Points & Shop

### What are Contribution Points?
Earn points by being an active guild member! Spend them in the exclusive guild shop.

### How to Earn Points

| Activity | Points Earned |
|----------|---------------|
| Play a game | 1 point |
| Wager $500 | 1 point |
| Donate $10,000 to treasury | 5 points |
| Failed heist | 10 points |
| Successful heist | 25 points |
| Complete weekly challenge | 50 points |

### View Your Points
- `/guild contributions` - See your points and how to earn more
- `/guild contributions @member` - Check another member's points

---

## 🏪 Guild Shop

### How to Use the Shop
- **Browse items:** `/guild shop [category]`
- **Buy an item:** `/guild shop buy <item>`
- **View inventory:** `/guild shop inventory`

### Shop Categories

#### 🚀 Boosts (Temporary Enhancements)

**XP Boosts:**
- **Personal XP Boost** (500 CP, 24h) - Your games give 2x guild XP
- **Guild XP Surge** (1000 CP, 12h) - ALL members get 1.5x guild XP

**Luck Boosts:**
- **Lucky Charm** (300 CP, 1h) - +5% win rate on all games
- **Lucky Streak** (800 CP, 6h) - +20% on all game winnings
- **High Roller Pass** (600 CP, 3h) - +10% on all game winnings
- **Jackpot Charm** (1200 CP, 24h) - +10% jackpot win chance

#### 🎨 Cosmetics (Permanent)

**Badges:**
- **Golden Guild Badge** (1000 CP) - 🏆 next to your name
- **Silver Guild Badge** (500 CP) - 🥈 next to your name
- **Bronze Guild Badge** (250 CP) - 🥉 next to your name

**Customization:**
- **Custom Title** (750 CP) - Set a custom title in your profile
- **Name Color: Gold** (1500 CP) - Golden name in guild displays
- **Name Color: Blue** (800 CP) - Blue name in guild displays
- **Name Color: Purple** (800 CP) - Purple name in guild displays

#### 💎 Consumables (Single-Use Items)

**Reset Tokens:**
- **Daily Reset Token** (200 CP) - Instantly reset `/daily` cooldown
- **Work Reset Token** (150 CP) - Instantly reset `/work` cooldown

**Bonus Multipliers:**
- **Fortune Cookie** (250 CP, 1 use) - Double your next daily bonus
- **Overtime Pass** (150 CP, 1 use) - Double your next work earnings

**Protection:**
- **Heist Insurance** (500 CP, 1 use) - Protect against next heist failure

### Using Items

**Reset Tokens:**
```
/use-reset-token daily  (Reset daily cooldown)
/use-reset-token work   (Reset work cooldown)
```

**Automatic Boosts:**
- XP boosts apply automatically to your games
- Winnings boosts apply automatically to your wins
- Fortune Cookie/Overtime Pass prompt you when available

---

## 🎮 Guild Events

### What are Guild Events?
Special limited-time events where guilds compete or cooperate for massive rewards!

### Event Types

#### 🐉 Boss Raid (Cooperative)
**Duration:** 48 hours
**Objective:** Defeat a powerful boss together

**How to Participate:**
- Play any casino game to deal damage to the boss
- Higher wagers = more damage
- All guilds work together

**Boss Types:**
1. 🎰 **Slot Demon** (Level 1) - 1,000,000 HP
2. 🃏 **Card Shark** (Level 2) - 1,500,000 HP
3. 🎲 **Dice Dragon** (Level 3) - 2,000,000 HP
4. 👑 **Jackpot King** (Level 4) - 3,000,000 HP
5. ☠️ **Roulette Reaper** (Level 5) - 5,000,000 HP

**Rewards:**
- Top 10 guilds share the reward pool
- 1st place: 30%, 2nd: 20%, 3rd: 15%, 4th-10th: split 35%
- Reward pool scales with boss level

**Damage Values:**
- Poker: 2,000 damage
- Crash: 1,800 damage
- Bingo: 1,600 damage
- Blackjack: 1,500 damage
- Horse Race: 1,400 damage
- Roulette: 1,200 damage
- HiLo: 1,100 damage
- Slots: 1,000 damage
- War: 900 damage
- Coinflip: 800 damage
- **PLUS:** 1 bonus damage per $100 wagered

#### 🎰 Casino Domination (Competitive)
**Duration:** 72 hours
**Objective:** Earn the highest total winnings

**How to Participate:**
- Win casino games - only wins count!
- Higher winnings = more points
- Real-time leaderboard

**Rewards:**
- Fixed $5,000,000 reward pool
- 1st: 35% ($1,750,000)
- 2nd: 25% ($1,250,000)
- 3rd: 18% ($900,000)
- 4th-10th: Smaller shares

#### 💰 Heist Festival (Bonus Weekend)
**Duration:** 48 hours (weekends)
**Objective:** Complete heists with special bonuses

**Active Bonuses:**
- 🔥 **2.0x Guild XP** for all heists
- 💎 **1.5x Winnings** on successful heists
- 🛡️ **50% Reduced** penalties on failed heists
- ⭐ **50 Contribution Points** per heist (vs normal 25/10)

**How to Participate:**
- Use `/heist` during the festival
- Enjoy boosted rewards and reduced penalties
- Compete for most heists completed

**Rewards:**
- 1st: $2,000,000
- 2nd: $1,500,000
- 3rd: $1,000,000
- 4th-10th: $250,000 - $750,000

### Event Commands

**View Active Events:**
```
/guild-events list
```

**View Specific Events:**
```
/guild-events boss-raid
/guild-events casino-domination
/guild-events heist-festival
```

**What You'll See:**
- Event status and time remaining
- Your guild's ranking
- Top guilds leaderboard
- Top contributors in your guild
- How to participate

### Event Notifications
When you play games during events, you'll see notifications like:
```
🎉 Guild Event Progress
🐉 Boss Raid: Dealt 2,500 damage! (Boss at 42.3% HP)
🎰 Casino Domination: Your guild has earned $2,450,000 total!
```

---

## 🏆 Leaderboard Rewards

### Weekly Rewards (Top 5 Guilds)
**Distributed:** Every Sunday at midnight (automatic)

| Rank | Money | Contribution Points | Badge |
|------|-------|---------------------|-------|
| 🥇 1st | $2,000,000 | 1,000 per member | ⭐ Weekly Star |
| 🥈 2nd | $1,500,000 | 750 per member | - |
| 🥉 3rd | $1,000,000 | 500 per member | - |
| 4th | $750,000 | 400 per member | - |
| 5th | $500,000 | 300 per member | - |

**Total Weekly Pool:** $5,750,000

### Season-End Rewards (Top 10 Guilds)
**Distributed:** At the end of each season

| Rank | Money | Contribution Points | Free Shop Item | Badge |
|------|-------|---------------------|----------------|-------|
| 🥇 1st | $10,000,000 | 5,000 per member | Guild XP Surge | 👑 Season Champion |
| 🥈 2nd | $7,500,000 | 3,500 per member | Personal XP Boost | 🥈 Season Runner-Up |
| 🥉 3rd | $5,000,000 | 2,500 per member | Lucky Charm | 🥉 Season Bronze |
| 4th | $3,000,000 | 1,500 per member | - | - |
| 5th | $2,000,000 | 1,000 per member | - | - |
| 6th | $1,500,000 | 750 per member | - | - |
| 7th | $1,250,000 | 600 per member | - | - |
| 8th | $1,000,000 | 500 per member | - | - |
| 9th | $750,000 | 400 per member | - | - |
| 10th | $500,000 | 300 per member | - | - |

**Total Season Pool:** $31,000,000

### How Rewards Work
- **Money** deposited directly to guild vault
- **Contribution Points** given to ALL guild members equally
- **Shop Items** given to all members (top 3 season only)
- **Badges** are permanent cosmetic rewards
- All rewards logged and viewable in history

### Leaderboard Commands

**View Top Guilds:**
```
/guild-leaderboard top [limit]
```
Shows top 10-25 guilds ranked by total XP

**View Your Guild's Rewards:**
```
/guild-leaderboard rewards
```
Shows:
- Current season ranking and pending rewards
- Current weekly ranking and pending rewards
- Last 5 rewards claimed

**View Reward Tiers:**
```
/guild-leaderboard reward-tiers
```
Shows complete reward tables for all ranks

---

## 📋 Commands Reference

### Core Guild Commands
```
/guild create <name> <tag>     - Create a new guild
/guild join <tag>               - Join an existing guild
/guild leave                    - Leave your current guild
/guild info [@member]           - View guild information
/guild invite @member           - Invite a player to your guild
/guild kick @member             - Remove a member from your guild
/guild edit <setting> <value>   - Edit guild settings
/guild disband                  - Delete your guild (leader only)
```

### Guild Feature Commands
```
/guild ranks                    - View all guild ranks
/guild vault                    - View guild vault info
/guild shop [category]          - Browse the guild shop
/guild contributions [@member]  - View contribution points
```

### Vault Commands
```
/guild-vault deposit <amount>   - Deposit money to vault
/guild-vault withdraw <amount>  - Withdraw money from vault
/guild-vault balance            - Check vault balance
```

### Rank Commands
```
/guild-rank assign @member <rank>  - Assign a rank to a member
/guild-rank list                   - List all ranks and permissions
/guild-rank view @member           - View a member's rank
```

### Shop Commands
```
/guild shop                     - Browse all shop items
/guild shop boosts              - Browse boost items only
/guild shop cosmetics           - Browse cosmetic items only
/guild shop consumables         - Browse consumable items only
/guild shop buy <item>          - Purchase a shop item
/guild shop inventory [@member] - View purchased items
```

### Item Usage Commands
```
/use-reset-token daily          - Use a daily reset token
/use-reset-token work           - Use a work reset token
```

### Event Commands
```
/guild-events list                  - View all active events
/guild-events boss-raid             - View boss raid status
/guild-events casino-domination     - View casino domination leaderboard
/guild-events heist-festival        - View heist festival info
```

### Leaderboard Commands
```
/guild-leaderboard top [limit]      - View top guilds (1-25)
/guild-leaderboard rewards          - View your pending rewards
/guild-leaderboard reward-tiers     - View all reward tiers
```

---

## 💡 Tips & Strategies

### Maximize Guild XP
1. **Play frequently** - Every game counts!
2. **Bet higher** - More wager = more XP
3. **Complete challenges** - 500 XP per weekly challenge
4. **Participate in heists** - 200 XP for successful heists
5. **Use XP boosts** - Buy Personal XP Boost or Guild XP Surge from shop

### Earn Contribution Points Fast
1. **Play many games** - Quantity matters (1 point per game)
2. **Wager big** - 1 point per $500 wagered
3. **Heist often** - 25-50 points per heist during festivals
4. **Complete weekly challenges** - 50 points each
5. **Donate strategically** - 5 points per $10,000 donated

### Climb the Leaderboard
1. **Stay active** - Consistent play beats sporadic bursts
2. **Recruit active members** - More members = more XP
3. **Coordinate events** - Focus on events with bonuses
4. **Use shop boosts** - XP multipliers give huge advantages
5. **Complete all challenges** - 500 XP per challenge adds up

### Smart Shop Purchases
**Early Game (0-500 CP):**
- Bronze Badge (250 CP) - Show off your guild pride
- Fortune Cookie (250 CP) - Double daily bonus

**Mid Game (500-1000 CP):**
- Personal XP Boost (500 CP) - Grind levels faster
- Silver Badge (500 CP) - Better cosmetic
- Lucky Streak (800 CP) - Increase winnings

**Late Game (1000+ CP):**
- Guild XP Surge (1000 CP) - Boost entire guild
- Golden Badge (1000 CP) - Top tier cosmetic
- Jackpot Charm (1200 CP) - Better jackpot chances
- Name Color: Gold (1500 CP) - Ultimate prestige

### Guild Leadership Tips
1. **Set clear rules** - Use guild description
2. **Manage ranks properly** - Don't give everyone Officer
3. **Monitor vault** - Set withdrawal limits
4. **Coordinate events** - Tell members about active events
5. **Reward active members** - Promote helpful players
6. **Stay organized** - Kick inactive members

---

## 🎉 Quick Start Guide

### For New Guild Leaders
1. Create your guild: `/guild create MyGuild MYTAG`
2. Invite friends: `/guild invite @friend`
3. Set guild description: `/guild edit description Welcome to our guild!`
4. Configure vault limits: Set daily withdrawal limits
5. Start earning XP: Play games, wager money, complete challenges
6. Watch your guild grow!

### For New Guild Members
1. Join a guild: `/guild join MYTAG` or accept an invite
2. Check guild info: `/guild info`
3. Start earning XP: Every game you play helps!
4. Earn contribution points: Play actively to earn shop currency
5. Browse the shop: `/guild shop` to see what you can buy
6. Participate in events: Use `/guild-events list` to see active events

### First Week Goals
- [ ] Reach Level 2 (10,000 XP)
- [ ] Earn your first 250 contribution points
- [ ] Buy your first shop item (Bronze Badge)
- [ ] Participate in an event (if active)
- [ ] Complete a weekly challenge
- [ ] Donate to guild vault

---

## ❓ Frequently Asked Questions

**Q: How many guilds can I join?**
A: You can only be in one guild at a time.

**Q: Can I change my guild tag after creation?**
A: No, guild tags are permanent. Choose wisely!

**Q: Do contribution points reset?**
A: No, contribution points never reset. Save them up!

**Q: When do shop items expire?**
A: Boosts expire after their duration (1-24 hours). Cosmetics are permanent. Consumables last until used.

**Q: Can I trade contribution points?**
A: No, contribution points are tied to your account and can't be transferred.

**Q: What happens to my items if I leave the guild?**
A: You keep all your shop items and contribution points! They transfer with you.

**Q: How often are weekly rewards distributed?**
A: Every Sunday at midnight, automatically.

**Q: Can I see event history?**
A: Yes, past events are logged. Future updates may add event history viewing.

**Q: What counts as "playing a game" for XP?**
A: Any command that wagers money: `/slots`, `/blackjack`, `/roulette`, `/poker`, etc.

**Q: Can guild leaders see contribution points of all members?**
A: Yes, leaders and officers can view any member's contribution points.

**Q: Do I earn XP for losses?**
A: Yes! You earn base XP for playing, plus bonus XP if you win.

**Q: Can guilds merge?**
A: Not currently. Members would need to leave one guild and join another.

**Q: Is there a guild level cap?**
A: Yes, maximum level is 20.

**Q: What happens when guild is disbanded?**
A: All members are removed, vault is emptied (distributed to leader), and the guild is deleted permanently.

---

## 🚀 What's Next?

This is just the beginning! Future updates may include:
- Guild vs Guild tournaments
- Territory control system
- More boss types and event varieties
- Custom guild emblems
- Guild housing/hideouts
- Cross-season achievements
- And much more!

---

## 📞 Need Help?

- **Check your guild info:** `/guild info`
- **View command help:** Use `/help guild`
- **Ask your guild leader:** They might have tips!
- **Report bugs:** Contact the bot administrators

---

**Good luck, and may your guild rise to the top of the leaderboards!** 🏆

*— The CasinoBot Team*

---

**Version:** Guild System 1.0
**Last Updated:** November 2025
**Total Features:** 11 major systems, 30+ commands, 18 shop items, 3 event types
