-- Migration: Add metadata column to user_challenges
-- Enables unique_games challenge type to track which game types have been played
ALTER TABLE user_challenges ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
