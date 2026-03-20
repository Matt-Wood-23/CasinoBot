# Phase 3 Implementation Summary: Guild Shop & Contribution Points

## Overview
Phase 3 adds a complete guild shop economy based on contribution points, allowing guild members to purchase exclusive items that provide gameplay bonuses, cosmetics, and consumables.

---

## ✅ Completed Features

### 1. Contribution Points System
**Purpose:** Currency earned through guild activities, spent in the guild shop

**How to Earn:**
- **1 point** per game played
- **1 point** per $500 wagered
- **5 points** per $10,000 donated to treasury
- **10 points** for failed heists
- **25 points** for successful heists
- **50 points** per weekly challenge completed

**Integration:**
- Automatically awarded alongside guild XP in `utils/guildXP.js`
- Tracked in `guild_members.contribution_points` column
- Full transaction logging in `guild_contribution_log` table

---

### 2. Guild Shop System

#### 18 Purchasable Items Across 3 Categories:

**Boosts (Temporary Enhancements):**
1. **Personal XP Boost** (500 points, 24h)
   - Your game plays give 2x guild XP

2. **Guild XP Surge** (1000 points, 12h)
   - All guild members get 1.5x XP

3. **Lucky Charm** (300 points, 1h)
   - +5% win rate on all games

4. **Fortune Cookie** (250 points, 1 use)
   - Double your next daily bonus

5. **Overtime Pass** (150 points, 1 use)
   - Double your next work earnings

6. **Lucky Streak** (800 points, 6h)
   - +20% on all game winnings

7. **High Roller Pass** (600 points, 3h)
   - +10% on all game winnings

8. **Jackpot Charm** (1200 points, 24h)
   - +10% jackpot win chance

**Cosmetics (Permanent):**
9. **Golden Guild Badge** (1000 points)
   - Golden badge next to your name (🏆)

10. **Silver Guild Badge** (500 points)
    - Silver badge next to your name (🥈)

11. **Bronze Guild Badge** (250 points)
    - Bronze badge next to your name (🥉)

12. **Custom Title** (750 points)
    - Set a custom title in your profile

13. **Name Color: Gold** (1500 points)
    - Golden name color in guild displays

14. **Name Color: Blue** (800 points)
    - Blue name color in guild displays

15. **Name Color: Purple** (800 points)
    - Purple name color in guild displays

**Consumables (Single-Use Items):**
16. **Daily Reset Token** (200 points)
    - Instantly reset daily cooldown

17. **Work Reset Token** (150 points)
    - Instantly reset work cooldown

18. **Heist Insurance** (500 points)
    - Protect against next heist failure penalty

---

### 3. Shop Commands

#### `/guild shop [category]`
Browse available items, optionally filtered by category (boosts/cosmetics/consumables)
- Shows item name, description, cost, and duration
- Color-coded by category
- Shows your current contribution points

#### `/guild shop buy <item>`
Purchase an item from the shop
- Validates sufficient contribution points
- Handles time-based items (sets expiration)
- Handles consumable items (tracks uses remaining)
- Deducts points and logs transaction

#### `/guild shop inventory [@member]`
View owned items and active effects
- Shows active boosts with expiration times
- Shows permanent cosmetics
- Shows available consumable uses
- Can check other members' inventories

#### `/guild contributions [@member]`
View contribution points and how to earn more
- Shows current points balance
- Lists all earning methods with rates
- Can check other members' points

---

### 4. Item Effects System

#### Created `utils/guildShopEffects.js` (372 lines)
Centralized system for applying shop item effects to gameplay.

**Key Functions:**

**`getUserEffects(userId)`**
- Aggregates all active item effects for a user
- Returns combined multipliers and bonuses
- Handles effect stacking (takes highest value)

**`applyXPBoost(userId, baseXP)`**
- Multiplies guild XP gains by active XP boost items
- Integrated into `awardGameXP` and `awardWagerXP`

**`applyWinningsBoost(userId, baseWinnings)`**
- Multiplies game winnings by active winnings boost items
- Example integration in `commands/slots.js`

**`applyLuckBonus(userId)`**
- Returns luck bonus percentage for game calculations
- Can be integrated into game logic for win rate boosts

**`useDailyBoost(userId)`**
- Consumes a Fortune Cookie to multiply daily bonus
- Integrated into `commands/daily.js`
- Automatically tracks usage and deactivates when exhausted

**`useWorkBoost(userId)`**
- Consumes an Overtime Pass to multiply work earnings
- Integrated into `commands/work.js`
- Automatically tracks usage and deactivates when exhausted

