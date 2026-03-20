# Database Queries Refactoring Analysis

## Current State
- **File:** `database/queries.js`
- **Size:** 4,316 lines
- **Functions:** ~135 functions defined, ~150 exported
- **Problem:** Single massive file handling ALL database operations

## What We'd Gain from Refactoring

### 1. **Developer Experience** 🧑‍💻
- **Find things faster:** Instead of scrolling through 4,316 lines, jump straight to `queries/guilds.js` for guild operations
- **Easier onboarding:** New developers can understand one domain at a time
- **Better IDE performance:** Smaller files = faster autocomplete and search

### 2. **Maintainability** 🔧
- **Reduced merge conflicts:** Multiple developers can work on different domains (guilds, economy, etc.) without conflicts
- **Easier testing:** Can test each domain independently
- **Clear responsibilities:** Each file has one clear purpose

### 3. **Code Organization** 📂
- **Related functions grouped:** All loan functions together, all guild functions together
- **Easier to spot duplicate code:** When all user functions are in one file, you can see if you're doing things twice
- **Better documentation:** Can document each domain's database schema and patterns

### 4. **Safety & Understanding** 🛡️
- **Reduce accidental changes:** Editing guild code won't risk breaking loans
- **Easier code reviews:** Reviewers can focus on one domain at a time
- **Transaction boundaries clearer:** Can see which operations need to be atomic per domain

## Proposed Split Structure

Based on the actual exports in your file, here's how we'd split it:

### **users.js** (~800 lines)
Core user data operations:
- `getUserMoney`, `setUserMoney`
- `getUserData`, `getAllUserData`, `loadUserData`, `saveUserData`
- `canClaimDaily`, `setLastDaily`, `setLastWork`, `getTimeUntilNextDaily`
- `updateUserGifts`, `cleanUserData`
- `getPendingNotifications`, `storeBoostNotification`
- `snakeToCamel`, `convertKeysToCamelCase` (utility functions)

**Why separate:** Core user operations used by almost everything else

---

### **games.js** (~400 lines)
Game-related database operations:
- `recordGameResult` - Main function for recording game outcomes
- `getServerJackpot`, `addToJackpot`, `resetJackpot` - Progressive jackpot
- `isGamblingBanned`, `getGamblingBanTime`, `setGamblingBan`, `clearGamblingBan`

**Why separate:** Game results and jackpots are a distinct concern

---

### **economy.js** (~700 lines)
Loans and credit system:
- `getActiveLoan`, `createLoanDB`, `updateLoanPayment`, `markLoanRepaid`
- `updateCreditScore`, `getCreditScore`
- `updateOverdueLoan`, `getOverdueLoans`

**Why separate:** Complex loan/credit logic with its own business rules

---

### **shop.js** (~500 lines)
Inventory, boosts, and properties:
- `addToInventory`, `removeFromInventory`, `getUserInventory`
- `addBoost`, `hasActiveBoost`, `getActiveBoost`, `consumeBoost`, `getUserBoosts`
- `purchasePropertyDB`, `getUserPropertiesDB`, `upgradePropertyDB`
- `updatePropertyCollectionTime`, `getPropertyLastCollected`

**Why separate:** Shop/economy items are a complete subsystem

---

### **vip.js** (~200 lines)
VIP membership system:
- `purchaseVIPDB`, `getUserVIPDB`
- `claimVIPWeeklyBonusDB`, `expireVIPsDB`

**Why separate:** Small, self-contained feature

---

### **achievements.js** (~400 lines)
Achievement tracking:
- `unlockAchievementDB`, `hasAchievementDB`, `getUserAchievementsDB`
- `getAchievementProgressDB`
- `updateWinStreakDB`, `incrementWorkShiftsDB`, `updateLoanProgressDB`

**Why separate:** Achievement progression is distinct from other systems

---

### **challenges.js** (~300 lines)
Daily/weekly challenges:
- `getUserChallengesDB`, `createChallengeDB`
- `updateChallengeProgressDB`, `markChallengeCompletedDB`, `markChallengeClaimedDB`
- `deleteChallengesDB`, `hasActiveChallengesDB`, `getLastResetTimeDB`

**Why separate:** Time-based challenge system with its own lifecycle

