# Guild Features Design Document

## Features to Implement Now

### 1. Custom Guild Ranks and Roles

**Purpose**: Allow guilds to create custom ranks with specific permissions and assign them to members.

**Database Schema**:
```sql
-- Guild ranks table
CREATE TABLE IF NOT EXISTS guild_ranks (
    id SERIAL PRIMARY KEY,
    guild_id INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    rank_name VARCHAR(50) NOT NULL,
    rank_order INTEGER NOT NULL, -- Lower number = higher rank (0 = leader)
    permissions JSONB DEFAULT '{}', -- Permissions object
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
    UNIQUE(guild_id, rank_name),
    UNIQUE(guild_id, rank_order)
);

-- Add rank_id to guild_members
ALTER TABLE guild_members ADD COLUMN IF NOT EXISTS rank_id INTEGER REFERENCES guild_ranks(id) ON DELETE SET NULL;

-- Guild rank log for tracking changes
CREATE TABLE IF NOT EXISTS guild_rank_log (
    id SERIAL PRIMARY KEY,
    guild_id INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    user_id VARCHAR(20) NOT NULL,
    action VARCHAR(50) NOT NULL, -- 'rank_created', 'rank_deleted', 'member_promoted', 'member_demoted'
    old_rank VARCHAR(50),
    new_rank VARCHAR(50),
    changed_by VARCHAR(20),
    timestamp BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);
```

**Default Ranks** (created automatically for new guilds):
- Leader (order 0) - Full permissions
- Officer (order 1) - Most permissions except critical ones
- Veteran (order 2) - Some management permissions
- Member (order 3) - Basic permissions
- Recruit (order 4) - Limited permissions

**Permissions System**:
```javascript
{
    "invite_members": true,
    "kick_members": true,
    "manage_ranks": false,
    "manage_treasury": true,
    "start_heist": true,
    "manage_vault": true,
    "manage_shop": false,
    "view_logs": true,
    "manage_events": false
}
```

**Commands**:
- `/guild ranks` - View all guild ranks and their permissions
- `/guild rank create <name> <order>` - Create a new rank
- `/guild rank delete <name>` - Delete a rank
- `/guild rank permissions <name> [permission] [value]` - Edit rank permissions
- `/guild rank assign <member> <rank>` - Assign rank to a member
- `/guild members` - View all members with their ranks

---

### 2. Guild Shop with Exclusive Items

**Purpose**: Members can spend guild contribution points to buy exclusive items and boosts.

**Database Schema**:
```sql
-- Track member contribution points
ALTER TABLE guild_members ADD COLUMN IF NOT EXISTS contribution_points INTEGER DEFAULT 0;

-- Guild shop items (configurable per guild or global)
CREATE TABLE IF NOT EXISTS guild_shop_items (
    id SERIAL PRIMARY KEY,
    item_key VARCHAR(50) UNIQUE NOT NULL,
    item_name VARCHAR(100) NOT NULL,
    description TEXT,
    cost INTEGER NOT NULL,
    item_type VARCHAR(50) NOT NULL, -- 'boost', 'cosmetic', 'consumable'
    effect JSONB DEFAULT '{}',
    duration_hours INTEGER, -- For temporary items
    is_global BOOLEAN DEFAULT true, -- Available to all guilds
    required_level INTEGER DEFAULT 1,
    stock_limit INTEGER, -- NULL = unlimited
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);

-- Member purchased items
CREATE TABLE IF NOT EXISTS guild_shop_purchases (
    id SERIAL PRIMARY KEY,
    guild_id INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    user_id VARCHAR(20) NOT NULL,
    item_key VARCHAR(50) NOT NULL REFERENCES guild_shop_items(item_key),
    cost_paid INTEGER NOT NULL,
    purchased_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
    expires_at BIGINT, -- For temporary items
    is_active BOOLEAN DEFAULT true
);

-- Contribution point log
CREATE TABLE IF NOT EXISTS guild_contribution_log (
    id SERIAL PRIMARY KEY,
    guild_id INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    user_id VARCHAR(20) NOT NULL,
    amount INTEGER NOT NULL, -- Can be negative for purchases
    source VARCHAR(100) NOT NULL,
    timestamp BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);
```

**Earning Contribution Points**:
- Playing games: 1 point per game
- Wagering: 1 point per $500 wagered
- Donating to treasury: 5 points per $10,000 donated
- Completing weekly challenges: 50 points
- Participating in heists: 25 points (success), 10 points (failure)