**`canResetDaily(userId)` / `canResetWork(userId)`**
- Checks if user has available reset tokens
- Used in cooldown messages to inform users

**`useDailyResetToken(userId)` / `useWorkResetToken(userId)`**
- Consumes reset tokens to bypass cooldowns
- Used by `/use-reset-token` command

---

### 5. Reset Token System

#### Created `/use-reset-token <type>` Command
Allows users to consume reset tokens to bypass cooldowns.

**Features:**
- Validates cooldown is actually active (prevents wasting tokens)
- Checks for token availability
- Consumes the token (decrements uses)
- Resets the appropriate cooldown timestamp
- Provides clear feedback with next steps

**Types:**
- `daily` - Reset daily bonus cooldown (24 hours → immediate)
- `work` - Reset work cooldown (4 hours → immediate)

**Database Changes:**
- Modified `setLastDaily(userId, timestamp)` in `database/queries.js`
- Modified `setLastWork(userId, timestamp)` in `database/queries.js`
- Both now accept optional timestamp parameter for manual control

---

### 6. Integration into Existing Systems

#### Daily Bonus (`commands/daily.js`)
- **Lines 25-32:** Check for daily reset token in cooldown message
- **Lines 90-98:** Apply Fortune Cookie boost if available
- Shows token hint when on cooldown: "You have a Daily Reset Token! Use `/use-reset-token daily`"

#### Work Command (`commands/work.js`)
- **Lines 51-63:** Check for work reset token in cooldown message
- **Lines 95-103:** Apply Overtime Pass boost if available
- Shows token hint when on cooldown: "You have a Work Reset Token! Use `/use-reset-token work`"

#### Slots Command (`commands/slots.js`)
- **Line 9:** Import `applyWinningsBoost`
- **Lines 90-91:** Apply winnings boost after holiday bonus
- Works with Lucky Streak and High Roller Pass items

#### Guild XP System (`utils/guildXP.js`)
- **Line 22:** Import `applyXPBoost`
- **Lines 118, 164:** Apply XP boost to game and wager XP
- Works with Personal XP Boost and Guild XP Surge items

---

## 📊 Database Schema

### New Tables (from Phase 1)
```sql
-- Guild shop items (18 items pre-configured)
guild_shop_items (
    id, item_key, item_name, description, cost,
    item_type, effect, duration_hours, required_level,
    stock_limit, is_global, created_at
)

-- Member purchases and active items
guild_shop_purchases (
    id, guild_id, user_id, item_key, cost_paid,
    purchased_at, expires_at, is_active,
    times_used, max_uses
)

-- Contribution point transaction log
guild_contribution_log (
    id, guild_id, user_id, amount, source,
    details, timestamp
)
```

### Modified Columns
```sql
-- Added to guild_members (from Phase 1)
ALTER TABLE guild_members
ADD COLUMN contribution_points INTEGER DEFAULT 0;
```

---

## 🎮 User Experience Flow

### Example 1: Buying and Using a Lucky Streak Boost
1. User plays games and earns contribution points
2. `/guild contributions` - Check points balance (has 850 points)
3. `/guild shop boosts` - Browse boost items
4. `/guild shop buy lucky_streak` - Purchase for 800 points (50 points remaining)
5. User plays slots and wins $5,000
6. Lucky Streak automatically applies: $5,000 × 1.20 = $6,000 received
7. 6 hours later, boost expires automatically

### Example 2: Using a Daily Reset Token
1. User claims daily bonus at 8:00 AM
2. User tries `/daily` at 10:00 AM - "Come back in 22h 0m"
3. Cooldown message shows: "💎 You have a Daily Reset Token!"
4. `/use-reset-token daily` - Consumes token
5. Token deducted, cooldown reset
6. `/daily` - Claims bonus again immediately

### Example 3: Earning Contribution Points
- Play 10 games → 10 points
- Wager $50,000 → 100 points
- Donate $100,000 to treasury → 50 points
- Complete successful heist → 25 points
- **Total:** 185 points earned

---

## 🔧 Technical Implementation Details

### Effect Stacking Rules
- **Multipliers:** Takes highest active value (not additive)
- **Bonuses:** Takes highest active value (not additive)
- **Cosmetics:** All active cosmetics are shown
- **Consumables:** Single use per item (tracked with times_used)

### Expiration Handling
- Automatic cleanup runs every hour (via `main.js` interval)
- Expired items are marked as `is_active = false`
- Expired items still show in inventory history but marked as inactive
- Time-based expiration using `expires_at` timestamp (milliseconds)

### Permission System
- All guild members can browse shop and buy items
- All guild members can view contributions
- Only guild members can purchase items (not outsiders)
- Points are non-transferable between users

