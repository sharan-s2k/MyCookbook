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

-- Create user_follows table for follow relationships
CREATE TABLE IF NOT EXISTS user_follows (
  follower_id UUID NOT NULL,
  following_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  FOREIGN KEY (follower_id) REFERENCES users_profile(id) ON DELETE CASCADE,
  FOREIGN KEY (following_id) REFERENCES users_profile(id) ON DELETE CASCADE,
  CHECK (follower_id != following_id) -- Prevent self-follow
);

CREATE INDEX IF NOT EXISTS idx_user_follows_follower ON user_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_user_follows_following ON user_follows(following_id);
