-- db/migrations/002_create_user_sessions.sql
CREATE TABLE IF NOT EXISTS user_sessions (
  user_id TEXT PRIMARY KEY,
  add_category TEXT,
  filter_category TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
