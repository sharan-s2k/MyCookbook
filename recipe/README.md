# Recipe Service

Recipe service for MyCookbook. Handles recipe import jobs, recipe storage, Kafka integration, and recipe CRUD operations.

## Overview

The Recipe Service manages recipe import jobs (asynchronous YouTube recipe extraction), stores recipes with structured ingredients and steps, and provides recipe CRUD operations. It integrates with Workers Service for async processing and Cookbook Service for recipe access control.

## Responsibilities

- **Recipe Import Jobs**: Create and manage asynchronous recipe import jobs from YouTube URLs
- **Recipe Storage**: Store recipes with structured ingredients (qty/unit/item) and steps (with timestamps)
- **Recipe CRUD**: Create, read, update, delete recipes
- **Kafka Integration**: Emit recipe events to Kafka for search indexing
- **Access Control**: Enforce recipe ownership and public cookbook visibility
- **Job Status Management**: Provide endpoints for workers to update job status and create recipes

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
- `is_public` (BOOLEAN, default: false) - Note: Privacy handled at cookbook level
- `source_type` (TEXT) - 'youtube'
- `source_ref` (TEXT) - YouTube URL
- `status` (TEXT, default: 'READY') - READY|DRAFT|FAILED
- `error_message` (TEXT, nullable)
- `ingredients` (JSONB) - Array of objects: `{qty: string, unit: string, item: string}`
- `steps` (JSONB) - Array of objects: `{index: number, text: string, timestamp_sec: number}`
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

**Indexes**:
- `owner_id` (for user's recipes queries)
- `source_ref` (for duplicate detection)

**recipe_raw_source**
- `recipe_id` (UUID, PK, FK to recipes)
- `source_text` (TEXT) - Raw transcript text
- `source_json` (JSONB, nullable) - Structured transcript with segments
- `created_at` (TIMESTAMPTZ)

**recipe_import_jobs**
- `id` (UUID, PK)
- `owner_id` (UUID)
- `source_type` (TEXT) - 'youtube'
- `source_ref` (TEXT) - YouTube URL
- `status` (TEXT) - QUEUED|RUNNING|READY|FAILED
- `recipe_id` (UUID, nullable, UNIQUE) - Created recipe ID
- `error_message` (TEXT, nullable)
- `transcript_segments` (JSONB, nullable) - Structured transcript segments
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

**Indexes**:
- `owner_id` (for user's jobs queries)
- `status` (for job status queries)
- `created_at DESC` (for job listing)
- `transcript_segments` (GIN index for text search)

## Architecture

- **Framework**: Fastify (TypeScript/Node.js)
- **Database**: PostgreSQL
- **Messaging**: Kafka (for job dispatch and recipe events)
- **Authentication**: Gateway token authentication
- **Port**: 8003 (default)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8003` | Service port |
| `DATABASE_URL` | **Required** | PostgreSQL connection string |
| `KAFKA_BROKERS` | **Required** | Comma-separated Kafka broker addresses |
| `KAFKA_TOPIC_JOBS` | `recipe.jobs` | Kafka topic for import jobs |
| `KAFKA_TOPIC_RECIPES` | `recipe.events` | Kafka topic for recipe events |
| `SERVICE_TOKEN` | **Required** | Token for service-to-service authentication |
| `GATEWAY_TOKEN` | `SERVICE_TOKEN` | Token for gateway authentication |
| `COOKBOOK_SERVICE_URL` | `http://cookbook:8006` | Cookbook service URL for access control checks |
| `DB_POOL_MAX` | `10` | Maximum database connections in pool |
| `HTTP_TIMEOUT_MS` | `3000` | HTTP timeout for internal service calls |

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

## API Endpoints

### Protected Endpoints (Require JWT via Gateway)

#### POST /import/youtube

Create a YouTube recipe import job. Jobs are processed asynchronously by Workers Service.

**Headers**: `Authorization: Bearer <access_token>` (via gateway)

**Request**:
```json
{
  "url": "https://www.youtube.com/watch?v=example"
}
```

**Response** (200 OK):
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "QUEUED"
}
```

**Example cURL**:
```bash
export ACCESS_TOKEN="your-access-token"

curl -X POST http://localhost:8080/api/recipes/import/youtube \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.youtube.com/watch?v=example"
  }' \
  -s | jq
