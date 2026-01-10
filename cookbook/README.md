# Cookbook Service

Cookbook service for MyCookbook. Handles cookbook creation, management, recipe membership, and saved cookbooks.

## Overview

The Cookbook Service manages cookbooks (collections of recipes), recipe membership within cookbooks, and saved cookbooks (users saving other users' public cookbooks). It enforces privacy rules (PRIVATE by default, PUBLIC for sharing) and provides access control for recipe visibility.

## Responsibilities

- **Cookbook Management**: Create, read, update, delete cookbooks
- **Recipe Membership**: Manage which recipes belong to which cookbooks (many-to-many)
- **Saved Cookbooks**: Handle users saving other users' public cookbooks (bookmark behavior)
- **Privacy Rules**: Enforce PRIVATE (default) and PUBLIC visibility
- **Access Control**: Enforce ownership rules for cookbook operations

## Database

PostgreSQL database: `cookbook_db`

### Schema

**cookbooks**
- `id` (UUID, PK)
- `owner_id` (UUID)
- `title` (TEXT)
- `description` (TEXT, nullable)
- `visibility` (TEXT) - 'PRIVATE' or 'PUBLIC', default: 'PRIVATE'
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

**cookbook_recipes**
- `cookbook_id` (UUID, FK to cookbooks)
- `recipe_id` (UUID)
- `added_at` (TIMESTAMPTZ)
- Primary key: (cookbook_id, recipe_id)

**cookbook_saves**
- `user_id` (UUID)
- `cookbook_id` (UUID, FK to cookbooks)
- `saved_at` (TIMESTAMPTZ)
- Primary key: (user_id, cookbook_id)

## Architecture

- **Framework**: Fastify (TypeScript/Node.js)
- **Database**: PostgreSQL
- **Authentication**: Gateway token authentication
- **Port**: 8006 (default)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8006` | Service port |
| `DATABASE_URL` | **Required** | PostgreSQL connection string |
| `SERVICE_TOKEN` | **Required** | Token for service-to-service authentication |
| `GATEWAY_TOKEN` | `SERVICE_TOKEN` | Token for gateway authentication |
| `RECIPE_SERVICE_URL` | `http://recipe:8003` | Recipe service URL (for future recipe verification) |
| `DB_POOL_MAX` | `10` | Maximum database connections in pool |

## API Endpoints

### GET /cookbooks (Protected)
List user's cookbooks (owned and saved).

**Response:**
```json
{
  "owned": [
    {
      "id": "...",
      "owner_id": "...",
      "title": "...",
      "description": "...",
      "visibility": "PRIVATE",
      "recipe_count": 5,
      "created_at": "...",
      "updated_at": "...",
      "is_owner": true,
      "saved_at": null
    }
  ],
  "saved": [
    {
      "id": "...",
      "owner_id": "...",
      "title": "...",
      "description": "...",
      "visibility": "PUBLIC",
      "recipe_count": 10,
      "created_at": "...",
      "updated_at": "...",
      "is_owner": false,
      "saved_at": "..."
    }
  ]
}
```

### POST /cookbooks (Protected)
Create a new cookbook.

**Request:**
```json
{
  "title": "My Cookbook",
  "description": "Optional description",
  "visibility": "PRIVATE"
}
```

### GET /cookbooks/:cookbook_id (Protected)
Get cookbook details with recipe IDs.

**Response:**
```json
{
  "id": "...",
  "owner_id": "...",
  "title": "...",
  "description": "...",
  "visibility": "PUBLIC",
  "recipe_count": 5,
  "recipe_ids": ["...", "..."],
  "created_at": "...",
  "updated_at": "...",
  "is_owner": false
}
```

### PATCH /cookbooks/:cookbook_id (Protected)
Update cookbook (owner only).

### DELETE /cookbooks/:cookbook_id (Protected)
Delete cookbook (owner only).

### POST /cookbooks/:cookbook_id/save (Protected)
Save a public cookbook.

### DELETE /cookbooks/:cookbook_id/save (Protected)
Unsave a cookbook.

### POST /recipes/:recipe_id/cookbooks (Protected)
Set recipe membership across cookbooks in one call.

**Request:**
```json
{
  "cookbook_ids": ["...", "..."]
}
```

### GET /recipes/:recipe_id/cookbooks (Protected)
Get cookbook IDs that a recipe belongs to (user's cookbooks only).

### POST /internal/recipes/:recipe_id/delete (Internal)
Cleanup recipe from all cookbooks on deletion (called by recipe service).

## API Endpoints

### Protected Endpoints (Require JWT via Gateway)

All endpoints are accessed via the gateway at `http://localhost:8080/api/cookbooks/*`.

#### GET /cookbooks

List user's cookbooks (owned and saved). Supports query parameter `?owner_id=UUID` to get public cookbooks for a specific user.

**Headers**: `Authorization: Bearer <access_token>` (via gateway)

**Query Parameters**:
- `owner_id` (optional): Get public cookbooks for a specific user

**Response** (200 OK):
```json
{
  "owned": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "owner_id": "550e8400-e29b-41d4-a716-446655440001",
      "title": "My Favorite Recipes",
      "description": "A collection of my favorites",
      "visibility": "PRIVATE",
      "recipe_count": 5,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z",
      "is_owner": true,
      "saved_at": null
    }
  ],
  "saved": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "owner_id": "550e8400-e29b-41d4-a716-446655440003",
      "title": "Public Cookbook",
      "description": "Shared recipes",
      "visibility": "PUBLIC",
      "recipe_count": 10,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-01T00:00:00Z",
      "is_owner": false,
      "saved_at": "2024-01-02T00:00:00Z"
    }
  ]
}
```

**Example cURL**:
```bash
export ACCESS_TOKEN="your-access-token"

# Get my cookbooks
curl -X GET http://localhost:8080/api/cookbooks \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq

# Get public cookbooks for a specific user
export USER_ID="550e8400-e29b-41d4-a716-446655440003"
curl -X GET "http://localhost:8080/api/cookbooks?owner_id=$USER_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq
```

#### POST /cookbooks

Create a new cookbook.

**Headers**: `Authorization: Bearer <access_token>` (via gateway)

**Request**:
```json
{
  "title": "My Cookbook",
  "description": "Optional description",
  "visibility": "PRIVATE"
}
```

**Validation**:
- `title`: Required, non-empty
- `visibility`: Must be `PRIVATE` or `PUBLIC` (defaults to `PRIVATE`)

**Response** (201 Created):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "owner_id": "550e8400-e29b-41d4-a716-446655440001",
  "title": "My Cookbook",
  "description": "Optional description",
  "visibility": "PRIVATE",
  "recipe_count": 0,
  "is_owner": true,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

**Example cURL**:
```bash
curl -X POST http://localhost:8080/api/cookbooks \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My Favorite Recipes",
    "description": "A collection of my favorites",
    "visibility": "PRIVATE"
  }' \
  -s | jq
```

#### GET /cookbooks/:cookbook_id

Get cookbook details with recipe IDs.

**Headers**: `Authorization: Bearer <access_token>` (via gateway)

**Response** (200 OK):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "owner_id": "550e8400-e29b-41d4-a716-446655440001",
  "title": "My Cookbook",
  "description": "Optional description",
  "visibility": "PUBLIC",
  "recipe_count": 5,
  "recipe_ids": [
    "550e8400-e29b-41d4-a716-446655440010",
    "550e8400-e29b-41d4-a716-446655440011"
  ],
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z",
  "is_owner": true
}
```

**Access Control**: Owner or public cookbook (403 Forbidden otherwise)

**Example cURL**:
```bash
export COOKBOOK_ID="550e8400-e29b-41d4-a716-446655440000"

curl -X GET http://localhost:8080/api/cookbooks/$COOKBOOK_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq
```

#### PATCH /cookbooks/:cookbook_id

Update cookbook (owner only).

**Headers**: `Authorization: Bearer <access_token>` (via gateway)

**Request**:
```json
{
  "title": "Updated Title",
  "description": "Updated description",
  "visibility": "PUBLIC"
}
```

**Response** (200 OK): Updated cookbook object

**Error Responses**:
- `403`: Not owner
- `400`: Validation errors (empty title, invalid visibility)

**Example cURL**:
```bash
curl -X PATCH http://localhost:8080/api/cookbooks/$COOKBOOK_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Title",
    "visibility": "PUBLIC"
  }' \
  -s | jq
