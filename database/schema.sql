-- CasinoBot PostgreSQL Database Schema
-- This schema mirrors the structure from blackjack_data.json

-- Drop tables if they exist (for clean re-runs)
DROP TABLE IF EXISTS game_history CASCADE;
DROP TABLE IF EXISTS user_challenges CASCADE;
DROP TABLE IF EXISTS user_achievements CASCADE;
DROP TABLE IF EXISTS user_achievement_progress CASCADE;
DROP TABLE IF EXISTS user_properties CASCADE;
DROP TABLE IF EXISTS user_boosts CASCADE;
DROP TABLE IF EXISTS user_inventory CASCADE;
DROP TABLE IF EXISTS guild_heist_stats CASCADE;
DROP TABLE IF EXISTS user_heist_debt CASCADE;
DROP TABLE IF EXISTS user_heist_stats CASCADE;
DROP TABLE IF EXISTS guild_members CASCADE;
DROP TABLE IF EXISTS guilds CASCADE;
DROP TABLE IF EXISTS loans CASCADE;
DROP TABLE IF EXISTS user_vip CASCADE;
DROP TABLE IF EXISTS user_statistics CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Users table (core user data)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    discord_id VARCHAR(50) UNIQUE NOT NULL,
    money BIGINT NOT NULL DEFAULT 500,
    last_daily BIGINT DEFAULT 0,
    last_work BIGINT DEFAULT 0,
    credit_score INTEGER DEFAULT 500,
    gambling_ban_until BIGINT DEFAULT 0,
    gifts_received INTEGER DEFAULT 0,
    gifts_sent INTEGER DEFAULT 0,
    total_gifts_received BIGINT DEFAULT 0,
    total_gifts_sent BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_discord_id ON users(discord_id);

-- User statistics table (1:1 with users)
CREATE TABLE user_statistics (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    games_played INTEGER DEFAULT 0,
    games_won INTEGER DEFAULT 0,
    total_wagered BIGINT DEFAULT 0,
    total_winnings BIGINT DEFAULT 0,
    biggest_win BIGINT DEFAULT 0,
    biggest_loss BIGINT DEFAULT 0,
    blackjacks INTEGER DEFAULT 0,
    hands_played INTEGER DEFAULT 0,

    -- Slots stats
    slots_spins INTEGER DEFAULT 0,
    slots_wins INTEGER DEFAULT 0,

    -- Three Card Poker stats
    three_card_poker_games INTEGER DEFAULT 0,
    three_card_poker_wins INTEGER DEFAULT 0,

    -- Roulette stats
    roulette_spins INTEGER DEFAULT 0,
    roulette_wins INTEGER DEFAULT 0,
    roulette_numbers JSONB DEFAULT '{}',
    roulette_bets_placed INTEGER DEFAULT 0,

    -- Craps stats
    craps_games INTEGER DEFAULT 0,
    craps_wins INTEGER DEFAULT 0,

    -- War stats
    war_games INTEGER DEFAULT 0,
    war_wins INTEGER DEFAULT 0,

    -- Coinflip stats
    coinflip_games INTEGER DEFAULT 0,
    coinflip_wins INTEGER DEFAULT 0,

    -- Horse race stats
    horserace_games INTEGER DEFAULT 0,
    horserace_wins INTEGER DEFAULT 0,

    -- Crash stats
    crash_games INTEGER DEFAULT 0,
    crash_wins INTEGER DEFAULT 0,

    -- Hi-Lo stats
    hilo_games INTEGER DEFAULT 0,
    hilo_wins INTEGER DEFAULT 0,
    hilo_max_streak INTEGER DEFAULT 0,

    -- Bingo stats
    bingo_games INTEGER DEFAULT 0,
    bingo_wins INTEGER DEFAULT 0,

    -- Work stats
    total_work_sessions INTEGER DEFAULT 0,
    total_work_earnings BIGINT DEFAULT 0,

    -- Property stats
    total_properties_owned INTEGER DEFAULT 0,
    total_property_income_collected BIGINT DEFAULT 0,
    total_property_value BIGINT DEFAULT 0,

    -- Shop stats
    total_items_purchased INTEGER DEFAULT 0,
    total_boosts_used INTEGER DEFAULT 0,
    total_spent_on_shop BIGINT DEFAULT 0,

    -- Achievement/Challenge stats
    total_achievements_unlocked INTEGER DEFAULT 0,
    total_challenges_completed INTEGER DEFAULT 0,
    total_challenge_rewards_earned BIGINT DEFAULT 0,

    -- Guild stats
    total_guild_contributions BIGINT DEFAULT 0,
    guild_heists_participated INTEGER DEFAULT 0,
    guild_heists_won INTEGER DEFAULT 0
);