```

#### GET /import-jobs/:job_id

Get import job status. Supports ETag-based caching and Retry-After headers for polling.

**Headers**: `Authorization: Bearer <access_token>` (via gateway)

**Query Parameters**:
- None (uses ETag/If-None-Match for caching)

**Response** (200 OK):
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "READY",
  "recipe_id": "550e8400-e29b-41d4-a716-446655440001",
  "error_message": null,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:05:00Z"
}
```

**Response** (304 Not Modified): If job hasn't changed (uses ETag)

**Response Headers**:
- `ETag`: Hash of job status (for caching)
- `Cache-Control`: `private, max-age=0, must-revalidate`
- `Retry-After`: Seconds to wait before next poll (for QUEUED/RUNNING jobs)

**Status Values**:
- `QUEUED`: Job created, waiting for worker
- `RUNNING`: Worker is processing
- `READY`: Recipe created successfully
- `FAILED`: Processing failed (see error_message)

**Example cURL**:
```bash
export JOB_ID="550e8400-e29b-41d4-a716-446655440000"

# First request
curl -X GET http://localhost:8080/api/recipes/import-jobs/$JOB_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s -D headers.txt | jq

# Subsequent request with ETag (304 if unchanged)
ETAG=$(grep -i etag headers.txt | cut -d' ' -f2 | tr -d '\r\n')
curl -X GET http://localhost:8080/api/recipes/import-jobs/$JOB_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "If-None-Match: $ETAG" \
  -s -w "\nStatus: %{http_code}\n" | jq
```

#### GET /recipes

List user's recipes.

**Headers**: `Authorization: Bearer <access_token>` (via gateway)

**Response** (200 OK):
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "title": "Perfect Chocolate Chip Cookies",
    "description": "A classic recipe",
    "source_type": "youtube",
    "source_ref": "https://www.youtube.com/watch?v=example",
    "ingredients": [
      {
        "qty": "2.5",
        "unit": "cup",
        "item": "all-purpose flour"
      }
    ],
    "steps": [
      {
        "index": 1,
        "text": "Preheat oven to 375°F",
        "timestamp_sec": 120
      }
    ],
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  }
]
```

**Example cURL**:
```bash
curl -X GET http://localhost:8080/api/recipes \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq
```

#### GET /recipes/:recipe_id

Get recipe details. Checks ownership and public cookbook membership.

**Headers**: `Authorization: Bearer <access_token>` (via gateway)

**Response** (200 OK): Recipe object (same format as list)

**Error Responses**:
- `400`: Invalid recipe ID format (not UUID)
- `403`: Recipe not owned by user and not in public cookbook
- `404`: Recipe not found

**Example cURL**:
```bash
export RECIPE_ID="550e8400-e29b-41d4-a716-446655440001"

curl -X GET http://localhost:8080/api/recipes/$RECIPE_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq
```

#### PATCH /recipes/:recipe_id

Update recipe (owner only).

**Headers**: `Authorization: Bearer <access_token>` (via gateway)

**Request**:
```json
{
  "title": "Updated Recipe Title",
  "description": "Updated description",
  "ingredients": [
    {
      "qty": "3",
      "unit": "cup",
      "item": "flour"
    }
  ],
  "steps": [
    {
      "index": 1,
      "text": "Updated step",
      "timestamp_sec": 100
    }
  ]
}
```

**Response** (200 OK): Updated recipe object

**Validation**:
- `title`: Cannot be empty if provided
- `ingredients`: Must be array of objects with `qty`, `unit`, `item` (all strings, qty non-empty)
- `steps`: Must be array of objects with `index`, `text`, `timestamp_sec`

**Example cURL**:
```bash
curl -X PATCH http://localhost:8080/api/recipes/$RECIPE_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Title",
    "description": "Updated description"
  }' \
  -s | jq
