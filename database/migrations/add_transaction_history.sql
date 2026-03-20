-- Migration: Add Transaction History System
-- Description: Tracks all money transactions (loans, gifts, purchases, admin actions)
-- Date: 2025

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
    transaction_id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    transaction_type TEXT NOT NULL, -- 'loan_taken', 'loan_repayment', 'gift_sent', 'gift_received', 'shop_purchase', 'property_purchase', 'vip_purchase', 'admin_give', 'admin_take', 'work', 'daily', 'weekly', 'welfare', 'game_win', 'game_loss'
    amount BIGINT NOT NULL, -- Positive for gains, negative for losses/expenses
    balance_after BIGINT NOT NULL, -- User's balance after transaction
    related_user_id TEXT, -- For gifts (sender/receiver), admin actions (admin ID)
    description TEXT, -- Human-readable description
    metadata JSONB, -- Additional data (item purchased, game played, etc.)
    created_at BIGINT NOT NULL, -- Unix timestamp
    FOREIGN KEY (user_id) REFERENCES users(discord_id) ON DELETE CASCADE
);

-- Create index for faster queries by user
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);

-- Create index for faster queries by type
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type);

-- Create index for faster date range queries
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);

-- Create composite index for user + date queries
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, created_at DESC);
