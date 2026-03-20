-- Migration: Guild Events System
-- Phase 4: Boss Raids, Casino Domination, Heist Festival

-- Guild events table (tracks all active and past events)
CREATE TABLE IF NOT EXISTS guild_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL, -- 'boss_raid', 'casino_domination', 'heist_festival'
    event_name VARCHAR(200) NOT NULL,
    description TEXT,
    start_time BIGINT NOT NULL,
    end_time BIGINT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    is_global BOOLEAN DEFAULT true, -- true = all guilds, false = specific guilds
    reward_pool BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_guild_events_type ON guild_events(event_type);
CREATE INDEX IF NOT EXISTS idx_guild_events_active ON guild_events(is_active);
CREATE INDEX IF NOT EXISTS idx_guild_events_time ON guild_events(start_time, end_time);

-- Guild event participation (tracks guild participation in events)
CREATE TABLE IF NOT EXISTS guild_event_participation (
    id SERIAL PRIMARY KEY,
    event_id INTEGER REFERENCES guild_events(id) ON DELETE CASCADE,
    guild_id INTEGER REFERENCES guilds(id) ON DELETE CASCADE,
    score BIGINT DEFAULT 0, -- damage dealt, winnings earned, heists completed, etc
    rank INTEGER DEFAULT 0, -- placement in event leaderboard
    reward_claimed BOOLEAN DEFAULT false,
    joined_at BIGINT NOT NULL,
    UNIQUE(event_id, guild_id)
);

CREATE INDEX IF NOT EXISTS idx_event_participation_event ON guild_event_participation(event_id);
CREATE INDEX IF NOT EXISTS idx_event_participation_guild ON guild_event_participation(guild_id);
CREATE INDEX IF NOT EXISTS idx_event_participation_score ON guild_event_participation(event_id, score DESC);

-- Member contributions to guild events
CREATE TABLE IF NOT EXISTS guild_event_member_contributions (
    id SERIAL PRIMARY KEY,
    event_id INTEGER REFERENCES guild_events(id) ON DELETE CASCADE,
    guild_id INTEGER REFERENCES guilds(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    contribution_amount BIGINT DEFAULT 0, -- damage, winnings, heists, etc
    participation_count INTEGER DEFAULT 0, -- number of actions taken
    last_contribution BIGINT,
    UNIQUE(event_id, guild_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_member_event ON guild_event_member_contributions(event_id);
CREATE INDEX IF NOT EXISTS idx_event_member_guild ON guild_event_member_contributions(guild_id);
CREATE INDEX IF NOT EXISTS idx_event_member_user ON guild_event_member_contributions(user_id);

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

-- Event rewards log
CREATE TABLE IF NOT EXISTS guild_event_rewards (
    id SERIAL PRIMARY KEY,
    event_id INTEGER REFERENCES guild_events(id) ON DELETE CASCADE,
    guild_id INTEGER REFERENCES guilds(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    reward_type VARCHAR(50) NOT NULL, -- 'money', 'xp', 'contribution_points', 'shop_item'
    reward_amount BIGINT DEFAULT 0,
    reward_item VARCHAR(100),
    claimed_at BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_event_rewards_event ON guild_event_rewards(event_id);
CREATE INDEX IF NOT EXISTS idx_event_rewards_guild ON guild_event_rewards(guild_id);
CREATE INDEX IF NOT EXISTS idx_event_rewards_user ON guild_event_rewards(user_id);

-- Comments for documentation
-- Guild leaderboard rewards (season-end and weekly)
CREATE TABLE IF NOT EXISTS guild_rewards (
    id SERIAL PRIMARY KEY,
    guild_id INTEGER REFERENCES guilds(id) ON DELETE CASCADE,
    reward_type VARCHAR(50) NOT NULL, -- 'season_end', 'weekly'
    reward_data JSONB NOT NULL, -- reward details (money, points, items, etc)
    reason TEXT,
    created_at BIGINT NOT NULL,
    created_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_guild_rewards_guild ON guild_rewards(guild_id);
CREATE INDEX IF NOT EXISTS idx_guild_rewards_type ON guild_rewards(reward_type);
CREATE INDEX IF NOT EXISTS idx_guild_rewards_created ON guild_rewards(created_at DESC);

COMMENT ON TABLE guild_events IS 'Stores all guild events (boss raids, casino domination, heist festival)';
COMMENT ON TABLE guild_event_participation IS 'Tracks which guilds are participating in events and their scores';
COMMENT ON TABLE guild_event_member_contributions IS 'Individual member contributions to guild events';
COMMENT ON TABLE guild_boss_raids IS 'Boss raid specific data including boss HP and defeat status';
COMMENT ON TABLE guild_casino_domination IS 'Casino domination competition tracking (total winnings)';
COMMENT ON TABLE guild_heist_festival IS 'Heist festival tracking (heists completed during event)';
COMMENT ON TABLE guild_event_rewards IS 'Log of all rewards distributed from events';
COMMENT ON TABLE guild_rewards IS 'Season-end and weekly leaderboard rewards for top guilds';
