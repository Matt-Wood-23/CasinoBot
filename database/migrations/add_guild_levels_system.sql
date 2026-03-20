-- Migration: Add Guild Levels System
-- Date: 2025-11-01
-- Description: Adds guild level progression, XP tracking, perks, weekly challenges, and seasonal system

-- ==========================================
-- 1. UPDATE GUILDS TABLE
-- ==========================================

-- Add guild level progression columns
ALTER TABLE guilds
ADD COLUMN IF NOT EXISTS experience BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS season_id INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS legacy_points INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS season_max_level INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS last_level_up BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000;

-- Add index for season leaderboards
CREATE INDEX IF NOT EXISTS idx_guilds_season_level ON guilds(season_id, level DESC, experience DESC);

-- ==========================================
-- 2. GUILD EXPERIENCE LOG TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS guild_experience_log (
    id SERIAL PRIMARY KEY,
    guild_id INTEGER REFERENCES guilds(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    amount INTEGER NOT NULL,
    source VARCHAR(50) NOT NULL, -- 'game_played', 'money_wagered', 'heist_success', 'challenge', etc.
    details TEXT,
    timestamp BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000
);

CREATE INDEX IF NOT EXISTS idx_guild_exp_log_guild ON guild_experience_log(guild_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_guild_exp_log_source ON guild_experience_log(source);

-- ==========================================
-- 3. GUILD CHALLENGES TABLE
-- ==========================================

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

-- ==========================================
-- 4. GUILD SEASONS TABLE
-- ==========================================

CREATE TABLE IF NOT EXISTS guild_seasons (
    id SERIAL PRIMARY KEY,
    season_number INTEGER UNIQUE NOT NULL,
    start_date BIGINT NOT NULL,
    end_date BIGINT,
    is_active BOOLEAN DEFAULT TRUE
);

-- Insert the first season (active now)
INSERT INTO guild_seasons (season_number, start_date, is_active)
VALUES (1, EXTRACT(EPOCH FROM NOW())::BIGINT * 1000, TRUE)
ON CONFLICT (season_number) DO NOTHING;

-- ==========================================
-- 5. GUILD SEASON HISTORY TABLE
-- ==========================================

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

-- ==========================================
-- 6. UPDATE USER STATISTICS TABLE
-- ==========================================

-- Add guild-related XP contribution tracking
ALTER TABLE user_statistics
ADD COLUMN IF NOT EXISTS guild_xp_contributed BIGINT DEFAULT 0,
ADD COLUMN IF NOT EXISTS guild_challenges_completed INTEGER DEFAULT 0;

-- ==========================================
-- COMMENTS
-- ==========================================

COMMENT ON COLUMN guilds.experience IS 'Current guild XP in the active season';
COMMENT ON COLUMN guilds.season_id IS 'Current active season number';
COMMENT ON COLUMN guilds.legacy_points IS 'Permanent bonus points from past seasons (1-2% per season based on max level)';
COMMENT ON COLUMN guilds.season_max_level IS 'Highest level reached this season';
COMMENT ON COLUMN guilds.last_level_up IS 'Timestamp of last level increase';

COMMENT ON TABLE guild_experience_log IS 'Audit log of all guild XP gains';
COMMENT ON TABLE guild_challenges IS 'Weekly cooperative guild challenges progress';
COMMENT ON TABLE guild_seasons IS 'Guild competitive seasons (3-4 months each)';
COMMENT ON TABLE guild_season_history IS 'Historical record of guild performance by season';

-- ==========================================
-- MIGRATION COMPLETE
-- ==========================================
