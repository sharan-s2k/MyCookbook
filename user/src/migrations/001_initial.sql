-- Create users_profile table
CREATE TABLE IF NOT EXISTS users_profile (
  id UUID PRIMARY KEY,
  username TEXT UNIQUE NULL,
  display_name TEXT NULL,
  bio TEXT NULL,
  avatar_url TEXT NULL,
  preferences JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_profile_username ON users_profile(username) WHERE username IS NOT NULL;

