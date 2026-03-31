-- Migration: Add Guild Rewards Table
-- Description: Creates the guild_rewards log table used by the weekly/season reward distribution system

CREATE TABLE IF NOT EXISTS guild_rewards (
    id SERIAL PRIMARY KEY,
    guild_id INTEGER REFERENCES guilds(id) ON DELETE CASCADE,
    reward_type VARCHAR(50) NOT NULL,  -- 'weekly', 'season_end'
    reward_data JSONB,
    reason TEXT,
    created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_guild_rewards_guild ON guild_rewards(guild_id, created_at DESC);
