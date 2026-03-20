# 🎰 CasinoBot

A feature-rich Discord casino bot with multiple games, guilds, achievements, and an extensive economy system.

## Features

### 🎮 Games
- **Blackjack** - Classic 21 with split, double down, and multi-table support
- **Slots** - Spin to win with various payouts
- **Roulette** - Full betting interface with inside/outside bets
- **Three Card Poker** - Ante and play poker variant
- **Craps** - Pass line, don't pass, field, and come bets
- **War** - Go to war or surrender
- **Coin Flip** - Simple heads or tails
- **Horse Racing** - Bet on horses and watch them race
- **Crash** - Cash out before the crash
- **Bingo** - Multi-player bingo lobbies
- **Hi-Lo** - Guess higher or lower, build a streak
- **Poker Tournament** - Texas Hold'em tournament system

### 💰 Economy System
- Daily bonuses with login streaks
- Work commands for earning money
- Loan system with credit scores and interest rates
- Gift money to other users
- Property ownership with upgrades and passive income
- VIP memberships with weekly bonuses
- Progressive server jackpot

### 🏆 Progression
- **Achievements** - Unlock achievements for various milestones
- **Challenges** - Daily and weekly challenges with rewards
- **Statistics** - Track your wins, losses, and earnings
- **Leaderboards** - Compete for the top spot

### 🏰 Guild System
- Create and join guilds
- Guild treasury and donations
- Guild levels and XP
- Guild heists (solo and group)
- Guild challenges (weekly competitions)
- Guild seasons with leaderboards
- Guild ranks and permissions
- Guild vault with withdrawal limits
- Guild shop and contribution points
- Guild events with collaborative goals

### 🛍️ Shop
- Boosts (win multipliers, XP multipliers, etc.)
- Items (lucky charms, insurance, etc.)
- Properties (passive income generators)
- VIP memberships

## Project Structure

```
CasinoBot/
├── commands/                  # Slash command definitions (~60 commands)
│   ├── achievements.js
│   ├── balance.js
│   ├── blackjack.js
│   ├── challenges.js
│   ├── guild.js
│   └── ...
│
├── handlers/
│   ├── buttonHandler.js      # Main button router (147 lines)
│   ├── modalHandler.js        # Modal interaction handler
│   └── buttons/               # Modular button handlers (16 files)
│       ├── blackjackButtons.js    # Blackjack game buttons (510 lines)
│       ├── rouletteButtons.js     # Roulette betting interface (403 lines)
│       ├── tournamentButtons.js   # Poker tournament (357 lines)
│       ├── bingoButtons.js        # Bingo lobby & game (269 lines)
│       ├── shopButtons.js         # Shop purchases (236 lines)
│       ├── horseRaceButtons.js    # Horse racing (182 lines)
│       ├── hiloButtons.js         # Hi-Lo game (163 lines)
│       ├── tableButtons.js        # Multi-table blackjack (159 lines)
│       ├── crashButtons.js        # Crash game (148 lines)
│       ├── coinflipButtons.js     # Coin flip (148 lines)
│       ├── pokerButtons.js        # Three Card Poker (140 lines)
│       ├── warButtons.js          # War game (134 lines)
│       ├── crapsButtons.js        # Craps (89 lines)
│       ├── slotsButtons.js        # Slots (72 lines)
│       ├── challengeButtons.js    # Challenge rewards (64 lines)
│       └── guildButtons.js        # Guild heist join (46 lines)
│
├── utils/
│   ├── embeds.js              # Main embed router (9 lines)
│   ├── embeds/                # Categorized embed creators (3 files)
│   │   ├── gameEmbeds.js          # All game embeds (1,320 lines)
│   │   ├── statsEmbeds.js         # Stats & leaderboards (502 lines)
│   │   └── utilityEmbeds.js       # Error/success/info embeds (32 lines)
│   ├── buttons.js             # Button component builders
│   ├── achievements.js        # Achievement logic
│   ├── challenges.js          # Challenge logic
│   ├── guilds.js              # Guild utilities
│   ├── cardHelpers.js         # Card game utilities
│   ├── holidayEvents.js       # Seasonal bonuses
│   └── ...
│
├── database/
│   ├── connection.js          # PostgreSQL connection pool
│   ├── queries.js             # Main query router (49 lines)
│   └── queries/               # Domain-specific queries (10 files)
│       ├── users.js               # User data operations (373 lines, 16 functions)
│       ├── games.js               # Game results & jackpot (382 lines, 8 functions)
│       ├── economy.js             # Loans & credit scores (235 lines, 8 functions)
│       ├── shop.js                # Inventory, boosts, properties (437 lines, 13 functions)
│       ├── vip.js                 # VIP memberships (135 lines, 4 functions)
│       ├── achievements.js        # Achievement tracking (259 lines, 7 functions)
│       ├── challenges.js          # Challenge system (269 lines, 8 functions)
│       ├── guilds.js              # Complete guild system (1,674 lines, 57 functions)
│       ├── heists.js              # Heist tracking & debt (460 lines, 10 functions)
│       └── streaks.js             # Login streaks (115 lines, 4 functions)
│
├── gameLogic/                 # Game class implementations
│   ├── blackjackGame.js
│   ├── slotsGame.js
│   ├── rouletteGame.js
│   ├── pokerTournament.js
│   └── ...
│
├── main.js                    # Bot entry point & event handlers
└── package.json

```