-- Game history table (stores last 50 games per user, or all if migrating)
CREATE TABLE game_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    game_type VARCHAR(50) NOT NULL,
    bet BIGINT NOT NULL,
    winnings BIGINT NOT NULL,
    result VARCHAR(20) NOT NULL,
    details JSONB DEFAULT '{}',
    boosts_applied JSONB,
    original_winnings BIGINT,
    timestamp BIGINT NOT NULL,
    record_id DOUBLE PRECISION UNIQUE
);

CREATE INDEX idx_game_history_user_id ON game_history(user_id);
CREATE INDEX idx_game_history_timestamp ON game_history(timestamp DESC);

-- Loans table (active and historical loans)
CREATE TABLE loans (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL,
    interest_rate DECIMAL(5,2) NOT NULL,
    amount_owed BIGINT NOT NULL,
    original_amount BIGINT NOT NULL,
    due_date BIGINT NOT NULL,
    taken_at BIGINT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    repaid_at BIGINT,
    repaid_amount BIGINT DEFAULT 0,
    was_defaulted BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_loans_user_id ON loans(user_id);
CREATE INDEX idx_loans_active ON loans(is_active) WHERE is_active = TRUE;

-- Guilds table
CREATE TABLE guilds (
    id SERIAL PRIMARY KEY,
    guild_id VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    treasury BIGINT DEFAULT 0,
    created_at BIGINT NOT NULL,
    max_members INTEGER DEFAULT 10,
    level INTEGER DEFAULT 1
);

CREATE INDEX idx_guilds_guild_id ON guilds(guild_id);
CREATE INDEX idx_guilds_owner_id ON guilds(owner_id);

-- Guild members table (many-to-many relationship)
CREATE TABLE guild_members (
    guild_id INTEGER REFERENCES guilds(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    joined_at BIGINT NOT NULL,
    contributed_total BIGINT DEFAULT 0,
    PRIMARY KEY (guild_id, user_id)
);

CREATE INDEX idx_guild_members_user_id ON guild_members(user_id);

-- User inventory table (shop items)
CREATE TABLE user_inventory (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    item_id VARCHAR(50) NOT NULL,
    quantity INTEGER DEFAULT 1,
    acquired_at BIGINT NOT NULL
);

CREATE INDEX idx_inventory_user_id ON user_inventory(user_id);
CREATE INDEX idx_inventory_item_id ON user_inventory(item_id);

-- User active boosts table
CREATE TABLE user_boosts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    boost_type VARCHAR(50) NOT NULL,
    boost_value INTEGER NOT NULL,
    uses_remaining INTEGER DEFAULT 1,
    acquired_at BIGINT NOT NULL
);

CREATE INDEX idx_boosts_user_id ON user_boosts(user_id);

-- User achievements table
CREATE TABLE user_achievements (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    achievement_id VARCHAR(50) NOT NULL,
    unlocked_at BIGINT NOT NULL,
    PRIMARY KEY (user_id, achievement_id)
);

CREATE INDEX idx_achievements_user_id ON user_achievements(user_id);

-- User achievement progress table
CREATE TABLE user_achievement_progress (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    current_win_streak INTEGER DEFAULT 0,
    best_win_streak INTEGER DEFAULT 0,
    loans_repaid INTEGER DEFAULT 0,
    largest_loan_repaid BIGINT DEFAULT 0,
    work_shifts INTEGER DEFAULT 0,
    perfect_blackjacks INTEGER DEFAULT 0
);

CREATE INDEX idx_achievement_progress_user_id ON user_achievement_progress(user_id);

-- User challenges table (active challenges with progress)
CREATE TABLE user_challenges (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    challenge_id VARCHAR(50) NOT NULL,
    challenge_type VARCHAR(50) NOT NULL,
    challenge_name VARCHAR(100) NOT NULL,
    description TEXT,
    progress INTEGER DEFAULT 0,
    target INTEGER NOT NULL,
    reward BIGINT NOT NULL,
    period VARCHAR(20) NOT NULL, -- 'daily' or 'weekly'
    is_completed BOOLEAN DEFAULT FALSE,
    is_claimed BOOLEAN DEFAULT FALSE,
    started_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,
    completed_at BIGINT
);

CREATE INDEX idx_challenges_user_id ON user_challenges(user_id);
CREATE INDEX idx_challenges_active ON user_challenges(is_completed, expires_at);

-- User properties table (properties owned with upgrade levels)
CREATE TABLE user_properties (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    property_id VARCHAR(50) NOT NULL,
    upgrade_level INTEGER DEFAULT 0,
    last_collected BIGINT DEFAULT 0,
    last_upgraded BIGINT DEFAULT 0,
    purchased_at BIGINT NOT NULL,
    UNIQUE(user_id, property_id)
);

CREATE INDEX idx_properties_user_id ON user_properties(user_id);

-- User VIP table
CREATE TABLE user_vip (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    tier VARCHAR(20) NOT NULL,
    activated_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL,
    renewal_count INTEGER DEFAULT 0,
    last_weekly_bonus BIGINT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_vip_active ON user_vip(is_active, expires_at);

-- User heist statistics table (solo heist tracking)
CREATE TABLE user_heist_stats (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    last_heist BIGINT DEFAULT 0,
    cooldown_until BIGINT DEFAULT 0,
    total_heists INTEGER DEFAULT 0,
    successful_heists INTEGER DEFAULT 0,
    total_earned BIGINT DEFAULT 0,
    total_lost BIGINT DEFAULT 0,
    biggest_score BIGINT DEFAULT 0
);

CREATE INDEX idx_heist_stats_user_id ON user_heist_stats(user_id);

-- User heist debt table (separate from loans)
CREATE TABLE user_heist_debt (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    debt_amount BIGINT DEFAULT 0,
    total_debt_incurred BIGINT DEFAULT 0,
    total_debt_repaid BIGINT DEFAULT 0,
    last_payment_date BIGINT DEFAULT 0
);

CREATE INDEX idx_heist_debt_user_id ON user_heist_debt(user_id);

-- Guild heist statistics table
CREATE TABLE guild_heist_stats (
    guild_id INTEGER PRIMARY KEY REFERENCES guilds(id) ON DELETE CASCADE,
    last_heist BIGINT DEFAULT 0,
    cooldown_until BIGINT DEFAULT 0,
    total_heists INTEGER DEFAULT 0,
    successful_heists INTEGER DEFAULT 0
);

CREATE INDEX idx_guild_heist_stats_guild_id ON guild_heist_stats(guild_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-update updated_at on users table
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE users IS 'Core user data including money, dailies, and timestamps';
COMMENT ON TABLE user_statistics IS 'Comprehensive game statistics for each user';
COMMENT ON TABLE game_history IS 'Historical record of all games played';
COMMENT ON TABLE loans IS 'Active and historical loan records';
COMMENT ON TABLE guilds IS 'Guild information';
COMMENT ON TABLE guild_members IS 'Guild membership relationships';
COMMENT ON TABLE user_inventory IS 'Shop items owned by users';
COMMENT ON TABLE user_boosts IS 'Active boosts available to users';
COMMENT ON TABLE user_achievements IS 'Achievements unlocked by users';
COMMENT ON TABLE user_challenges IS 'Active and completed challenges';
COMMENT ON TABLE user_properties IS 'Properties owned by users with upgrade levels';
COMMENT ON TABLE user_vip IS 'VIP membership status';
COMMENT ON TABLE user_heist_stats IS 'Solo heist statistics and cooldowns';
COMMENT ON TABLE user_heist_debt IS 'Heist debt tracking (separate from loans)';
COMMENT ON TABLE guild_heist_stats IS 'Guild heist statistics and cooldowns';
