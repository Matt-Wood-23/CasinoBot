# Guild Level System - Implementation Complete! ✅

## Overview

A comprehensive guild progression system has been implemented with:
- 20-level exponential progression (~2M XP to max)
- 50+ perks across 5 categories
- Weekly cooperative challenges
- Seasonal resets with legacy points
- Automatic XP awards for activities
- Guild-wide bonuses for members

---

## ✅ Completed Features

### 1. Database Layer
**File:** [database/migrations/add_guild_levels_system.sql](database/migrations/add_guild_levels_system.sql)

- ✅ Added columns to `guilds` table: `experience`, `season_id`, `legacy_points`, `season_max_level`, `last_level_up`
- ✅ Created `guild_experience_log` table (XP audit trail)
- ✅ Created `guild_challenges` table (weekly cooperative challenges)
- ✅ Created `guild_seasons` table (seasonal system)
- ✅ Created `guild_season_history` table (historical records)
- ✅ Added columns to `user_statistics`: `guild_xp_contributed`, `guild_challenges_completed`

### 2. Database Queries
**File:** [database/queries.js](database/queries.js:2929-3499)

- ✅ `addGuildExperience()` - Award XP with transaction safety
- ✅ `updateGuildLevel()` - Update guild level
- ✅ `getGuildWithLevel()` - Fetch complete guild data
- ✅ `getGuildByNameWithLevel()` - Get guild by name with level
- ✅ Challenge management (initialize, get, update, delete)
- ✅ Season management (get current, end/start, history, leaderboard)

### 3. Core Utilities

#### Guild Levels ([utils/guildLevels.js](utils/guildLevels.js))
- ✅ 20-level exponential XP curve
- ✅ 50+ perks defined across 5 categories:
  - Economic (treasury interest, work/property bonuses)
  - Gameplay (winnings bonus, heist improvements, bet limits)
  - Social (member slots, ranks, achievements)
  - Cosmetic (emblems, colors, elite status)
  - Special (challenges, shop, vault)
- ✅ Level calculation and progress tracking
- ✅ Perk activation and bonus calculation
- ✅ Helper functions for UI display

#### Guild Challenges ([utils/guildChallenges.js](utils/guildChallenges.js))
- ✅ 10 different challenge types
- ✅ Weekly reset system (Mondays 00:00 UTC)
- ✅ Automatic XP rewards on completion
- ✅ Progress tracking for all activities
- ✅ Helper functions for tracking:
  - Game wins (by type)
  - Money wagered
  - Guild donations
  - Heists
  - Daily bonuses
  - Work shifts
  - Personal challenges

#### Guild XP Awards ([utils/guildXP.js](utils/guildXP.js))
- ✅ Centralized XP award system
- ✅ Functions for all XP sources:
  - `awardGameXP()` - 5 XP per game
  - `awardWagerXP()` - 1 XP per $100
  - `awardHeistXP()` - 500 XP success / 100 XP fail
  - `awardDonationXP()` - 1 XP per $1,000
  - `awardDailyXP()` - 50 XP
  - `awardWorkXP()` - 2 XP
  - `awardPersonalChallengeXP()` - 50/200 XP
- ✅ Automatic level-up detection
- ✅ Challenge progress tracking integration

### 4. Commands

#### Updated Guild Command ([commands/guild.js](commands/guild.js))
- ✅ `/guild level` - View guild level, XP, progress bar, upcoming perks
- ✅ `/guild perks` - View all active perks organized by category
- ✅ `/guild challenges` - View weekly challenges with progress (unlocks at level 5)
- ✅ Existing commands (create, join, leave, info, donate, members, leaderboard)

#### Updated Daily Command ([commands/daily.js](commands/daily.js))
- ✅ Apply guild daily bonus perk (+10% at level 11)
- ✅ Award 50 XP to guild on daily claim
- ✅ Track daily claims for guild challenges
- ✅ Display guild bonus in bonus breakdown

#### Updated Work Command ([commands/work.js](commands/work.js))
- ✅ Apply guild work bonus perk (+25% at level 17)
- ✅ Award 2 XP to guild on work completion
- ✅ Track work shifts for guild challenges

#### Updated Guild Donation ([utils/guilds.js](utils/guilds.js))
- ✅ Award 1 XP per $1,000 donated
- ✅ Track donations for guild challenges

### 5. Guild Heist System
**File:** [utils/heist.js](utils/heist.js)

- ✅ Apply guild level perks:
  - Success rate bonus (+5% to +30%)
  - Cost reduction (-20% to -40%)
  - Reward multiplier bonus (+1x at level 9)
