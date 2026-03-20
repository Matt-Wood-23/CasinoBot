# Event Integration Status

## Overview
Integrating `recordGameToEvents()` from `utils/eventIntegration.js` into all casino game completion handlers in `handlers/buttonHandler.js`.

---

## ✅ Completed Integrations

### 1. Three Card Poker (2 locations)
- ✅ Line ~198: Play result
- ✅ Line ~235: Fold result

### 2. Roulette (2 locations)
- ✅ Line ~438: Game end
- ✅ Line ~521: Bet again

### 3. Slots (1 location)
- ✅ Line ~725: Spin again

### 4. Blackjack (3 locations)
- ✅ Line ~1039: Single player completion
- ✅ Line ~1071: Multi-player completion
- ✅ Line ~1174: Dealer turn end

### 5. Craps (1 location)
- ✅ Line ~1325: Game complete

### 6. War (2 locations)
- ✅ Line ~1399: Surrender
- ✅ Line ~1451: War result

### 7. Coinflip (1 of 2 locations)
- ✅ Line ~1547: Flip again

---

## ❌ Remaining Integrations

### 8. Coinflip (1 more location)
- ❌ Line ~1590: Initial flip

**Pattern to add:**
```javascript
// Record to active guild events (async, don't wait)
recordGameToEvents(userId, 'Coinflip', bet, adjustedProfit > 0 ? adjustedProfit : 0).catch(err =>
    console.error('Error recording game to events:', err)
);
```

### 9. Horse Race (2 locations)
- ❌ Line ~1615: Race again
- ❌ Line ~1691: Initial race

**Pattern to add:**
```javascript
// Record to active guild events (async, don't wait)
recordGameToEvents(userId, 'Horse Race', bet, adjustedProfit > 0 ? adjustedProfit : 0).catch(err =>
    console.error('Error recording game to events:', err)
);
```

### 10. Crash (2 locations)
- ❌ Line ~1783: Auto cash out
- ❌ Line ~1815: Manual cash out

**Pattern to add:**
```javascript
// Record to active guild events (async, don't wait)
recordGameToEvents(userId, 'Crash', game.betAmount, adjustedProfit > 0 ? adjustedProfit : 0).catch(err =>
    console.error('Error recording game to events:', err)
);
```

### 11. HiLo (3 locations)
- ❌ Line ~2476: Guess higher (game end)
- ❌ Line ~2509: Guess lower (game end)
- ❌ Line ~2534: Cash out

**Pattern to add:**
```javascript
// Record to active guild events (async, don't wait)
recordGameToEvents(userId, 'HiLo', game.initialBet, game.currentWinnings - game.initialBet > 0 ? game.currentWinnings - game.initialBet : 0).catch(err =>
    console.error('Error recording game to events:', err)
);
```

### 12. Bingo (2 locations)
- ❌ Line ~2024: Winners
- ❌ Line ~2042: Losers

**Pattern to add (winners):**
```javascript
// Record to active guild events (async, don't wait)
recordGameToEvents(prize.userId, 'Bingo', game.entryFee, prize.prize - game.entryFee > 0 ? prize.prize - game.entryFee : 0).catch(err =>
    console.error('Error recording game to events:', err)
);
```

**Pattern to add (losers):**
```javascript
// Record to active guild events (async, don't wait)
recordGameToEvents(playerId, 'Bingo', game.entryFee, 0).catch(err =>
    console.error('Error recording game to events:', err)
);
```

### 13. Poker Tournament (4 locations)
- ❌ Line ~2226: Winners (first tournament end)
- ❌ Line ~2244: Losers (first tournament end)
- ❌ Line ~2312: Winners (second tournament end)
- ❌ Line ~2326: Losers (second tournament end)

**Pattern to add (winners):**
```javascript
// Record to active guild events (async, don't wait)
recordGameToEvents(prize.userId, 'Poker Tournament', tournament.buyIn, prize.prize - tournament.buyIn > 0 ? prize.prize - tournament.buyIn : 0).catch(err =>
    console.error('Error recording game to events:', err)
);
```

**Pattern to add (losers):**
```javascript
// Record to active guild events (async, don't wait)
recordGameToEvents(playerId, 'Poker Tournament', tournament.buyIn, 0).catch(err =>
    console.error('Error recording game to events:', err)
);
```

---

## Summary

**Completed:** 12 integrations across 7 games
**Remaining:** 14 integrations across 6 games
**Total:** 26 event integration points

---

## Location Pattern

All integrations follow this pattern:
1. After `recordGameResult()`
2. After `awardGameXP()`
3. Before any UI updates (`interaction.deferUpdate()`, `interaction.update()`, etc.)

---

## Completion Instructions

To finish the remaining integrations:

1. Find each location listed above in `handlers/buttonHandler.js`
2. Add the corresponding pattern code after the `awardGameXP()` call
3. Ensure winnings calculation matches the game logic:
   - For wins: Pass actual winnings amount
   - For losses/pushes: Pass 0
   - Use conditional: `adjustedProfit > 0 ? adjustedProfit : 0` or similar

---

## Testing After Completion

Once all integrations are complete, test:
- [ ] Play each game type during an active Boss Raid
- [ ] Verify damage is recorded to boss
- [ ] Play each game type during Casino Domination
- [ ] Verify winnings are recorded (only on wins)
- [ ] Check event notifications appear in game results
- [ ] Verify guild XP still awards correctly
- [ ] Confirm no errors in console logs
