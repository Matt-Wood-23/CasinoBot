# Future Improvements & Deferred Tasks

This file tracks improvement ideas and tools to investigate later.

## Logging System - Winston

**Status:** Deferred - Need to learn more about Winston first

**Why implement this:**
- Better log management than console.log/error
- Automatic log rotation (prevents huge log files)
- Multiple log levels (error, warn, info, debug)
- Can log to files, console, or external services
- Structured logging for easier debugging

**What it would replace:**
- All `console.log()` calls
- All `console.error()` calls

**Implementation overview:**
```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console()
  ]
});

// Usage:
logger.info('Bot started successfully');
logger.error('Failed to process command', { error: err, userId: user.id });
```

**Resources:**
- Winston docs: https://github.com/winstonjs/winston
- Tutorial: https://blog.logrocket.com/node-js-logging-best-practices/

**Estimated effort:** 2-3 hours
- Install Winston
- Create logger utility file
- Replace all console.log/error calls (~100+ locations)
- Set up log rotation
- Test logging in production

---

## Automated Testing - Jest

**Status:** Deferred - Need to learn Jest first

**Why implement this:**
- Catch bugs before they reach production
- Ensure game math is correct (odds, payouts, etc.)
- Prevent regressions when adding features
- Document expected behavior

**What to test:**
1. **Game Logic** (HIGH PRIORITY)
   - Blackjack win conditions
   - Natural blackjack detection
   - Slots payout calculations
   - Roulette bet validation and payouts
   - Poker hand rankings

2. **Economy System**
   - Loan interest calculations
   - Credit score updates
   - VIP level benefits
   - Daily/weekly bonus calculations

3. **Achievement System**
   - Achievement unlock conditions
   - Progress tracking
   - Reward distribution

4. **Guild System**
   - XP calculations
   - Level-up bonuses
   - Treasury operations

**Example test:**
```javascript
const { isNaturalBlackjack } = require('./utils/cardHelpers');

describe('Blackjack Logic', () => {
  test('detects natural blackjack with Ace and 10', () => {
    const hand = [
      { value: 11, suit: 'hearts' },
      { value: 10, suit: 'spades' }
    ];
    expect(isNaturalBlackjack(hand)).toBe(true);
  });

  test('rejects non-natural 21', () => {
    const hand = [
      { value: 7, suit: 'hearts' },
      { value: 7, suit: 'spades' },
      { value: 7, suit: 'clubs' }
    ];
    expect(isNaturalBlackjack(hand)).toBe(false);
  });
});
```

**Resources:**
- Jest docs: https://jestjs.io/docs/getting-started
- Discord.js testing: https://discordjs.guide/testing/

**Estimated effort:** 8-12 hours
- Install Jest
- Learn testing basics
- Write tests for critical game logic (~50+ tests)
- Set up continuous integration
- Document testing practices

---

## Other Deferred Features

### Rate Limiting
**Status:** Not needed currently (small server)
**Revisit when:** Server grows to 100+ active users

### Database Connection Pooling Optimization
**Status:** Working fine currently
**Revisit when:** Experiencing performance issues

### Redis Caching
**Status:** Database queries fast enough
**Revisit when:** User base grows significantly

### Unique Games Challenge Tracking
**Status:** Currently using simplified tracking
**Location:** `utils/challenges.js` line ~406-416

**Current limitation:**
The "unique_games" challenge type doesn't accurately track which specific games a user has played. It increments on each game type seen during a session, but doesn't persist the list of unique games played.

**Proper implementation would require:**
1. Add a JSONB column to `user_challenges` table to store array of played games
   ```sql
   ALTER TABLE user_challenges ADD COLUMN metadata JSONB DEFAULT '{}';
   ```
2. Or create a separate table:
   ```sql
   CREATE TABLE challenge_unique_games (
     challenge_id BIGINT,
     game_type TEXT,
     PRIMARY KEY (challenge_id, game_type)
   );
   ```
3. Update challenge logic to:
   - Check if game type already exists in the list
   - Only increment progress if it's a new game type
   - Store the game type for future checks

**Estimated effort:** 2-3 hours
- Add database migration
- Update challenge tracking logic
- Test with various challenge scenarios

**Priority:** Low (current approximation works for most use cases)

---

## Notes

- Prioritize Winston when logs become hard to manage
- Prioritize Jest before adding complex new features (PvP, Texas Hold'em)
- Both tools are industry-standard and worth learning
- Can be added incrementally without breaking existing code