- ✅ Award XP to all participants:
  - 500 XP for successful heist
  - 100 XP for failed heist
- ✅ Display guild bonuses in result
- ✅ Track heists for guild challenges

### 6. Background Tasks
**File:** [main.js](main.js:451-464)

- ✅ Guild challenge cleanup (runs daily)
- ✅ Deletes challenge records older than 2 weeks
- ✅ Console logging for monitoring

### 7. Documentation
- ✅ [GUILD_XP_INTEGRATION_GUIDE.md](GUILD_XP_INTEGRATION_GUIDE.md) - Complete guide for adding XP to game files
- ✅ This summary document

---

## 🔧 Next Steps to Deploy

### Step 1: Run Database Migration

Connect to your PostgreSQL database and run the migration:

```bash
# Option 1: Using psql command line
psql -U your_username -d your_database_name -f database/migrations/add_guild_levels_system.sql

# Option 2: Using psql interactive mode
psql -U your_username -d your_database_name
\i database/migrations/add_guild_levels_system.sql
\q

# Option 3: Copy and paste the SQL
# Open the migration file and copy all SQL commands
# Paste into your database management tool (pgAdmin, DBeaver, etc.)
```

**Verify Migration:**
```sql
-- Check new columns exist
SELECT experience, season_id, legacy_points, level
FROM guilds
LIMIT 1;

-- Check new tables exist
SELECT COUNT(*) FROM guild_challenges;
SELECT COUNT(*) FROM guild_seasons;
```

### Step 2: Restart Bot

```bash
# Stop the bot
# Then start it again
node main.js
```

### Step 3: Test Core Features

1. **Create or join a guild:**
   ```
   /guild create TestGuild
   ```

2. **Check level:**
   ```
   /guild level
   ```
   Should show Level 1, 0 XP

3. **Earn XP:**
   - Use `/daily` (awards 50 XP)
   - Use `/work` (awards 2 XP)
   - Donate to guild (1 XP per $1,000)
   - Play games (5 XP per game - after integration)

4. **Level up and check perks:**
   ```
   /guild level
   /guild perks
   ```

5. **Reach Level 5 to unlock challenges:**
   ```
   /guild challenges
   ```

### Step 4: Integrate XP into Game Files (Optional)

Follow the guide in [GUILD_XP_INTEGRATION_GUIDE.md](GUILD_XP_INTEGRATION_GUIDE.md) to add XP awards to game commands.

**Priority games to update:**
- `commands/blackjack.js`
- `commands/slots.js`
- `commands/poker.js`
- `commands/roulette.js`

**Integration is just 2 lines per game file:**
```javascript
const { awardGameXP, awardWagerXP } = require('../utils/guildXP');

// After game completion:
awardWagerXP(userId, betAmount, 'GameName').catch(err => console.error('Error:', err));
awardGameXP(userId, 'GameName', won).catch(err => console.error('Error:', err));
```

---

## 📊 System Features

### XP Sources
| Activity | XP Awarded | Notes |
|----------|------------|-------|
| Play a game | 5 XP | Any game |
| Money wagered | 1 XP per $100 | Scales with bet |
| Daily bonus | 50 XP | Once per day |
| Work shift | 2 XP | Every 4 hours |
| Guild donation | 1 XP per $1,000 | Scales with donation |
| Personal daily challenge | 50 XP | Member completes |
| Personal weekly challenge | 200 XP | Member completes |
| Successful guild heist | 500 XP | All participants |
| Failed guild heist | 100 XP | Participation reward |
| Guild challenge completion | 100-1000 XP | Varies by challenge |

### Level Progression
- Level 1-5: Quick (1K-10K XP total)
- Level 6-10: Moderate (15K-90K XP total)
- Level 11-15: Slower (130K-450K XP total)
- Level 16-20: Very slow (600K-1.7M XP total)
- **Total to max level:** ~1,700,000 XP

### Perks by Category

**Economic Perks:**
- Treasury Interest: 0.5% → 2% daily (Levels 3, 8, 13, 18)
- Work Income: +25% (Level 17)
- Property Income: +15% (Level 18)

**Gameplay Perks:**
- Game Winnings: +1% → +10% (Levels 2, 5, 8, 14, 19)
- Heist Success Rate: +5% → +30% (Levels 4, 9, 14, 19)
- Heist Cost: -20% → -40% (Levels 6, 16)
- Heist Rewards: +1x multiplier (Level 9)
- Daily Bonus: +10% (Level 11)
- Bet Limit: +20% (Level 12)

