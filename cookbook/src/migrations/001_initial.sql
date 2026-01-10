-- Create cookbooks table
CREATE TABLE IF NOT EXISTS cookbooks (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  visibility TEXT NOT NULL DEFAULT 'PRIVATE' CHECK (visibility IN ('PRIVATE', 'PUBLIC')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cookbooks_owner_id ON cookbooks(owner_id);
CREATE INDEX IF NOT EXISTS idx_cookbooks_visibility ON cookbooks(visibility);
-- Composite index for feed query: filters by owner_id (ANY array), visibility='PUBLIC', orders by updated_at DESC, id DESC
-- This index optimizes the feed query: WHERE owner_id = ANY(...) AND visibility = 'PUBLIC' ORDER BY updated_at DESC, id DESC
CREATE INDEX IF NOT EXISTS idx_cookbooks_public_owner_updated_at_id ON cookbooks(owner_id, updated_at DESC, id DESC) WHERE visibility = 'PUBLIC';

-- Create cookbook_recipes junction table (many-to-many)
CREATE TABLE IF NOT EXISTS cookbook_recipes (
  cookbook_id UUID NOT NULL REFERENCES cookbooks(id) ON DELETE CASCADE,
  recipe_id UUID NOT NULL,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cookbook_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_cookbook_recipes_cookbook_id ON cookbook_recipes(cookbook_id);
CREATE INDEX IF NOT EXISTS idx_cookbook_recipes_recipe_id ON cookbook_recipes(recipe_id);

-- Create cookbook_saves table (users saving other users' public cookbooks)
CREATE TABLE IF NOT EXISTS cookbook_saves (
  user_id UUID NOT NULL,
  cookbook_id UUID NOT NULL REFERENCES cookbooks(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, cookbook_id)
);

CREATE INDEX IF NOT EXISTS idx_cookbook_saves_user_id ON cookbook_saves(user_id);
CREATE INDEX IF NOT EXISTS idx_cookbook_saves_cookbook_id ON cookbook_saves(cookbook_id);