**Shop Items** (examples):
```javascript
const SHOP_ITEMS = [
    // Boosts
    {
        item_key: 'personal_xp_boost',
        item_name: '24h Personal XP Boost',
        description: 'Your game plays give 2x guild XP for 24 hours',
        cost: 500,
        item_type: 'boost',
        effect: { xp_multiplier: 2.0 },
        duration_hours: 24
    },
    {
        item_key: 'luck_charm',
        item_name: '1h Lucky Charm',
        description: '+5% win rate on all games for 1 hour',
        cost: 300,
        item_type: 'boost',
        effect: { luck_bonus: 0.05 },
        duration_hours: 1
    },

    // Cosmetics
    {
        item_key: 'guild_badge_gold',
        item_name: 'Golden Guild Badge',
        description: 'Show off with a golden badge next to your name',
        cost: 1000,
        item_type: 'cosmetic',
        effect: { badge: '🏆' }
    },
    {
        item_key: 'custom_title',
        item_name: 'Custom Title',
        description: 'Set a custom title displayed in your profile',
        cost: 750,
        item_type: 'cosmetic',
        effect: { allows_custom_title: true }
    },

    // Consumables
    {
        item_key: 'instant_daily_reset',
        item_name: 'Daily Reset Token',
        description: 'Instantly reset your daily cooldown',
        cost: 200,
        item_type: 'consumable',
        effect: { resets: 'daily' }
    },
    {
        item_key: 'work_double',
        item_name: 'Overtime Pass',
        description: 'Your next work command gives double rewards',
        cost: 150,
        item_type: 'consumable',
        effect: { work_multiplier: 2.0, uses: 1 }
    }
];
```

**Commands**:
- `/guild shop` - Browse available items
- `/guild shop buy <item>` - Purchase an item
- `/guild contributions [@member]` - View contribution points
- `/guild inventory [@member]` - View purchased items

---

### 3. Guild Vault Implementation

**Purpose**: Shared storage where members can deposit/withdraw money with permission controls.

**Database Schema**:
```sql
-- Add vault balance to guilds table
ALTER TABLE guilds ADD COLUMN IF NOT EXISTS vault_balance BIGINT DEFAULT 0;

-- Vault transaction log
CREATE TABLE IF NOT EXISTS guild_vault_log (
    id SERIAL PRIMARY KEY,
    guild_id INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    user_id VARCHAR(20) NOT NULL,
    action VARCHAR(20) NOT NULL, -- 'deposit', 'withdraw'
    amount BIGINT NOT NULL,
    balance_before BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    reason TEXT,
    timestamp BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);

-- Vault access settings
CREATE TABLE IF NOT EXISTS guild_vault_settings (
    guild_id INTEGER PRIMARY KEY REFERENCES guilds(id) ON DELETE CASCADE,
    min_rank_to_withdraw INTEGER DEFAULT 1, -- Minimum rank order to withdraw
    daily_withdraw_limit BIGINT, -- NULL = unlimited
    requires_approval BOOLEAN DEFAULT false,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
    updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);
```

**Features**:
- Anyone can deposit to vault (earns 2x contribution points vs treasury)
- Withdrawal permissions based on rank
- Daily withdrawal limits per member
- Transaction history tracking
- Vault balance displayed in guild info

**Commands**:
- `/guild vault` - View vault balance and recent transactions
- `/guild vault deposit <amount>` - Deposit money to vault
- `/guild vault withdraw <amount> [reason]` - Withdraw from vault
- `/guild vault settings` - View/edit vault settings (leader/officers only)
- `/guild vault history [member] [limit]` - View transaction history

---

### 4. Guild-Exclusive Events

**Purpose**: Special automated events that guilds can participate in for rewards.

**Database Schema**:
```sql
-- Guild events table
CREATE TABLE IF NOT EXISTS guild_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    event_name VARCHAR(100) NOT NULL,
    description TEXT,
    start_time BIGINT NOT NULL,
    end_time BIGINT NOT NULL,
    min_guild_level INTEGER DEFAULT 1,
    requirements JSONB DEFAULT '{}',
    rewards JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true
);

-- Guild event participation
CREATE TABLE IF NOT EXISTS guild_event_participation (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES guild_events(id) ON DELETE CASCADE,
    guild_id INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    progress JSONB DEFAULT '{}',
    completed BOOLEAN DEFAULT false,
    rewards_claimed BOOLEAN DEFAULT false,
    started_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
    completed_at BIGINT,
    UNIQUE(event_id, guild_id)
);

-- Individual member contributions to events
CREATE TABLE IF NOT EXISTS guild_event_contributions (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES guild_events(id) ON DELETE CASCADE,
    guild_id INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    user_id VARCHAR(20) NOT NULL,
    contribution_type VARCHAR(50) NOT NULL,
    contribution_value INTEGER NOT NULL,
    timestamp BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);
```

**Event Types**:

1. **Boss Raid** (48 hours)
   - Guild members collectively deal damage by playing games
   - Each game win = damage based on bet amount
   - Defeat boss before time runs out
   - Rewards: XP boost, money, contribution points

2. **Treasure Hunt** (72 hours)
   - Members find treasure pieces by playing specific games
   - Need to collect all 10 pieces
   - First 5 guilds get rewards
   - Rewards scale by completion speed