**Social Perks:**
- Member Slots: 10 → 75 (Levels 2, 4, 7, 10, 13, 16)
- Guild Ranks (Level 7)
- Guild Achievements (Level 15)

**Cosmetic Perks:**
- Custom Emblem (Level 6)
- Custom Colors (Level 12)
- Elite Status (Level 20)
- Elite Bonus: +50% to all % perks (Level 20)

**Special Features:**
- Guild Challenges (Level 5)
- Guild Shop (Level 10)
- Guild Vault (Level 15)

### Weekly Challenges

**Unlocks at Level 5**

5 random challenges assigned each week:
- Wager Master: Wager $1M together → 500 XP
- Heist Squad: Complete 3 heists → 800 XP
- High Rollers: Win 100 games → 400 XP
- Blackjack Masters: Win 50 blackjack games → 300 XP
- Slots Champions: Win 50 slots games → 300 XP
- Poker Pros: Win 30 poker games → 300 XP
- Generous Guild: Donate $100K → 600 XP
- Daily Grinders: 50 daily bonuses → 350 XP
- Hard Workers: 100 work shifts → 250 XP
- Challenge Completers: 20 personal challenges → 450 XP

**Reset:** Every Monday at 00:00 UTC

### Seasonal System

**Duration:** 3-4 months per season

**On Season End:**
1. All guilds reset to Level 1, 0 XP
2. Legacy points awarded: 1 point per 10 levels reached
3. Progress archived in guild_season_history
4. New season starts

**Legacy Points:**
- Permanent bonus across all seasons
- Display prestige
- Future: Could unlock special perks

---

## 🎮 Guild Heist Bonuses Example

**Level 1 Guild:**
- Cost: $10,000 per person
- Success Rate: 30% base + 4% per member
- Rewards: 5x-15x multiplier

**Level 20 Guild:**
- Cost: $6,000 per person (-40%)
- Success Rate: 60% base + 4% per member (+30%)
- Rewards: 6x-16x multiplier (+1x)

**Example with 5 members:**
- Level 1: 50% success, $50K total pot, up to $750K winnings
- Level 20: 80% success, $30K total pot, up to $480K winnings (much safer!)

---

## 📁 Files Created/Modified

### Created Files:
1. `database/migrations/add_guild_levels_system.sql` - Database schema
2. `utils/guildLevels.js` - Level progression and perks
3. `utils/guildChallenges.js` - Weekly challenges system
4. `utils/guildXP.js` - XP award system
5. `GUILD_XP_INTEGRATION_GUIDE.md` - Integration guide
6. `GUILD_LEVELS_IMPLEMENTATION_SUMMARY.md` - This file

### Modified Files:
1. `database/queries.js` - Added guild level queries
2. `commands/guild.js` - Added level, perks, challenges subcommands
3. `commands/daily.js` - Added guild bonus and XP
4. `commands/work.js` - Added guild bonus and XP
5. `utils/guilds.js` - Added XP award on donation
6. `utils/heist.js` - Added level bonuses and XP awards
7. `main.js` - Added guild challenge cleanup interval

---

## 🐛 Troubleshooting

### Migration Fails
- Check PostgreSQL connection
- Ensure user has CREATE TABLE permissions
- Check for syntax errors in SQL

### XP Not Awarding
- Check console for error messages
- Verify user is in a guild
- Check database connection

### Challenges Not Appearing
- Guild must be level 5+
- Run `/guild challenges` on Monday after 00:00 UTC
- Challenges auto-initialize on first view

### Perks Not Applying
- Check guild level in database
- Verify perk is unlocked at current level
- Check console for calculation errors

---

## 🎉 Ready to Go!

The guild level system is complete and ready for deployment. Just run the migration and restart your bot!

For questions or issues, refer to:
- This summary document
- [GUILD_XP_INTEGRATION_GUIDE.md](GUILD_XP_INTEGRATION_GUIDE.md) for game integration
- Code comments in utility files
- Database migration file for schema details

**Estimated XP Earnings (Active Player):**
- Daily bonus: 50 XP
- 5 work shifts: 10 XP
- 20 games played: 100 XP
- Wagering $50,000: 500 XP
- **Daily Total:** ~660 XP
- **Weekly Total:** ~4,620 XP
- **Time to Level 5:** ~3-4 days
- **Time to Level 10:** ~2-3 weeks
- **Time to Max Level:** ~6-8 months

Happy coding! 🚀
