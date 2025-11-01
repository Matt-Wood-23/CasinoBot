-- Progressive Jackpot Table
CREATE TABLE IF NOT EXISTS progressive_jackpot (
    id SERIAL PRIMARY KEY,
    server_id VARCHAR(255) UNIQUE NOT NULL,
    current_amount INTEGER DEFAULT 0,
    last_winner_id VARCHAR(255),
    last_winner_amount INTEGER DEFAULT 0,
    last_won_at BIGINT DEFAULT 0,
    total_contributed INTEGER DEFAULT 0,
    times_won INTEGER DEFAULT 0,
    created_at BIGINT DEFAULT 0
);

-- Add login streak columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_streak INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS best_login_streak INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_streak_claim BIGINT DEFAULT 0;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_progressive_jackpot_server ON progressive_jackpot(server_id);
CREATE INDEX IF NOT EXISTS idx_users_login_streak ON users(login_streak);

-- Insert default jackpot for existing servers (you may need to update server_id manually)
-- INSERT INTO progressive_jackpot (server_id, current_amount, created_at)
-- VALUES ('YOUR_SERVER_ID_HERE', 0, EXTRACT(EPOCH FROM NOW()) * 1000)
-- ON CONFLICT (server_id) DO NOTHING;