```

#### DELETE /cookbooks/:cookbook_id

Delete cookbook (owner only).

**Headers**: `Authorization: Bearer <access_token>` (via gateway)

**Response** (200 OK):
```json
{
  "success": true
}
```

**Example cURL**:
```bash
curl -X DELETE http://localhost:8080/api/cookbooks/$COOKBOOK_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq
```

#### POST /cookbooks/:cookbook_id/save

Save a public cookbook (bookmark behavior).

**Headers**: `Authorization: Bearer <access_token>` (via gateway)

**Response** (200 OK):
```json
{
  "success": true
}
```

**Error Responses**:
- `403`: Cookbook is not public
- `400`: Cannot save your own cookbook
- `404`: Cookbook not found

**Example cURL**:
```bash
curl -X POST http://localhost:8080/api/cookbooks/$COOKBOOK_ID/save \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq
```

#### DELETE /cookbooks/:cookbook_id/save

Unsave a cookbook.

**Headers**: `Authorization: Bearer <access_token>` (via gateway)

**Response** (200 OK):
```json
{
  "success": true
}
```

**Example cURL**:
```bash
curl -X DELETE http://localhost:8080/api/cookbooks/$COOKBOOK_ID/save \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq
```

#### POST /cookbooks/recipes/:recipe_id/cookbooks

Set recipe membership across cookbooks in one call. Atomically replaces all cookbook memberships for a recipe.

**Headers**: `Authorization: Bearer <access_token>` (via gateway)

**Request**:
```json
{
  "cookbook_ids": [
    "550e8400-e29b-41d4-a716-446655440000",
    "550e8400-e29b-41d4-a716-446655440001"
  ]
}
```

**Response** (200 OK):
```json
{
  "success": true
}
```

**Validation**:
- All cookbook IDs must be valid UUIDs
- User must own all cookbooks being added to

**Example cURL**:
```bash
export RECIPE_ID="550e8400-e29b-41d4-a716-446655440010"