## Architecture Highlights

### Modular Design
The codebase was refactored from three massive files (9,284 lines) into 29 focused modules (205 lines in main routers):

- **Button Handlers**: 3,149 lines → 147-line router + 16 modules
- **Embeds**: 1,819 lines → 9-line router + 3 modules
- **Database Queries**: 4,316 lines → 49-line router + 10 modules

### Benefits
- **Easy Navigation**: Find code by domain (guilds, shop, games)
- **Maintainable**: Each module has a single, clear purpose
- **Backward Compatible**: All existing imports still work
- **Token Efficient**: Smaller files reduce AI assistant token usage by ~85%

### Key Patterns

#### Re-export Pattern
Main files are thin routers that re-export from modules:

```javascript
// database/queries.js
module.exports = {
    ...require('./queries/users'),
    ...require('./queries/games'),
    ...require('./queries/guilds'),
    // etc.
};
```

Existing code continues to work without changes:
```javascript
const { getUserMoney } = require('../database/queries'); // Still works!
```

#### Domain-Driven Organization
Related functionality is grouped together:
- Guild system: All 57 guild functions in `queries/guilds.js`
- Shop system: Inventory, boosts, properties in `queries/shop.js`
- Game buttons: Each game has its own button handler file

## Database Schema

PostgreSQL database with the following main tables:

- **users** - Core user data (money, daily/work timestamps, notifications)
- **user_games** - Game history and statistics
- **user_loans** - Active loans and credit scores
- **user_inventory** - Item ownership
- **user_boosts** - Active boost effects
- **user_properties** - Property ownership and levels
- **user_vip** - VIP membership status
- **user_achievements** - Achievement unlocks and progress
- **user_challenges** - Daily/weekly challenge tracking
- **guilds** - Guild information (name, treasury, level, XP)
- **guild_members** - Guild membership
- **guild_heists** - Heist statistics and cooldowns
- **guild_challenges** - Weekly guild challenges
- **guild_seasons** - Season history and rankings
- **guild_ranks** - Custom guild ranks and permissions
- **guild_vault** - Guild vault transactions
- **guild_shop** - Guild shop items and purchases
- **guild_events** - Active guild events and participation
- **server_jackpots** - Progressive jackpot per server
- **gambling_bans** - Temporary gambling restrictions

## Setup

### Prerequisites
- Node.js v16 or higher
- PostgreSQL database
- Discord bot token

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/CasinoBot.git
cd CasinoBot
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file with your configuration:
```env
DISCORD_TOKEN=your_bot_token_here
DB_HOST=localhost
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=casinobot
DB_PORT=5432
```

4. Set up the database:
```bash
# Run the database setup script
node database/setup.js
```

5. Start the bot:
```bash
node main.js
```

## Configuration

### Environment Variables

- `DISCORD_TOKEN` - Your Discord bot token
- `DB_HOST` - PostgreSQL host
- `DB_USER` - PostgreSQL username
- `DB_PASSWORD` - PostgreSQL password
- `DB_NAME` - Database name
- `DB_PORT` - PostgreSQL port (default: 5432)

### Bot Permissions

Required Discord permissions:
- Send Messages
- Embed Links
- Use External Emojis
- Add Reactions
- Read Message History
- Use Slash Commands

## Development

### Code Style

- Use async/await for asynchronous operations
- Database queries in `database/queries/` by domain
- Button handlers in `handlers/buttons/` by game
- Embeds in `utils/embeds/` by category
- Keep functions focused and single-purpose

### Adding a New Game

1. Create game logic class in `gameLogic/`
2. Create button handler in `handlers/buttons/`
3. Add game embed function to `utils/embeds/gameEmbeds.js`
4. Create slash command in `commands/`
5. Import button handler in `handlers/buttonHandler.js`

### Adding Database Queries

1. Identify the domain (users, guilds, economy, etc.)
2. Add function to appropriate file in `database/queries/`
3. Export function in that file's `module.exports`
4. Function automatically available via `require('../database/queries')`

### Common Patterns

#### Error Handling in Commands
```javascript
try {
    // Command logic
    await interaction.reply({ embeds: [embed], components: [buttons] });
} catch (error) {
    console.error('Error in command:', error);
    await interaction.reply({
        content: '❌ An error occurred.',
        ephemeral: true
    });
}
```

#### Database Transactions
```javascript
const client = await getClient();
try {
    await client.query('BEGIN');
    // Multiple queries
    await client.query('COMMIT');
} catch (error) {
    await client.query('ROLLBACK');
    throw error;
} finally {
    client.release();
}
```

## Future Improvements

See [FUTURE_IMPROVEMENTS.md](FUTURE_IMPROVEMENTS.md) for planned enhancements:

- **Winston Logging**: Structured logging with file rotation (592 console.error calls to upgrade)
- **Automated Testing**: Jest tests for game logic and critical systems
- **TypeScript**: Type safety and better developer experience
- **Performance Monitoring**: Track slow database queries and operations

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Built with [Discord.js](https://discord.js.org/)
- Database: [PostgreSQL](https://www.postgresql.org/)
- Refactored with assistance from [Claude Code](https://claude.com/claude-code)

## Support

For issues, questions, or suggestions, please open an issue on GitHub.

---

**Made with ♠️ ♥️ ♣️ ♦️**
