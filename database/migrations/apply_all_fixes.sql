-- ============================================================
-- CasinoBot: Apply All Missing Tables, Columns & Constraints
-- Run this against an existing database to bring it up to date.
-- All statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- so it is safe to run multiple times.
-- ============================================================

-- ============================================================
-- 1. GUILD LEVELS SYSTEM
-- ============================================================

ALTER TABLE guilds
    ADD COLUMN IF NOT EXISTS experience BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS season_id INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS legacy_points INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS season_max_level INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS last_level_up BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000;

CREATE INDEX IF NOT EXISTS idx_guilds_season_level ON guilds(season_id, level DESC, experience DESC);

CREATE TABLE IF NOT EXISTS guild_experience_log (
    id SERIAL PRIMARY KEY,
    guild_id INTEGER REFERENCES guilds(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    amount INTEGER NOT NULL,
    source VARCHAR(50) NOT NULL,
    details TEXT,
    timestamp BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);
CREATE INDEX IF NOT EXISTS idx_guild_exp_log_guild ON guild_experience_log(guild_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_guild_exp_log_source ON guild_experience_log(source);

CREATE TABLE IF NOT EXISTS guild_challenges (
    id SERIAL PRIMARY KEY,
    guild_id INTEGER REFERENCES guilds(id) ON DELETE CASCADE,
    challenge_type VARCHAR(50) NOT NULL,
    week_start BIGINT NOT NULL,
    progress INTEGER DEFAULT 0,
    target INTEGER NOT NULL,
    completed BOOLEAN DEFAULT FALSE,
    completed_at BIGINT,
    xp_reward INTEGER NOT NULL,
    UNIQUE(guild_id, challenge_type, week_start)
);
CREATE INDEX IF NOT EXISTS idx_guild_challenges_guild ON guild_challenges(guild_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_guild_challenges_week ON guild_challenges(week_start);

CREATE TABLE IF NOT EXISTS guild_seasons (
    id SERIAL PRIMARY KEY,
    season_number INTEGER UNIQUE NOT NULL,
    start_date BIGINT NOT NULL,
    end_date BIGINT,
    is_active BOOLEAN DEFAULT TRUE
);
INSERT INTO guild_seasons (season_number, start_date, is_active)
VALUES (1, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, TRUE)
ON CONFLICT (season_number) DO NOTHING;

CREATE TABLE IF NOT EXISTS guild_season_history (
    id SERIAL PRIMARY KEY,
    guild_id INTEGER REFERENCES guilds(id) ON DELETE CASCADE,
    season_id INTEGER REFERENCES guild_seasons(id) ON DELETE CASCADE,
    final_level INTEGER NOT NULL,
    final_experience BIGINT NOT NULL,
    legacy_points_earned INTEGER NOT NULL,
    rank INTEGER,
    completed_at BIGINT NOT NULL,
    UNIQUE(guild_id, season_id)
);
CREATE INDEX IF NOT EXISTS idx_guild_season_history_season ON guild_season_history(season_id, final_level DESC);

ALTER TABLE user_statistics
    ADD COLUMN IF NOT EXISTS guild_xp_contributed BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS guild_challenges_completed INTEGER DEFAULT 0;

-- ============================================================
-- 2. GUILD ADVANCED FEATURES (ranks, shop, vault, events, rewards)
-- ============================================================

CREATE TABLE IF NOT EXISTS guild_ranks (
    id SERIAL PRIMARY KEY,
    guild_id INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    rank_name VARCHAR(50) NOT NULL,
    rank_order INTEGER NOT NULL,
    permissions JSONB DEFAULT '{"invite_members":false,"kick_members":false,"manage_ranks":false,"manage_treasury":false,"start_heist":false,"manage_vault":false,"manage_shop":false,"view_logs":true,"manage_events":false}',
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
    UNIQUE(guild_id, rank_name),
    UNIQUE(guild_id, rank_order)
);

ALTER TABLE guild_members
    ADD COLUMN IF NOT EXISTS rank_id INTEGER REFERENCES guild_ranks(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS contribution_points INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS guild_rank_log (
    id SERIAL PRIMARY KEY,
    guild_id INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    user_id VARCHAR(20) NOT NULL,
    action VARCHAR(50) NOT NULL,
    old_rank VARCHAR(50),
    new_rank VARCHAR(50),
    changed_by VARCHAR(20),
    details JSONB DEFAULT '{}',
    timestamp BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);
CREATE INDEX IF NOT EXISTS idx_guild_rank_log_guild ON guild_rank_log(guild_id);
CREATE INDEX IF NOT EXISTS idx_guild_rank_log_user ON guild_rank_log(user_id);

CREATE TABLE IF NOT EXISTS guild_shop_items (
    id SERIAL PRIMARY KEY,
    item_key VARCHAR(50) UNIQUE NOT NULL,
    item_name VARCHAR(100) NOT NULL,
    description TEXT,
    cost INTEGER NOT NULL,
    item_type VARCHAR(50) NOT NULL,
    effect JSONB DEFAULT '{}',
    duration_hours INTEGER,
    is_global BOOLEAN DEFAULT true,
    required_level INTEGER DEFAULT 1,
    stock_limit INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);

CREATE TABLE IF NOT EXISTS guild_shop_purchases (
    id SERIAL PRIMARY KEY,
    guild_id INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    user_id VARCHAR(20) NOT NULL,
    item_key VARCHAR(50) NOT NULL REFERENCES guild_shop_items(item_key),
    cost_paid INTEGER NOT NULL,
    purchased_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
    expires_at BIGINT,
    is_active BOOLEAN DEFAULT true,
    times_used INTEGER DEFAULT 0,
    max_uses INTEGER
);

CREATE TABLE IF NOT EXISTS guild_contribution_log (
    id SERIAL PRIMARY KEY,
    guild_id INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    user_id VARCHAR(20) NOT NULL,
    amount INTEGER NOT NULL,
    source VARCHAR(100) NOT NULL,
    details JSONB DEFAULT '{}',
    timestamp BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);
CREATE INDEX IF NOT EXISTS idx_guild_shop_purchases_user ON guild_shop_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_guild_shop_purchases_active ON guild_shop_purchases(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_guild_contribution_log_guild ON guild_contribution_log(guild_id);

ALTER TABLE guilds
    ADD COLUMN IF NOT EXISTS vault_balance BIGINT DEFAULT 0;

CREATE TABLE IF NOT EXISTS guild_vault_log (
    id SERIAL PRIMARY KEY,
    guild_id INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    user_id VARCHAR(20) NOT NULL,
    action VARCHAR(20) NOT NULL,
    amount BIGINT NOT NULL,
    balance_before BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    reason TEXT,
    timestamp BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);

CREATE TABLE IF NOT EXISTS guild_vault_settings (
    guild_id INTEGER PRIMARY KEY REFERENCES guilds(id) ON DELETE CASCADE,
    min_rank_to_withdraw INTEGER DEFAULT 1,
    daily_withdraw_limit BIGINT,
    requires_approval BOOLEAN DEFAULT false,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
    updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);

CREATE TABLE IF NOT EXISTS guild_vault_daily_withdrawals (
    id SERIAL PRIMARY KEY,
    guild_id INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    user_id VARCHAR(20) NOT NULL,
    date_key VARCHAR(10) NOT NULL,
    total_withdrawn BIGINT DEFAULT 0,
    UNIQUE(guild_id, user_id, date_key)
);
CREATE INDEX IF NOT EXISTS idx_guild_vault_log_guild ON guild_vault_log(guild_id);
CREATE INDEX IF NOT EXISTS idx_guild_vault_log_user ON guild_vault_log(user_id);
CREATE INDEX IF NOT EXISTS idx_guild_vault_daily_date ON guild_vault_daily_withdrawals(date_key);

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
    is_active BOOLEAN DEFAULT true,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);
CREATE INDEX IF NOT EXISTS idx_guild_events_active ON guild_events(is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS guild_event_participation (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES guild_events(id) ON DELETE CASCADE,
    guild_id INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    progress JSONB DEFAULT '{}',
    completed BOOLEAN DEFAULT false,
    rewards_claimed BOOLEAN DEFAULT false,
    final_score INTEGER DEFAULT 0,
    final_rank INTEGER,
    started_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
    completed_at BIGINT,
    UNIQUE(event_id, guild_id)
);
CREATE INDEX IF NOT EXISTS idx_guild_event_participation_event ON guild_event_participation(event_id);

CREATE TABLE IF NOT EXISTS guild_event_contributions (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES guild_events(id) ON DELETE CASCADE,
    guild_id INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    user_id VARCHAR(20) NOT NULL,
    contribution_type VARCHAR(50) NOT NULL,
    contribution_value INTEGER NOT NULL,
    timestamp BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);
CREATE INDEX IF NOT EXISTS idx_guild_event_contributions_event ON guild_event_contributions(event_id, guild_id);

-- Boss raid specific data
CREATE TABLE IF NOT EXISTS guild_boss_raids (
    id SERIAL PRIMARY KEY,
    event_id INTEGER UNIQUE REFERENCES guild_events(id) ON DELETE CASCADE,
    boss_name VARCHAR(200) NOT NULL,
    boss_hp_max BIGINT NOT NULL,
    boss_hp_current BIGINT NOT NULL,
    boss_level INTEGER DEFAULT 1,
    is_defeated BOOLEAN DEFAULT false,
    defeated_at BIGINT,
    defeating_guild_id INTEGER REFERENCES guilds(id) ON DELETE SET NULL,
    reward_multiplier DECIMAL(4,2) DEFAULT 1.0
);
CREATE INDEX IF NOT EXISTS idx_boss_raids_event ON guild_boss_raids(event_id);
CREATE INDEX IF NOT EXISTS idx_boss_raids_defeated ON guild_boss_raids(is_defeated);

-- Casino domination leaderboards
CREATE TABLE IF NOT EXISTS guild_casino_domination (
    id SERIAL PRIMARY KEY,
    event_id INTEGER REFERENCES guild_events(id) ON DELETE CASCADE,
    guild_id INTEGER REFERENCES guilds(id) ON DELETE CASCADE,
    total_winnings BIGINT DEFAULT 0,
    total_wagered BIGINT DEFAULT 0,
    games_played INTEGER DEFAULT 0,
    last_updated BIGINT,
    UNIQUE(event_id, guild_id)
);
CREATE INDEX IF NOT EXISTS idx_casino_dom_event ON guild_casino_domination(event_id);
CREATE INDEX IF NOT EXISTS idx_casino_dom_winnings ON guild_casino_domination(event_id, total_winnings DESC);

-- Heist festival tracking
CREATE TABLE IF NOT EXISTS guild_heist_festival (
    id SERIAL PRIMARY KEY,
    event_id INTEGER REFERENCES guild_events(id) ON DELETE CASCADE,
    guild_id INTEGER REFERENCES guilds(id) ON DELETE CASCADE,
    heists_completed INTEGER DEFAULT 0,
    heists_successful INTEGER DEFAULT 0,
    total_stolen BIGINT DEFAULT 0,
    bonus_xp_earned INTEGER DEFAULT 0,
    last_updated BIGINT,
    UNIQUE(event_id, guild_id)
);
CREATE INDEX IF NOT EXISTS idx_heist_fest_event ON guild_heist_festival(event_id);
CREATE INDEX IF NOT EXISTS idx_heist_fest_guild ON guild_heist_festival(guild_id);

CREATE TABLE IF NOT EXISTS guild_leaderboard_rewards (
    id SERIAL PRIMARY KEY,
    leaderboard_type VARCHAR(50) NOT NULL,
    rank_min INTEGER NOT NULL,
    rank_max INTEGER NOT NULL,
    reward_type VARCHAR(50) NOT NULL,
    reward_value JSONB NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);

CREATE TABLE IF NOT EXISTS guild_reward_claims (
    id SERIAL PRIMARY KEY,
    guild_id INTEGER NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
    leaderboard_type VARCHAR(50) NOT NULL,
    period_identifier VARCHAR(100) NOT NULL,
    final_rank INTEGER NOT NULL,
    rewards_given JSONB NOT NULL,
    claimed_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
    distributed_by VARCHAR(50) DEFAULT 'system',
    UNIQUE(guild_id, leaderboard_type, period_identifier)
);

-- guild_rewards table (referenced by guildRewards.js)
CREATE TABLE IF NOT EXISTS guild_rewards (
    id SERIAL PRIMARY KEY,
    guild_id INTEGER REFERENCES guilds(id) ON DELETE CASCADE,
    reward_type VARCHAR(50) NOT NULL,
    reward_data JSONB NOT NULL,
    reason TEXT,
    created_at BIGINT NOT NULL,
    created_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_guild_rewards_guild ON guild_rewards(guild_id);
CREATE INDEX IF NOT EXISTS idx_guild_rewards_type ON guild_rewards(reward_type);
CREATE INDEX IF NOT EXISTS idx_guild_rewards_created ON guild_rewards(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_guild_ranks_guild ON guild_ranks(guild_id);
CREATE INDEX IF NOT EXISTS idx_guild_members_rank ON guild_members(rank_id);
CREATE INDEX IF NOT EXISTS idx_guild_members_contributions ON guild_members(contribution_points);

-- ============================================================
-- 3. TRANSACTION HISTORY
-- ============================================================

CREATE TABLE IF NOT EXISTS transactions (
    transaction_id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    transaction_type TEXT NOT NULL,
    amount BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    related_user_id TEXT,
    description TEXT,
    metadata JSONB,
    created_at BIGINT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(discord_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, created_at DESC);

-- ============================================================
-- 4. BOT STATE (for lottery and other in-memory state)
-- ============================================================

CREATE TABLE IF NOT EXISTS bot_state (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB,
    updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);

-- ============================================================
-- 5. DATA INTEGRITY: CHECK CONSTRAINTS
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'check_money_non_negative' AND conrelid = 'users'::regclass
    ) THEN
        ALTER TABLE users ADD CONSTRAINT check_money_non_negative CHECK (money >= 0);
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'check_credit_score_range' AND conrelid = 'users'::regclass
    ) THEN
        ALTER TABLE users ADD CONSTRAINT check_credit_score_range CHECK (credit_score BETWEEN 0 AND 1000);
    END IF;
END$$;

-- ============================================================
-- 6. UNIQUE GAMES CHALLENGE TRACKING (metadata column)
-- ============================================================

ALTER TABLE user_challenges
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- ============================================================
-- 7. GUILD SHOP SEED DATA
-- ============================================================

INSERT INTO guild_shop_items (item_key, item_name, description, cost, item_type, effect, duration_hours, required_level) VALUES
('personal_xp_boost_24h', '24h Personal XP Boost', 'Your game plays give 2x guild XP for 24 hours', 500, 'boost', '{"xp_multiplier": 2.0}', 24, 1),
('personal_xp_boost_7d', '7-Day Personal XP Boost', 'Your game plays give 2x guild XP for 7 days', 2000, 'boost', '{"xp_multiplier": 2.0}', 168, 5),
('luck_charm_1h', '1h Lucky Charm', '+5% better odds on all games for 1 hour', 300, 'boost', '{"luck_bonus": 0.05}', 1, 1),
('luck_charm_24h', '24h Lucky Charm', '+5% better odds on all games for 24 hours', 1500, 'boost', '{"luck_bonus": 0.05}', 24, 3),
('winnings_boost_1h', '1h Winnings Boost', '+10% extra winnings on all games for 1 hour', 400, 'boost', '{"winnings_multiplier": 1.10}', 1, 1),
('winnings_boost_24h', '24h Winnings Boost', '+10% extra winnings on all games for 24 hours', 2000, 'boost', '{"winnings_multiplier": 1.10}', 24, 5),
('guild_badge_gold', 'Golden Guild Badge', 'Show off with a trophy badge next to your name', 1000, 'cosmetic', '{"badge": "trophy"}', NULL, 3),
('guild_badge_diamond', 'Diamond Guild Badge', 'Exclusive diamond badge next to your name', 2500, 'cosmetic', '{"badge": "diamond"}', NULL, 10),
('guild_badge_crown', 'Royal Crown Badge', 'Prestigious crown badge next to your name', 5000, 'cosmetic', '{"badge": "crown"}', NULL, 15),
('custom_title', 'Custom Title', 'Set a custom title displayed in your profile', 750, 'cosmetic', '{"allows_custom_title": true}', NULL, 5),
('instant_daily_reset', 'Daily Reset Token', 'Instantly reset your daily cooldown', 200, 'consumable', '{"resets": "daily"}', NULL, 1),
('instant_work_reset', 'Work Reset Token', 'Instantly reset your work cooldown', 150, 'consumable', '{"resets": "work"}', NULL, 1),
('work_double', 'Overtime Pass', 'Your next work command gives double rewards', 150, 'consumable', '{"work_multiplier": 2.0, "uses": 1}', NULL, 1),
('daily_double', 'Fortune Cookie', 'Your next daily command gives double rewards', 200, 'consumable', '{"daily_multiplier": 2.0, "uses": 1}', NULL, 1),
('heist_insurance', 'Heist Insurance', 'Protects you from losing money on your next failed heist', 500, 'consumable', '{"heist_protection": true, "uses": 1}', NULL, 5),
('jackpot_ticket', 'Jackpot Ticket', '+50% jackpot win chance on your next 10 slot spins', 800, 'consumable', '{"jackpot_boost": 0.5, "uses": 10}', NULL, 8)
ON CONFLICT (item_key) DO NOTHING;

-- ============================================================
-- DONE
-- ============================================================
