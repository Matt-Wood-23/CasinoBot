-- Guild Advanced Features Migration
-- Adds: Custom Ranks, Guild Shop, Guild Vault, Guild Events, Leaderboard Rewards
-- Run this after add_guild_levels_system.sql

-- ============================================================================
-- CUSTOM GUILD RANKS AND ROLES
-- ============================================================================

-- Guild ranks table
CREATE TABLE IF NOT EXISTS guild_ranks (
    id SERIAL PRIMARY KEY,
    guild_id INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    rank_name VARCHAR(50) NOT NULL,
    rank_order INTEGER NOT NULL, -- Lower number = higher rank (0 = leader)
    permissions JSONB DEFAULT '{"invite_members": false, "kick_members": false, "manage_ranks": false, "manage_treasury": false, "start_heist": false, "manage_vault": false, "manage_shop": false, "view_logs": true, "manage_events": false}',
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
    UNIQUE(guild_id, rank_name),
    UNIQUE(guild_id, rank_order)
);

-- Add rank_id to guild_members
ALTER TABLE guild_members ADD COLUMN IF NOT EXISTS rank_id INTEGER REFERENCES guild_ranks(id) ON DELETE SET NULL;

-- Guild rank change log
CREATE TABLE IF NOT EXISTS guild_rank_log (
    id SERIAL PRIMARY KEY,
    guild_id INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    user_id VARCHAR(20) NOT NULL,
    action VARCHAR(50) NOT NULL, -- 'rank_created', 'rank_deleted', 'member_promoted', 'member_demoted', 'permissions_changed'
    old_rank VARCHAR(50),
    new_rank VARCHAR(50),
    changed_by VARCHAR(20),
    details JSONB DEFAULT '{}',
    timestamp BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);

CREATE INDEX IF NOT EXISTS idx_guild_rank_log_guild ON guild_rank_log(guild_id);
CREATE INDEX IF NOT EXISTS idx_guild_rank_log_user ON guild_rank_log(user_id);

-- ============================================================================
-- GUILD CONTRIBUTION POINTS & SHOP
-- ============================================================================

-- Add contribution points to guild_members
ALTER TABLE guild_members ADD COLUMN IF NOT EXISTS contribution_points INTEGER DEFAULT 0;

-- Guild shop items catalog (global items available to all guilds)
CREATE TABLE IF NOT EXISTS guild_shop_items (
    id SERIAL PRIMARY KEY,
    item_key VARCHAR(50) UNIQUE NOT NULL,
    item_name VARCHAR(100) NOT NULL,
    description TEXT,
    cost INTEGER NOT NULL,
    item_type VARCHAR(50) NOT NULL, -- 'boost', 'cosmetic', 'consumable'
    effect JSONB DEFAULT '{}',
    duration_hours INTEGER, -- For temporary items, NULL = permanent
    is_global BOOLEAN DEFAULT true, -- Available to all guilds
    required_level INTEGER DEFAULT 1,
    stock_limit INTEGER, -- NULL = unlimited
    is_active BOOLEAN DEFAULT true,
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
    is_active BOOLEAN DEFAULT true,
    times_used INTEGER DEFAULT 0, -- For consumables with multiple uses
    max_uses INTEGER -- NULL = single use or permanent
);

-- Contribution point transaction log
CREATE TABLE IF NOT EXISTS guild_contribution_log (
    id SERIAL PRIMARY KEY,
    guild_id INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    user_id VARCHAR(20) NOT NULL,
    amount INTEGER NOT NULL, -- Can be negative for purchases
    source VARCHAR(100) NOT NULL,
    details JSONB DEFAULT '{}',
    timestamp BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);

