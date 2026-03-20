# Large File Refactoring Plan

## Overview

This document outlines the plan to refactor three massive files into smaller, more maintainable modules:
- `handlers/buttonHandler.js` (3,164 lines)
- `utils/embeds.js` (~2,000+ lines)
- `database/queries.js` (~4,200+ lines)

**Total Estimated Time:** 8-12 hours
**Risk Level:** Medium-High (touching core functionality)
**Recommended Approach:** One file at a time, with testing between each

---

## Phase 1: Refactor Button Handler (Highest Priority)

**File:** `handlers/buttonHandler.js` (3,164 lines)
**Estimated Time:** 4-5 hours
**Risk:** High (handles all button interactions)

### Current Structure
Single file with:
- 1 main router function (`handleButtonInteraction`)
- 27 game/feature-specific handler functions
- Duplicate helper functions

### Target Structure
```
handlers/
├── buttonHandler.js (main router ~100 lines)
└── buttons/
    ├── blackjackButtons.js
    ├── pokerButtons.js
    ├── rouletteButtons.js
    ├── slotsButtons.js
    ├── crapsButtons.js
    ├── warButtons.js
    ├── coinflipButtons.js
    ├── horseRaceButtons.js
    ├── crashButtons.js
    ├── bingoButtons.js
    ├── tournamentButtons.js
    ├── hiloButtons.js
    ├── shopButtons.js (purchases, inventory)
    ├── guildButtons.js (guild heists, events)
    ├── challengeButtons.js
    └── tableButtons.js (multi-table blackjack)
```

### Step-by-Step Process

#### Step 1: Create Directory Structure (5 min)
```bash
mkdir handlers/buttons
```

#### Step 2: Extract Helper Functions First (30 min)
- Move `isNaturalBlackjack` → Already done in `utils/cardHelpers.js`
- Move other shared helpers to appropriate utils files
- Update imports in main file

#### Step 3: Extract Game Handlers One at a Time (3 hours)

**For each game type:**

1. **Create new file** (e.g., `handlers/buttons/blackjackButtons.js`)
   ```javascript
   // Template structure
   const { getUserMoney, setUserMoney } = require('../../database/queries');
   const { createGameEmbed } = require('../../utils/embeds');
   // ... other imports

   async function handleBlackjackButtons(interaction, activeGames, client, dealCardsWithDelay) {
       // Move code from main file
   }

   module.exports = { handleBlackjackButtons };
   ```

2. **Cut handler code** from main file
3. **Update imports** in new file
4. **Import in main router**
5. **Test that specific game still works**
6. **Commit changes** (one commit per game)

**Order of extraction (easiest → hardest):**
1. ✅ Slots (simplest, ~64 lines)
2. ✅ Coinflip (~139 lines)
3. ✅ War (~125 lines)
4. ✅ Craps (~80 lines)
5. ✅ Horse Race (~173 lines)
6. ✅ Hi-Lo (~155 lines)
7. ✅ Crash (~139 lines)
8. ✅ Bingo (~206 lines)
9. ✅ Three Card Poker (~131 lines)
10. ✅ Roulette (~234 lines) - complex betting interface
11. ✅ Tournament (~293 lines)
12. ✅ Blackjack (~387 lines) - most complex
13. ✅ Table Buttons (~154 lines) - multi-table support
14. ✅ Shop Buttons (~200 lines) - purchases
15. ✅ Guild Buttons (~100 lines)
16. ✅ Challenge Buttons (~60 lines)

#### Step 4: Update Main Router (30 min)
Update `handlers/buttonHandler.js` to be a thin router:
```javascript
const { handleBlackjackButtons } = require('./buttons/blackjackButtons');
const { handlePokerButtons } = require('./buttons/pokerButtons');
// ... etc

async function handleButtonInteraction(interaction, activeGames, client, dealCardsWithDelay, rouletteSessions) {
    const { customId, user } = interaction;

    if (customId.startsWith('poker_')) {
        await handlePokerButtons(interaction, activeGames, customId, user.id, client);
        return;
    }

    if (customId.startsWith('roulette_')) {
        await handleRouletteButtons(interaction, activeGames, user.id, client, rouletteSessions);
        return;
    }

    // ... etc
}

module.exports = { handleButtonInteraction };
```

#### Step 5: Testing Strategy
- [ ] Test each game after extraction
- [ ] Test button interactions work correctly
- [ ] Test error handling still works
- [ ] Test multi-player games
- [ ] Test edge cases (timeouts, invalid states)

#### Step 6: Verification Checklist
- [ ] All games still functional
- [ ] No import errors
- [ ] Error handling preserved
- [ ] Main file reduced to ~100-200 lines
- [ ] Each game file is 100-400 lines
- [ ] Code duplication eliminated