---

### **guilds.js** (~1,400 lines) ⚠️ LARGE
Guild system (might need sub-splitting):
- **Core Guild:** `getGuildByName`, `createGuildDB`, `joinGuildDB`, `leaveGuildDB`, `getGuildMembers`
- **Guild Levels:** `addGuildExperience`, `updateGuildLevel`, `getGuildWithLevel`
- **Guild Challenges:** `initializeGuildChallenges`, `getGuildChallenges`, `updateGuildChallengeProgress`
- **Guild Seasons:** `getCurrentSeason`, `endSeasonAndStartNew`, `getGuildSeasonHistory`, `getGuildLeaderboard`
- **Guild Ranks:** `createGuildRank`, `deleteGuildRank`, `updateGuildRankPermissions`, etc.
- **Guild Vault:** `getGuildVaultBalance`, `depositToVault`, `withdrawFromVault`, `getVaultLogs`
- **Guild Shop:** `addContributionPoints`, `getContributionPoints`, `purchaseShopItem`
- **Guild Events:** `createGuildEvent`, `getActiveGuildEvents`, `joinGuildEvent`, `completeGuildEvent`
- **Leaderboard Rewards:** `distributeSeasonRewards`, `distributeWeeklyRewards`

**Why separate:** Guild system is your most complex feature
**Note:** This might be split further into guilds/core.js, guilds/events.js, guilds/vault.js, etc.

---

### **heists.js** (~300 lines)
Heist-specific operations:
- `getUserHeistStats`, `updateHeistCooldown`, `recordHeistAttempt`
- `getHeistDebt`, `addHeistDebt`, `payHeistDebt`
- `getGuildHeistStats`, `updateGuildHeistCooldown`, `recordGuildHeistAttempt`
- `getAllUserHeistStats`

**Why separate:** Heists are a major feature with debt tracking

---

### **streaks.js** (~100 lines)
Login streak tracking:
- `getLoginStreak`, `updateLoginStreak`
- `getStreakMultiplier`, `getNextStreakMilestone`

**Why separate:** Small, self-contained feature

---

## The Downsides ⚠️

Let's be honest about potential issues:

### 1. **More Imports**
**Before:**
```javascript
const { getUserMoney, setUserMoney, recordGameResult } = require('../database/queries');
```

**After:**
```javascript
const { getUserMoney, setUserMoney } = require('../database/queries/users');
const { recordGameResult } = require('../database/queries/games');
```

**Solution:** We can still use a main export file like we did with embeds:
```javascript
// database/queries.js becomes a re-export file
module.exports = {
    ...require('./queries/users'),
    ...require('./queries/games'),
    ...require('./queries/economy'),
    // etc.
};
```
So imports stay the same: `require('../database/queries')`

### 2. **Shared Connection**
All these functions use the database connection. We need to ensure they all import it correctly.

### 3. **Time Investment**
With 135 functions across ~4,300 lines, this will take 3-4 hours to do carefully.

### 4. **Testing Burden**
We'd want to test database operations after refactoring since this is critical infrastructure.

---

## Recommendation 💭

### Option A: **Do Full Refactoring** ✅
- **Pros:** Matches phases 1 & 2, massive long-term benefit, guild system becomes manageable
- **Cons:** 3-4 hours of work, need testing
- **Best if:** You plan to actively develop guild features, onboard others, or work on this long-term

### Option B: **Partial Refactoring** (Just split out guilds)
- **Pros:** Biggest impact (1,400 lines → separate file), faster (1-2 hours)
- **Cons:** Other code still messy
- **Best if:** Guild code is your main pain point

### Option C: **Skip It** ⏭️
- **Pros:** Can commit phases 1 & 2 now and be done
- **Cons:** Miss out on organizing your most complex code
- **Best if:** Database code rarely changes, or you're happy with current state

---

## My Honest Take

**The guild system (1,400 lines!) would benefit the most.** If you're actively developing guild features, splitting that out alone would be huge. The rest is less urgent.

**If you do it:** Use the same re-export pattern as embeds so imports don't break.

**Question to consider:** How often do you modify database queries? If rarely, maybe skip it. If often (especially guilds), definitely worth it.

What's your gut feeling?
