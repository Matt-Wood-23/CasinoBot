# Guild XP Integration Guide

This guide explains how to integrate guild XP awards into games and commands.

## Overview

The guild XP system awards experience points to guilds when their members:
- Play games (5 XP per game)
- Wager money (1 XP per $100 wagered)
- Win games (tracks for challenges)
- Complete daily/weekly challenges
- Participate in guild heists
- Donate to guild treasury

## Already Integrated

The following features already award guild XP automatically:
- ✅ Guild donations (`/guild donate`)
- ✅ Daily bonus (`/daily`)
- ✅ Work command (`/work`)
- ✅ Guild heists (`/guildheist`)

## Integrating XP into Game Files

### Step 1: Import the utilities

At the top of your game command file, add:

```javascript
const { awardGameXP, awardWagerXP } = require('../utils/guildXP');
```

### Step 2: Award XP after game completion

After the game result is recorded and before replying to the user, add:

```javascript
// Award guild XP (async, don't wait for completion)
awardWagerXP(userId, betAmount, 'GameName').catch(err =>
    console.error('Error awarding wager XP:', err)
);

const won = /* your win condition */;
awardGameXP(userId, 'GameName', won).catch(err =>
    console.error('Error awarding game XP:', err)
);
```

### Example Integration (Blackjack)

```javascript
// File: commands/blackjack.js

const { awardGameXP, awardWagerXP } = require('../utils/guildXP');

// ... existing code ...

async function execute(interaction) {
    const userId = interaction.user.id;
    const betAmount = interaction.options.getInteger('amount');

    // ... game logic ...

    // After recording game result
    await recordGameResult(userId, 'blackjack', netProfit, betAmount);

    // Award guild XP for wager
    awardWagerXP(userId, betAmount, 'Blackjack').catch(err =>
        console.error('Error awarding wager XP:', err)
    );

    // Award guild XP for game completion
    const won = netProfit > 0;
    awardGameXP(userId, 'Blackjack', won).catch(err =>
        console.error('Error awarding game XP:', err)
    );

    // Send reply to user
    await interaction.editReply({ embeds: [resultEmbed] });
}
```

### Example Integration (Slots)

```javascript
// File: commands/slots.js

const { awardGameXP, awardWagerXP } = require('../utils/guildXP');

// ... existing code ...

async function execute(interaction) {
    const userId = interaction.user.id;
    const betAmount = interaction.options.getInteger('amount');

    // ... game logic ...

    // After recording game result
    await recordGameResult(userId, 'slots', winnings - betAmount, betAmount);

    // Award guild XP
    awardWagerXP(userId, betAmount, 'Slots').catch(err =>
        console.error('Error awarding wager XP:', err)
    );

    const won = winnings > 0;
    awardGameXP(userId, 'Slots', won).catch(err =>
        console.error('Error awarding game XP:', err)
    );

    // Send reply
    await interaction.editReply({ embeds: [resultEmbed] });
}
```

## Applying Guild Perks to Games

If you want to apply guild winnings bonuses to games:

```javascript
const { getUserGuild } = require('../utils/guilds');
const { getGuildWithLevel } = require('../database/queries');
const { applyWinningsBonus } = require('../utils/guildLevels');

// After calculating winnings
if (winnings > 0) {
    const userGuild = await getUserGuild(userId);
    if (userGuild) {
        const guildData = await getGuildWithLevel(userGuild.guildId);
        if (guildData) {
            const guildLevel = guildData.level || 1;
            const adjustedWinnings = applyWinningsBonus(winnings, guildLevel);
            const bonus = adjustedWinnings - winnings;

            if (bonus > 0) {
                winnings = adjustedWinnings;
                // Optionally show bonus in embed
                embed.addFields({
                    name: '🏰 Guild Bonus',
                    value: `+$${bonus.toLocaleString()}`,
                    inline: true
                });
            }
        }
    }
}
```

## Files to Update

Update these game command files to add XP integration:

### Priority (Most Popular Games)
- [ ] `commands/blackjack.js`
- [ ] `commands/slots.js`
- [ ] `commands/poker.js`
- [ ] `commands/roulette.js`

### Secondary
- [ ] `commands/coinflip.js`
- [ ] `commands/dice.js`
- [ ] `commands/crash.js`
- [ ] `commands/minesweeper.js`
- [ ] `commands/war.js`
- [ ] `commands/bingo.js`
- [ ] `commands/lottery.js`

### Challenge Integration

If updating the challenges system, import and use:

```javascript
const { awardPersonalChallengeXP } = require('../utils/guildXP');

// After completing a challenge
await awardPersonalChallengeXP(userId, 'daily'); // or 'weekly'
```

## Testing

After integration, test by:

1. Creating a guild
2. Playing games
3. Checking `/guild level` to see XP gains
4. Reaching level 5 to unlock challenges
5. Checking `/guild challenges` to see progress

## XP Rates Reference

- Game played: 5 XP
- Money wagered: 1 XP per $100
- Daily challenge: 50 XP
- Weekly challenge: 200 XP
- Successful heist: 500 XP
- Failed heist: 100 XP
- Donation: 1 XP per $1,000

## Notes

- XP awards are non-blocking (fire-and-forget) to avoid slowing down game responses
- Errors are caught and logged but don't affect game flow
- Guild challenges automatically track game wins, wagers, and other activities
- Level-ups are detected automatically and trigger notifications
