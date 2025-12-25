-- Create recipe_import_jobs table
CREATE TABLE IF NOT EXISTS recipe_import_jobs (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL,
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'READY', 'FAILED')),
  recipe_id UUID NULL UNIQUE,
  error_message TEXT NULL,
  transcript_segments JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipe_import_jobs_owner_id ON recipe_import_jobs(owner_id);
CREATE INDEX IF NOT EXISTS idx_recipe_import_jobs_status ON recipe_import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_recipe_import_jobs_created_at ON recipe_import_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recipe_import_jobs_transcript_segments ON recipe_import_jobs USING gin (transcript_segments);

-- Create recipes table
CREATE TABLE IF NOT EXISTS recipes (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  is_public BOOLEAN NOT NULL DEFAULT false,
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'READY',
  error_message TEXT NULL,
  ingredients JSONB NOT NULL,
  steps JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recipes_owner_id ON recipes(owner_id);
CREATE INDEX IF NOT EXISTS idx_recipes_source_ref ON recipes(source_ref);

-- Create recipe_raw_source table
CREATE TABLE IF NOT EXISTS recipe_raw_source (
  recipe_id UUID PRIMARY KEY,
  source_text TEXT NOT NULL,
  source_json JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);