```

#### DELETE /recipes/:recipe_id

Delete recipe (owner only). Emits `recipe.deleted` event and notifies Cookbook Service for cleanup.

**Headers**: `Authorization: Bearer <access_token>` (via gateway)

**Response** (200 OK):
```json
{
  "success": true
}
```

**Example cURL**:
```bash
curl -X DELETE http://localhost:8080/api/recipes/$RECIPE_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq
```

### Internal Endpoints (Service-to-Service)

These endpoints are called by Workers Service and require `x-service-token` header.

#### POST /internal/import-jobs/:job_id/status

Update import job status. Enforces monotonic state transitions.

**Headers**: `x-service-token: <service-token>`

**Request**:
```json
{
  "status": "RUNNING" | "FAILED" | "READY",
  "error_message": "Optional error message",
  "recipe_id": "Optional recipe ID (for READY status)"
}
```

**State Transitions**:
- `QUEUED` → `RUNNING`, `FAILED`
- `RUNNING` → `READY`, `FAILED`
- Terminal states (`READY`, `FAILED`) cannot be changed

**Example cURL**:
```bash
export SERVICE_TOKEN="your-service-token"
export JOB_ID="550e8400-e29b-41d4-a716-446655440000"

curl -X POST http://localhost:8003/internal/import-jobs/$JOB_ID/status \
  -H "Content-Type: application/json" \
  -H "x-service-token: $SERVICE_TOKEN" \
  -d '{
    "status": "RUNNING"
  }' \
  -s | jq
```

#### POST /internal/recipes/from-import-job

Create recipe from import job. Called by Workers Service after AI extraction.

**Headers**: `x-service-token: <service-token>`

**Request**:
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "owner_id": "550e8400-e29b-41d4-a716-446655440002",
  "source_ref": "https://www.youtube.com/watch?v=example",
  "title": "Perfect Chocolate Chip Cookies",
  "description": "A classic recipe",
  "ingredients": [
    {
      "qty": "2.5",
      "unit": "cup",
      "item": "all-purpose flour"
    }
  ],
  "steps": [
    {
      "index": 1,
      "text": "Preheat oven to 375°F",
      "timestamp_sec": 120
    }
  ],
  "raw_transcript": "Full transcript text..."
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "recipe_id": "550e8400-e29b-41d4-a716-446655440001"
}
```

**Idempotent**: If recipe already exists for job, returns existing recipe_id.

#### POST /internal/import-jobs/:job_id/transcript

Store transcript segments for a job. Called by Workers Service after fetching transcript.

**Headers**: `x-service-token: <service-token>`

**Request**:
```json
{
  "provider": "yt-dlp",
  "lang": "en",
  "segments": [
    {
      "start": 0.0,
      "dur": 5.5,
      "text": "Hello and welcome..."
    }
  ],
  "transcript_text": "Full transcript text..."
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "segment_count": 150
}
```

#### GET /internal/recipes/:recipe_id/transcript

Get transcript for a recipe. Used by AI chat features.

**Headers**: `x-service-token: <service-token>`

**Response** (200 OK):
```json
{
  "provider": "yt-dlp",
  "lang": "en",
  "transcript_text": "Full transcript...",
  "segments": [
    {
      "start": 0.0,
      "dur": 5.5,
      "text": "Hello and welcome..."
    }
  ]
}
```

#### GET /internal/recipes/all

Get all recipes (for reindexing). Called by Search Service.

**Headers**: `x-service-token: <service-token>`

**Response** (200 OK): Array of recipe objects

### Health Endpoint

#### GET /health

Health check endpoint.

**Response** (200 OK):
```json
{
  "status": "healthy"
}
```

## Running Locally

### Prerequisites

- Node.js 18+
- PostgreSQL 12+
- Kafka (for job processing)
- TypeScript

### Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up database**:
   ```bash
   # Start PostgreSQL (using docker-compose)
   docker compose up -d recipe-db

   # Run migrations
   npm run migrate
   ```

3. **Set environment variables**:
   ```bash
   export DATABASE_URL="postgresql://user:password@localhost:5432/recipe_db"
   export KAFKA_BROKERS="localhost:9092"
   export KAFKA_TOPIC_JOBS="recipe.jobs"
   export SERVICE_TOKEN="your-service-token"
   export GATEWAY_TOKEN="your-gateway-token"
   export COOKBOOK_SERVICE_URL="http://localhost:8006"
   export PORT=8003
   ```

4. **Run the service**:
   ```bash
   npm run dev
   ```

Or using Docker:

```bash
docker compose up --build
```

## Testing

### Complete Recipe Import Flow