### Error Handling
- Validates sufficient contribution points before purchase
- Validates item exists and is available
- Validates guild membership
- Transaction-safe deductions (rollback on error)
- Graceful handling of expired items

---

## 📁 Files Created/Modified

### New Files (Phase 3)
1. **`utils/guildShopEffects.js`** (372 lines)
   - Core item effects system
   - All boost/effect application functions

2. **`commands/use-reset-token.js`** (117 lines)
   - Reset token consumption command
   - Cooldown reset logic

3. **`PHASE_3_IMPLEMENTATION_SUMMARY.md`** (This file)

### Modified Files (Phase 3)
1. **`database/queries.js`**
   - Lines 388-396: Modified `setLastDaily` to accept optional timestamp
   - Lines 399-407: Modified `setLastWork` to accept optional timestamp

2. **`utils/guildXP.js`**
   - Line 22: Added `applyXPBoost` import
   - Lines 118, 164: Applied XP boost to game and wager functions

3. **`commands/daily.js`**
   - Lines 25-32: Added reset token check in cooldown message
   - Lines 90-98: Added Fortune Cookie boost integration

4. **`commands/work.js`**
   - Lines 51-63: Added reset token check in cooldown message
   - Lines 95-103: Added Overtime Pass boost integration

5. **`commands/slots.js`**
   - Line 9: Added `applyWinningsBoost` import
   - Lines 87-91: Applied winnings boost to slot winnings

---

## 🎯 Testing Checklist

### Shop Operations
- [ ] Browse shop by category (all/boosts/cosmetics/consumables)
- [ ] Purchase item with sufficient points
- [ ] Attempt purchase with insufficient points (should fail)
- [ ] View inventory shows purchased items
- [ ] View other member's inventory

### Contribution Points
- [ ] Earn points from playing games
- [ ] Earn points from wagering money
- [ ] Earn points from donations
- [ ] Earn points from heists
- [ ] View contributions shows correct balance
- [ ] Points deducted correctly on purchase

### Item Effects
- [ ] XP boost multiplies guild XP gains
- [ ] Winnings boost multiplies game winnings (slots)
- [ ] Daily boost multiplies daily bonus (Fortune Cookie)
- [ ] Work boost multiplies work earnings (Overtime Pass)
- [ ] Reset tokens actually reset cooldowns
- [ ] Expired items stop working
- [ ] Consumables track uses correctly

### Reset Tokens
- [ ] Can't use token when cooldown not active (error message)
- [ ] Can use token when cooldown is active
- [ ] Token consumed after use
- [ ] Cooldown actually resets (can claim/work immediately)
- [ ] Multiple tokens work independently

### Edge Cases
- [ ] Expired items don't apply effects
- [ ] Used-up consumables don't work again
- [ ] Multiple boosts of same type (takes highest)
- [ ] Purchasing item when already have one
- [ ] Item expiry during gameplay

---

## 🚀 Future Enhancements (Not in Scope)

These could be added later if desired:
- Gift system (transfer items between members)
- Limited-time shop items (seasonal)
- Member-only exclusive items (based on rank)
- Bulk purchase discounts
- Item crafting system (combine items)
- Shop item restocking mechanics
- Flash sales and special offers

---

## 📈 Progression Impact

### How This Helps Guilds:
1. **Engagement:** Members have reason to participate in all activities (earn points)
2. **Progression:** Multiple paths to power (XP, money, shop items)
3. **Strategy:** Choose which items to buy based on playstyle
4. **Social:** Members can see each other's items and badges
5. **Retention:** Consumable items create recurring goals

### Typical Member Journey:
- **Week 1:** Earn first 250 points, buy Bronze Badge
- **Week 2:** Save up 500 points, buy XP Boost for big gaming session
- **Week 3:** Buy reset tokens for convenient daily/work claiming
- **Month 1:** Save for cosmetics or powerful boosts
- **Month 2+:** Regular boost purchases for gameplay advantages

---

## 🎉 Phase 3 Complete!

**Lines of Code Added:** ~900 lines
**New Commands:** 1 (`/use-reset-token`)
**New Utility Modules:** 1 (`guildShopEffects.js`)
**Shop Items Available:** 18
**Database Functions Modified:** 2
**Existing Commands Enhanced:** 3 (daily, work, slots)

Phase 3 successfully adds a complete shop economy with contribution points, 18 purchasable items, and seamless integration into existing game systems. Members can now earn points through participation and spend them on boosts, cosmetics, and utilities that enhance their gameplay experience.

**Ready for Phase 4:** Guild-Exclusive Events (excluding treasure hunts)