curl -X POST http://localhost:8080/api/cookbooks/recipes/$RECIPE_ID/cookbooks \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cookbook_ids": [
      "550e8400-e29b-41d4-a716-446655440000",
      "550e8400-e29b-41d4-a716-446655440001"
    ]
  }' \
  -s | jq
```

#### GET /cookbooks/recipes/:recipe_id/cookbooks

Get cookbook IDs that a recipe belongs to (user's cookbooks only).

**Headers**: `Authorization: Bearer <access_token>` (via gateway)

**Response** (200 OK):
```json
[
  "550e8400-e29b-41d4-a716-446655440000",
  "550e8400-e29b-41d4-a716-446655440001"
]
```

**Example cURL**:
```bash
curl -X GET http://localhost:8080/api/cookbooks/recipes/$RECIPE_ID/cookbooks \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq
```

### Internal Endpoints (Service-to-Service)

#### GET /internal/recipes/:recipe_id/public-check

Check if recipe is in a public cookbook. Called by Recipe Service for access control.

**Headers**: `x-service-token: <service-token>`

**Response** (200 OK):
```json
{
  "is_in_public_cookbook": true
}
```

#### GET /internal/cookbooks/public

Get public cookbooks by owner IDs with pagination. Called by Feed Service.

**Headers**: `x-service-token: <service-token>`

**Query Parameters**:
- `owner_ids` (required): Comma-separated list of owner IDs
- `limit` (optional): Number of items per page (default: 20, max: 50)
- `cursor_published_at` (optional): Cursor timestamp for pagination
- `cursor_id` (optional): Cursor ID for pagination

**Response** (200 OK): Array of cookbook objects (sorted by updated_at DESC, id DESC)

#### POST /internal/recipes/:recipe_id/delete

Cleanup recipe from all cookbooks on deletion. Called by Recipe Service when recipe is deleted.

**Headers**: `x-service-token: <service-token>`

**Response** (200 OK):
```json
{
  "success": true
}
```

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
- TypeScript

### Setup

1. **Install dependencies**:
```bash
npm install
   ```

2. **Set up database**:
   ```bash
   # Start PostgreSQL (using docker-compose)
   docker compose up -d cookbook-db

   # Run migrations
   npm run migrate
   ```

3. **Set environment variables**:
   ```bash
   export DATABASE_URL="postgresql://user:password@localhost:5432/cookbook_db"
   export SERVICE_TOKEN="your-service-token"
   export GATEWAY_TOKEN="your-gateway-token"
   export RECIPE_SERVICE_URL="http://localhost:8003"
   export PORT=8006
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