```bash
export ACCESS_TOKEN="your-access-token"

# 1. Create import job
JOB_RESPONSE=$(curl -X POST http://localhost:8080/api/recipes/import/youtube \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.youtube.com/watch?v=example"
  }' \
  -s)

JOB_ID=$(echo $JOB_RESPONSE | jq -r '.job_id')
echo "Job ID: $JOB_ID"

# 2. Poll job status (with ETag support)
while true; do
  STATUS_RESPONSE=$(curl -X GET http://localhost:8080/api/recipes/import-jobs/$JOB_ID \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -s -D headers.txt)
  
  STATUS=$(echo $STATUS_RESPONSE | jq -r '.status')
  echo "Job Status: $STATUS"
  
  if [ "$STATUS" == "READY" ]; then
    RECIPE_ID=$(echo $STATUS_RESPONSE | jq -r '.recipe_id')
    echo "Recipe ID: $RECIPE_ID"
    break
  elif [ "$STATUS" == "FAILED" ]; then
    ERROR=$(echo $STATUS_RESPONSE | jq -r '.error_message')
    echo "Job Failed: $ERROR"
    break
  fi
  
  # Use Retry-After header if present
  RETRY_AFTER=$(grep -i retry-after headers.txt | cut -d' ' -f2 | tr -d '\r\n')
  sleep ${RETRY_AFTER:-3}
done

# 3. Get created recipe
curl -X GET http://localhost:8080/api/recipes/$RECIPE_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq
```

### Testing Recipe CRUD

```bash
# List recipes
curl -X GET http://localhost:8080/api/recipes \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq

# Get specific recipe
export RECIPE_ID="550e8400-e29b-41d4-a716-446655440001"
curl -X GET http://localhost:8080/api/recipes/$RECIPE_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq

# Update recipe
curl -X PATCH http://localhost:8080/api/recipes/$RECIPE_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Recipe Title",
    "ingredients": [
      {"qty": "3", "unit": "cup", "item": "flour"},
      {"qty": "To taste", "unit": "", "item": "salt"}
    ],
    "steps": [
      {"index": 1, "text": "Mix ingredients", "timestamp_sec": 0}
    ]
  }' \
  -s | jq

# Delete recipe
curl -X DELETE http://localhost:8080/api/recipes/$RECIPE_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq
```

## Docker Deployment

### Build and Run

```bash
# Build image
docker build -t recipe-service .

# Run container
docker run -p 8003:8003 \
  -e DATABASE_URL="postgresql://user:password@host:5432/recipe_db" \
  -e KAFKA_BROKERS="kafka:9092" \
  -e KAFKA_TOPIC_JOBS="recipe.jobs" \
  -e SERVICE_TOKEN="your-service-token" \
  recipe-service
```

### Docker Compose

The service includes a `docker-compose.yml` for standalone deployment with database.

## Kafka Integration

### Event Emission

The service emits recipe events to Kafka:

- **Topic**: `recipe.events` (configurable via `KAFKA_TOPIC_RECIPES`)
- **Events**:
  - `recipe.created`: When a recipe is created from import job
  - `recipe.updated`: When a recipe is updated
  - `recipe.deleted`: When a recipe is deleted

**Event Format**:
```json
{
  "event": "recipe.created",
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "owner_id": "550e8400-e29b-41d4-a716-446655440002",
  "title": "Perfect Chocolate Chip Cookies",
  "description": "A classic recipe",
  "source_type": "youtube",
  "source_ref": "https://www.youtube.com/watch?v=example",
  "ingredients": [...],
  "steps": [...],
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

## Security Considerations

1. **Gateway Token**: All protected endpoints verify `x-gateway-token` header
2. **Service Token**: Internal endpoints require `x-service-token` header
3. **User ID**: Extracted from gateway (verified JWT), never from client
4. **Access Control**: Recipes are private unless in a public cookbook (checked via Cookbook Service)
5. **SQL Injection**: All queries use parameterized statements
6. **UUID Validation**: Recipe IDs validated as UUIDs before database queries

## Migration

Migrations are automatically run on container startup. To run manually:

```bash
npm run migrate
```

Migration file: `src/migrations/001_initial.sql`

Creates:
- `recipe_import_jobs` table
- `recipes` table
- `recipe_raw_source` table
- Required indexes and constraints

See [Design.md](./Design.md) for detailed architecture and integration patterns.