3. **Casino Domination** (1 week)
   - Guild with most total wagered wins
   - Bonus multipliers for variety (playing many game types)
   - Top 10 guilds get rewards

4. **Heist Festival** (Weekend)
   - Special weekend event with boosted heist rewards
   - Extra guild challenges available
   - Bonus XP for heist participation

5. **Charity Drive** (2 weeks)
   - Guilds compete to donate the most to charity
   - Donations from guild treasury count 2x
   - Top guilds get special cosmetic rewards

**Commands**:
- `/guild events` - View active and upcoming events
- `/guild event join <event>` - Join an event
- `/guild event progress [event]` - View event progress
- `/guild event leaderboard <event>` - View event leaderboard
- `/guild event rewards <event>` - Claim event rewards (auto-admin command)

---

### 5. Leaderboard Rewards System

**Purpose**: Automatic reward distribution for top guilds at end of season/week.

**Database Schema**:
```sql
-- Leaderboard reward tiers
CREATE TABLE IF NOT EXISTS guild_leaderboard_rewards (
    id SERIAL PRIMARY KEY,
    leaderboard_type VARCHAR(50) NOT NULL, -- 'season', 'weekly', 'monthly'
    rank_min INTEGER NOT NULL,
    rank_max INTEGER NOT NULL,
    reward_type VARCHAR(50) NOT NULL, -- 'money', 'xp', 'legacy_points', 'items', 'title'
    reward_value JSONB NOT NULL,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);

-- Reward claim history
CREATE TABLE IF NOT EXISTS guild_reward_claims (
    id SERIAL PRIMARY KEY,
    guild_id INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    leaderboard_type VARCHAR(50) NOT NULL,
    period_identifier VARCHAR(100) NOT NULL, -- e.g., 'season_1', 'week_2024_45'
    final_rank INTEGER NOT NULL,
    rewards_given JSONB NOT NULL,
    claimed_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
    UNIQUE(guild_id, leaderboard_type, period_identifier)
);
```

**Reward Tiers** (Season):
```javascript
const SEASON_REWARDS = [
    // Rank 1
    {
        rank_min: 1,
        rank_max: 1,
        rewards: {
            legacy_points: 500,
            money_per_member: 1000000,
            contribution_points_per_member: 1000,
            exclusive_title: 'Season Champion',
            exclusive_badge: '👑'
        }
    },
    // Rank 2-3
    {
        rank_min: 2,
        rank_max: 3,
        rewards: {
            legacy_points: 300,
            money_per_member: 500000,
            contribution_points_per_member: 500,
            exclusive_title: 'Elite Guild'
        }
    },
    // Rank 4-10
    {
        rank_min: 4,
        rank_max: 10,
        rewards: {
            legacy_points: 150,
            money_per_member: 250000,
            contribution_points_per_member: 250
        }
    },
    // Rank 11-25
    {
        rank_min: 11,
        rank_max: 25,
        rewards: {
            legacy_points: 75,
            money_per_member: 100000,
            contribution_points_per_member: 100
        }
    }
];

const WEEKLY_REWARDS = [
    // Top 3 guilds each week
    {
        rank_min: 1,
        rank_max: 1,
        rewards: {
            xp_bonus: 5000,
            contribution_points_per_member: 100
        }
    },
    {
        rank_min: 2,
        rank_max: 3,
        rewards: {
            xp_bonus: 2500,
            contribution_points_per_member: 50
        }
    }
];
```

**Features**:
- Automatic reward distribution at season end
- Weekly rewards for top performers
- Rewards distributed to all active members
- Special titles and badges for top guilds
- Claim history tracking

**Commands**:
- `/guild leaderboard [season|weekly|all-time]` - View leaderboard
- `/guild rewards history` - View past reward claims
- Admin command to manually trigger reward distribution

---

## Features to Implement Later

### Territory Control System
**Deferred for later implementation**

Concept: Guilds compete for control of territories on a map, earning passive bonuses.

Key features to design later:
- World map with territories
- Territory capture mechanics
- Territory defense system
- Passive income/bonuses from territories
- Territory wars and battles

---

### Guild vs Guild Tournaments
**Deferred for later implementation**

Concept: Organized tournaments where guilds compete head-to-head.

Key features to design later:
- Tournament bracket system
- Guild team composition
- Head-to-head game matches
- Tournament rewards and prizes
- Spectator mode
- Tournament history and statistics

---

## Implementation Priority

1. **Phase 1**: Custom Ranks and Roles (foundation for permissions)
2. **Phase 2**: Guild Vault (builds on treasury system)
3. **Phase 3**: Contribution Points & Shop (adds progression and rewards)
4. **Phase 4**: Guild-Exclusive Events (content and engagement)
5. **Phase 5**: Leaderboard Rewards (seasonal completion)

Each phase can be deployed independently.