---

## Phase 2: Refactor Embeds (Medium Priority)

**File:** `utils/embeds.js` (~2,000+ lines)
**Estimated Time:** 2-3 hours
**Risk:** Medium (display logic, easier to test visually)

### Current Structure
Single file with all embed creation functions for:
- Games
- Economy
- Guilds
- Stats
- Achievements
- Challenges

### Target Structure
```
utils/
├── embeds.js (main export file ~50 lines)
└── embeds/
    ├── gameEmbeds.js (blackjack, slots, poker, roulette, etc.)
    ├── economyEmbeds.js (balance, daily, work, loans)
    ├── guildEmbeds.js (guild info, events, heists)
    ├── statsEmbeds.js (statistics, leaderboards)
    ├── achievementEmbeds.js (achievements, progress)
    └── challengeEmbeds.js (challenges, rewards)
```

### Step-by-Step Process

#### Step 1: Create Directory Structure (5 min)
```bash
mkdir utils/embeds
```

#### Step 2: Identify All Embed Functions (15 min)
- Read through embeds.js
- List all exported functions
- Group by category

#### Step 3: Extract by Category (2 hours)

**For each category:**

1. **Create new file** (e.g., `utils/embeds/gameEmbeds.js`)
2. **Move related functions**
3. **Update imports** (EmbedBuilder, colors, etc.)
4. **Export functions**
5. **Test embed displays**

#### Step 4: Create Main Export File (15 min)
Update `utils/embeds.js` to re-export everything:
```javascript
// Main embeds export file
module.exports = {
    ...require('./embeds/gameEmbeds'),
    ...require('./embeds/economyEmbeds'),
    ...require('./embeds/guildEmbeds'),
    ...require('./embeds/statsEmbeds'),
    ...require('./embeds/achievementEmbeds'),
    ...require('./embeds/challengeEmbeds')
};
```

This way, existing code still works with:
```javascript
const { createGameEmbed } = require('./utils/embeds');
```

#### Step 5: Testing Strategy
- [ ] Display each type of embed
- [ ] Check formatting and colors
- [ ] Verify all fields show correctly
- [ ] Test edge cases (long text, many fields)

---

## Phase 3: Refactor Database Queries (Lowest Priority, Highest Impact)

**File:** `database/queries.js` (~4,200+ lines)
**Estimated Time:** 4-5 hours
**Risk:** High (all database operations)

### Current Structure
Single massive file with all database operations

### Target Structure
```
database/
├── queries.js (main export file ~50 lines)
└── queries/
    ├── users.js (user data, money, daily/work)
    ├── games.js (game results, history, jackpot)
    ├── economy.js (loans, credit score, gifts)
    ├── guilds.js (guild management, members, events)
    ├── achievements.js (achievements, progress)
    ├── challenges.js (challenges, tracking)
    ├── shop.js (inventory, boosts, properties)
    ├── vip.js (VIP status, benefits)
    └── stats.js (user statistics, leaderboards)
```

### Step-by-Step Process

#### Step 1: Create Directory Structure (5 min)
```bash
mkdir database/queries
```

#### Step 2: Map All Functions by Domain (30 min)
Read through queries.js and categorize every function:
- Users: `getUserMoney`, `setUserMoney`, `loadUserData`, etc.
- Games: `recordGameResult`, `getGameHistory`, `getServerJackpot`, etc.
- Economy: loan functions, gift functions
- Guilds: all guild-related queries
- Etc.

#### Step 3: Move Shared Utilities First (30 min)
- `snakeToCamel` function
- `pendingNotifications` Map
- Helper functions

Create `database/queries/utils.js` for shared code.

#### Step 4: Extract by Domain (3 hours)

**For each domain:**

1. **Create new file** (e.g., `database/queries/users.js`)
2. **Move related functions** (keep together logically)
3. **Update imports** (need `query` from connection.js)
4. **Export all functions**
5. **Test database operations**

**Order of extraction:**
1. ✅ Users (core functionality)
2. ✅ Economy (loans, gifts)
3. ✅ Shop (inventory, properties)
4. ✅ VIP (simpler)
5. ✅ Stats (read-only, safer)
6. ✅ Achievements
7. ✅ Challenges
8. ✅ Games (heavily used)
9. ✅ Guilds (most complex)

#### Step 5: Create Main Export File (30 min)
Update `database/queries.js`:
```javascript
// Main queries export file
module.exports = {
    ...require('./queries/users'),
    ...require('./queries/games'),
    ...require('./queries/economy'),
    ...require('./queries/guilds'),
    ...require('./queries/achievements'),
    ...require('./queries/challenges'),
    ...require('./queries/shop'),
    ...require('./queries/vip'),
    ...require('./queries/stats')
};
```