CREATE INDEX IF NOT EXISTS idx_guild_shop_purchases_user ON guild_shop_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_guild_shop_purchases_active ON guild_shop_purchases(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_guild_contribution_log_guild ON guild_contribution_log(guild_id);

-- ============================================================================
-- GUILD VAULT
-- ============================================================================

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

-- Vault access settings per guild
CREATE TABLE IF NOT EXISTS guild_vault_settings (
    guild_id INTEGER PRIMARY KEY REFERENCES guilds(id) ON DELETE CASCADE,
    min_rank_to_withdraw INTEGER DEFAULT 1, -- Minimum rank order to withdraw (0 = leader only)
    daily_withdraw_limit BIGINT, -- NULL = unlimited
    requires_approval BOOLEAN DEFAULT false,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
    updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);

-- Track daily withdrawal amounts per member
CREATE TABLE IF NOT EXISTS guild_vault_daily_withdrawals (
    id SERIAL PRIMARY KEY,
    guild_id INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    user_id VARCHAR(20) NOT NULL,
    date_key VARCHAR(10) NOT NULL, -- Format: YYYY-MM-DD
    total_withdrawn BIGINT DEFAULT 0,
    UNIQUE(guild_id, user_id, date_key)
);

CREATE INDEX IF NOT EXISTS idx_guild_vault_log_guild ON guild_vault_log(guild_id);
CREATE INDEX IF NOT EXISTS idx_guild_vault_log_user ON guild_vault_log(user_id);
CREATE INDEX IF NOT EXISTS idx_guild_vault_daily_date ON guild_vault_daily_withdrawals(date_key);

-- ============================================================================
-- GUILD EVENTS
-- ============================================================================

-- Guild events table (special events guilds can participate in)
CREATE TABLE IF NOT EXISTS guild_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL, -- 'boss_raid', 'treasure_hunt', 'casino_domination', etc.
    event_name VARCHAR(100) NOT NULL,
    description TEXT,
    start_time BIGINT NOT NULL,
    end_time BIGINT NOT NULL,
    min_guild_level INTEGER DEFAULT 1,
    requirements JSONB DEFAULT '{}',
    rewards JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);

-- Guild event participation tracking
CREATE TABLE IF NOT EXISTS guild_event_participation (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES guild_events(id) ON DELETE CASCADE,
    guild_id INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    progress JSONB DEFAULT '{}', -- Event-specific progress data
    completed BOOLEAN DEFAULT false,
    rewards_claimed BOOLEAN DEFAULT false,
    final_score INTEGER DEFAULT 0,
    final_rank INTEGER,
    started_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
    completed_at BIGINT,
    UNIQUE(event_id, guild_id)
);

-- Individual member contributions to guild events
CREATE TABLE IF NOT EXISTS guild_event_contributions (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES guild_events(id) ON DELETE CASCADE,
    guild_id INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    user_id VARCHAR(20) NOT NULL,
    contribution_type VARCHAR(50) NOT NULL,
    contribution_value INTEGER NOT NULL,
    timestamp BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);