### Complete Cookbook Flow

```bash
export ACCESS_TOKEN="your-access-token"

# 1. Create cookbook
COOKBOOK_RESPONSE=$(curl -X POST http://localhost:8080/api/cookbooks \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My Favorite Recipes",
    "description": "A collection of my favorites",
    "visibility": "PRIVATE"
  }' \
  -s)

COOKBOOK_ID=$(echo $COOKBOOK_RESPONSE | jq -r '.id')
echo "Cookbook ID: $COOKBOOK_ID"

# 2. Get cookbook details
curl -X GET http://localhost:8080/api/cookbooks/$COOKBOOK_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq

# 3. Add recipe to cookbook (need recipe_id first)
export RECIPE_ID="550e8400-e29b-41d4-a716-446655440010"
curl -X POST http://localhost:8080/api/cookbooks/recipes/$RECIPE_ID/cookbooks \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"cookbook_ids\": [\"$COOKBOOK_ID\"]
  }" \
  -s | jq

# 4. Get recipe's cookbooks
curl -X GET http://localhost:8080/api/cookbooks/recipes/$RECIPE_ID/cookbooks \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq

# 5. Update cookbook (make it public)
curl -X PATCH http://localhost:8080/api/cookbooks/$COOKBOOK_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "visibility": "PUBLIC"
  }' \
  -s | jq

# 6. Save cookbook (as another user)
export OTHER_USER_TOKEN="other-user-access-token"
curl -X POST http://localhost:8080/api/cookbooks/$COOKBOOK_ID/save \
  -H "Authorization: Bearer $OTHER_USER_TOKEN" \
  -s | jq

# 7. List cookbooks (should show saved cookbook)
curl -X GET http://localhost:8080/api/cookbooks \
  -H "Authorization: Bearer $OTHER_USER_TOKEN" \
  -s | jq
```

## Docker Deployment

### Build and Run

```bash
# Build image
docker build -t cookbook-service .

# Run container
docker run -p 8006:8006 \
  -e DATABASE_URL="postgresql://user:password@host:5432/cookbook_db" \
  -e SERVICE_TOKEN="your-service-token" \
  -e GATEWAY_TOKEN="your-gateway-token" \
  -e RECIPE_SERVICE_URL="http://recipe:8003" \
  cookbook-service
```

### Docker Compose

The service includes a `docker-compose.yml` for standalone deployment with database.

## Migration

Migrations are automatically run on container startup. To run manually:

```bash
npm run migrate
```

Migration file: `src/migrations/001_initial.sql`

Creates:
- `cookbooks` table
- `cookbook_recipes` junction table
- `cookbook_saves` table
- Required indexes and constraints

See [Design.md](./Design.md) for detailed architecture and integration patterns.