#### Step 6: Testing Strategy
- [ ] Test each query category after extraction
- [ ] Verify database operations work
- [ ] Check transactions still work (COMMIT/ROLLBACK)
- [ ] Test error handling
- [ ] Run through full game flow (bet → play → win → record)

---

## General Best Practices

### Before Starting Any Phase

1. **Create a new git branch**
   ```bash
   git checkout -b refactor-large-files
   ```

2. **Ensure you have backups**
   ```bash
   git commit -m "Backup before refactoring"
   ```

3. **Make sure bot is working**
   - Test all major features
   - Document current state

### During Refactoring

1. **Work on one file at a time**
   - Don't touch multiple files simultaneously
   - Complete and test each before moving on

2. **Commit frequently**
   - One commit per extracted module
   - Use descriptive commit messages:
     ```
     refactor: extract blackjack button handler
     refactor: extract slots embed functions
     refactor: extract user database queries
     ```

3. **Test after each extraction**
   - Don't move forward if something breaks
   - Fix issues immediately

4. **Keep a testing checklist**
   - Check off each feature as you test it
   - Document any issues found

### After Each Phase

1. **Full regression testing**
   - Test all games
   - Test all commands
   - Test multi-player features
   - Test admin commands

2. **Code review**
   - Check for missing imports
   - Check for circular dependencies
   - Verify all exports are correct

3. **Update documentation**
   - Update comments if needed
   - Document new file structure

4. **Merge to main**
   ```bash
   git checkout main
   git merge refactor-large-files
   ```

---

## Rollback Plan

If something breaks badly:

1. **Immediate rollback**
   ```bash
   git checkout main
   git branch -D refactor-large-files
   ```

2. **Identify the issue**
   - Check error logs
   - Find which extraction caused the problem

3. **Fix and retry**
   - Create new branch
   - Fix the issue
   - Continue refactoring

---

## Common Issues & Solutions

### Issue: Import Paths Break
**Solution:** Use relative paths carefully
- From `handlers/buttons/blackjackButtons.js` to `utils/embeds.js`: `../../utils/embeds`
- From `database/queries/users.js` to `connection.js`: `../connection`

### Issue: Circular Dependencies
**Solution:**
- Move shared code to separate utils files
- Use dependency injection where possible
- Avoid cross-imports between modules

### Issue: Missing Exports
**Solution:**
- Double-check `module.exports` in each file
- Verify main export file includes all modules
- Use destructuring carefully

### Issue: Function Not Found
**Solution:**
- Check if function is being imported from correct file
- Verify export name matches import name
- Check for typos

---

## Success Metrics

After refactoring is complete, you should see:

✅ **Maintainability**
- No single file over 500 lines
- Each file has a clear, single responsibility
- Easy to find specific functionality

✅ **Readability**
- Clear directory structure
- Logical grouping of related functions
- Consistent naming conventions

✅ **Testability**
- Easier to test individual modules
- Can mock dependencies more easily
- Reduced coupling between components

✅ **Performance**
- No performance degradation
- All features work as before
- No memory leaks

---

## Timeline Estimate

| Phase | Task | Time | Running Total |
|-------|------|------|---------------|
| 1 | Setup & Planning | 30 min | 30 min |
| 1 | Extract Button Handlers | 3 hours | 3.5 hours |
| 1 | Testing & Fixes | 1 hour | 4.5 hours |
| 2 | Extract Embeds | 2 hours | 6.5 hours |
| 2 | Testing & Fixes | 30 min | 7 hours |
| 3 | Extract Database Queries | 3.5 hours | 10.5 hours |
| 3 | Testing & Fixes | 1 hour | 11.5 hours |
| All | Final Regression Testing | 1 hour | 12.5 hours |

**Total: 12-13 hours** (spread over multiple sessions)

---

## Recommended Schedule

**Session 1 (2-3 hours):** Phase 1 - Button Handlers
- Setup
- Extract 5-6 simple game handlers
- Test

**Session 2 (2-3 hours):** Phase 1 Continued
- Extract remaining game handlers
- Update main router
- Full testing

**Session 3 (2-3 hours):** Phase 2 - Embeds
- Complete full embeds refactoring
- Test all displays

**Session 4 (2-3 hours):** Phase 3 - Queries (Part 1)
- Extract users, economy, shop, vip, stats

**Session 5 (3-4 hours):** Phase 3 - Queries (Part 2)
- Extract achievements, challenges, games, guilds
- Final testing

---

## Notes

- This is a large undertaking but will pay off long-term
- The bot will be much easier to maintain and extend
- Take breaks between phases
- Don't rush - better to go slow and get it right
- Keep the bot running on the old code until refactoring is complete
- Consider doing this during low-usage hours

**Good luck! This will make your codebase significantly better! 🚀**
