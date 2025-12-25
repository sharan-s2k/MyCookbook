# Recipe Service

Recipe service for MyCookbook. Handles recipe import jobs, recipe storage, and Kafka integration.

## Responsibilities

- Create and manage recipe import jobs
- Store recipes with ingredients and steps
- Emit Kafka messages for async processing
- Provide internal endpoints for workers to update job status and create recipes

## Database

PostgreSQL database: `recipe_db`

### Schema

**recipe_import_jobs**
- `id` (UUID, PK)
- `owner_id` (UUID)
- `source_type` (TEXT) - 'youtube'
- `source_ref` (TEXT) - YouTube URL
- `status` (TEXT) - QUEUED|RUNNING|READY|FAILED
- `recipe_id` (UUID, nullable)
- `error_message` (TEXT, nullable)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

**recipes**
- `id` (UUID, PK)
- `owner_id` (UUID)
- `title` (TEXT)
- `description` (TEXT, nullable)
- `is_public` (BOOLEAN, default: false)
- `source_type` (TEXT)
- `source_ref` (TEXT)
- `status` (TEXT, default: 'READY')
- `error_message` (TEXT, nullable)
- `ingredients` (JSONB) - Array of strings
- `steps` (JSONB) - Array of {index, text, timestamp_sec}
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

**recipe_raw_source**
- `recipe_id` (UUID, PK, FK to recipes)
- `source_text` (TEXT) - Raw transcript
- `created_at` (TIMESTAMP)

## Environment Variables

- `PORT` - Service port (default: 8003)
- `DATABASE_URL` - PostgreSQL connection string
- `KAFKA_BROKERS` - Comma-separated Kafka broker addresses
- `KAFKA_TOPIC_JOBS` - Kafka topic for import jobs (default: recipe.jobs)
- `SERVICE_TOKEN` - Token for service-to-service authentication

## API Endpoints

### POST /import/youtube (Protected)
Create a YouTube recipe import job.

**Request:**
```json
{
  "url": "https://www.youtube.com/watch?v=..."
}
```

**Response:**
```json
{
  "job_id": "...",
  "status": "QUEUED"
}
```

### GET /import-jobs/:job_id (Protected)
Get import job status.

**Response:**
```json
{
  "job_id": "...",
  "status": "READY",
  "recipe_id": "...",
  "error_message": null,
  "created_at": "...",
  "updated_at": "..."
}
```

### GET /:recipe_id (Protected)
Get recipe details.

**Response:**
```json
{
  "id": "...",
  "title": "...",
  "description": "...",
  "is_public": false,
  "source_type": "youtube",
  "source_ref": "...",
  "ingredients": ["..."],
  "steps": [
    {
      "index": 1,
      "text": "...",
      "timestamp_sec": 123
    }
  ],
  "created_at": "...",
  "updated_at": "..."
}
```

### POST /internal/import-jobs/:job_id/status (Internal)
Update import job status. Called by workers.

**Headers:**
- `x-service-token`: Service authentication token

**Request:**
```json
{
  "status": "RUNNING" | "FAILED" | "READY",
  "error_message": "...",
  "recipe_id": "..."
}
```

### POST /internal/recipes/from-import-job (Internal)
Create recipe from import job. Called by workers.

**Headers:**
- `x-service-token`: Service authentication token

**Request:**
```json
{
  "job_id": "...",
  "owner_id": "...",
  "source_ref": "...",
  "title": "...",
  "description": "...",
  "ingredients": ["..."],
  "steps": [
    {
      "index": 1,
      "text": "...",
      "timestamp_sec": 123
    }
  ],
  "raw_transcript": "..."
}
```

## Running Standalone

1. **Start database:**
   ```bash
   docker compose up -d recipe-db
   ```

2. **Start Kafka** (or use external):
   ```bash
   # Use docker-compose.local.yml or external Kafka
   ```

3. **Run migrations:**
   ```bash
   npm run migrate
   ```

4. **Start service:**
   ```bash
   npm run dev
   ```

Or use docker compose:
```bash
docker compose up --build
```

## Migrations

Migrations run automatically on container startup. To run manually:

```bash
npm run migrate
```