CREATE INDEX IF NOT EXISTS idx_guild_events_active ON guild_events(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_guild_event_participation_event ON guild_event_participation(event_id);
CREATE INDEX IF NOT EXISTS idx_guild_event_contributions_event ON guild_event_contributions(event_id, guild_id);

-- ============================================================================
-- LEADERBOARD REWARDS
-- ============================================================================

-- Leaderboard reward tier configuration
CREATE TABLE IF NOT EXISTS guild_leaderboard_rewards (
    id SERIAL PRIMARY KEY,
    leaderboard_type VARCHAR(50) NOT NULL, -- 'season', 'weekly', 'monthly'
    rank_min INTEGER NOT NULL,
    rank_max INTEGER NOT NULL,
    reward_type VARCHAR(50) NOT NULL, -- 'money', 'xp', 'legacy_points', 'items', 'title'
    reward_value JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
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
    distributed_by VARCHAR(50) DEFAULT 'system',
    UNIQUE(guild_id, leaderboard_type, period_identifier)
);

CREATE INDEX IF NOT EXISTS idx_guild_reward_claims_period ON guild_reward_claims(leaderboard_type, period_identifier);

-- ============================================================================
-- SEED DATA: Default Shop Items
-- ============================================================================

INSERT INTO guild_shop_items (item_key, item_name, description, cost, item_type, effect, duration_hours, required_level) VALUES
-- Boosts
('personal_xp_boost_24h', '24h Personal XP Boost', 'Your game plays give 2x guild XP for 24 hours', 500, 'boost', '{"xp_multiplier": 2.0}', 24, 1),
('personal_xp_boost_7d', '7-Day Personal XP Boost', 'Your game plays give 2x guild XP for 7 days', 2000, 'boost', '{"xp_multiplier": 2.0}', 168, 5),
('luck_charm_1h', '1h Lucky Charm', '+5% better odds on all games for 1 hour', 300, 'boost', '{"luck_bonus": 0.05}', 1, 1),
('luck_charm_24h', '24h Lucky Charm', '+5% better odds on all games for 24 hours', 1500, 'boost', '{"luck_bonus": 0.05}', 24, 3),
('winnings_boost_1h', '1h Winnings Boost', '+10% extra winnings on all games for 1 hour', 400, 'boost', '{"winnings_multiplier": 1.10}', 1, 1),
('winnings_boost_24h', '24h Winnings Boost', '+10% extra winnings on all games for 24 hours', 2000, 'boost', '{"winnings_multiplier": 1.10}', 24, 5),

-- Cosmetics
('guild_badge_gold', 'Golden Guild Badge', 'Show off with a 🏆 badge next to your name', 1000, 'cosmetic', '{"badge": "🏆"}', NULL, 3),
('guild_badge_diamond', 'Diamond Guild Badge', 'Exclusive 💎 badge next to your name', 2500, 'cosmetic', '{"badge": "💎"}', NULL, 10),
('guild_badge_crown', 'Royal Crown Badge', 'Prestigious 👑 badge next to your name', 5000, 'cosmetic', '{"badge": "👑"}', NULL, 15),
('custom_title', 'Custom Title', 'Set a custom title displayed in your profile', 750, 'cosmetic', '{"allows_custom_title": true}', NULL, 5),
('name_color_blue', 'Blue Name Color', 'Your name appears in blue', 1200, 'cosmetic', '{"name_color": "#3498db"}', NULL, 7),
('name_color_purple', 'Purple Name Color', 'Your name appears in purple', 1200, 'cosmetic', '{"name_color": "#9b59b6"}', NULL, 7),
('name_color_gold', 'Gold Name Color', 'Your name appears in gold', 2000, 'cosmetic', '{"name_color": "#f39c12"}', NULL, 12),

-- Consumables
('instant_daily_reset', 'Daily Reset Token', 'Instantly reset your daily cooldown', 200, 'consumable', '{"resets": "daily"}', NULL, 1),
('instant_work_reset', 'Work Reset Token', 'Instantly reset your work cooldown', 150, 'consumable', '{"resets": "work"}', NULL, 1),
('work_double', 'Overtime Pass', 'Your next work command gives double rewards', 150, 'consumable', '{"work_multiplier": 2.0, "uses": 1}', NULL, 1),
('daily_double', 'Fortune Cookie', 'Your next daily command gives double rewards', 200, 'consumable', '{"daily_multiplier": 2.0, "uses": 1}', NULL, 1),
('heist_insurance', 'Heist Insurance', 'Protects you from losing money on your next failed heist', 500, 'consumable', '{"heist_protection": true, "uses": 1}', NULL, 5),
('jackpot_ticket', 'Jackpot Ticket', '+50% jackpot win chance on your next 10 slot spins', 800, 'consumable', '{"jackpot_boost": 0.5, "uses": 10}', NULL, 8)

ON CONFLICT (item_key) DO NOTHING;

-- ============================================================================
-- SEED DATA: Default Leaderboard Rewards
-- ============================================================================

-- Season Rewards
INSERT INTO guild_leaderboard_rewards (leaderboard_type, rank_min, rank_max, reward_type, reward_value) VALUES
('season', 1, 1, 'mixed', '{"legacy_points": 500, "money_per_member": 1000000, "contribution_points_per_member": 1000, "exclusive_title": "Season Champion", "exclusive_badge": "👑"}'),
('season', 2, 3, 'mixed', '{"legacy_points": 300, "money_per_member": 500000, "contribution_points_per_member": 500, "exclusive_title": "Elite Guild", "exclusive_badge": "⭐"}'),
('season', 4, 10, 'mixed', '{"legacy_points": 150, "money_per_member": 250000, "contribution_points_per_member": 250}'),
('season', 11, 25, 'mixed', '{"legacy_points": 75, "money_per_member": 100000, "contribution_points_per_member": 100}'),

-- Weekly Rewards
('weekly', 1, 1, 'mixed', '{"xp_bonus": 5000, "contribution_points_per_member": 100}'),
('weekly', 2, 3, 'mixed', '{"xp_bonus": 2500, "contribution_points_per_member": 50}'),
('weekly', 4, 10, 'mixed', '{"xp_bonus": 1000, "contribution_points_per_member": 25}')

ON CONFLICT DO NOTHING;

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_guild_ranks_guild ON guild_ranks(guild_id);
CREATE INDEX IF NOT EXISTS idx_guild_members_rank ON guild_members(rank_id);
CREATE INDEX IF NOT EXISTS idx_guild_members_contributions ON guild_members(contribution_points);

COMMENT ON TABLE guild_ranks IS 'Custom ranks for guilds with permissions';
COMMENT ON TABLE guild_shop_items IS 'Catalog of items available in guild shop';
COMMENT ON TABLE guild_shop_purchases IS 'Items purchased by guild members';
COMMENT ON TABLE guild_vault_log IS 'Transaction log for guild vault deposits/withdrawals';
COMMENT ON TABLE guild_events IS 'Special events guilds can participate in';
COMMENT ON TABLE guild_leaderboard_rewards IS 'Reward tiers for season/weekly leaderboards';
