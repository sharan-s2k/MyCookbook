# Cookbook Service

Cookbook service for MyCookbook. Handles cookbook creation, management, recipe membership, and saved cookbooks.

## Responsibilities

- Create and manage cookbooks
- Manage recipe membership across cookbooks
- Handle saved cookbooks (users saving other users' public cookbooks)
- Enforce ownership and visibility rules

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

## Environment Variables

- `PORT` - Service port (default: 8006)
- `DATABASE_URL` - PostgreSQL connection string
- `SERVICE_TOKEN` - Token for service-to-service authentication
- `GATEWAY_TOKEN` - Token for gateway authentication
- `RECIPE_SERVICE_URL` - Recipe service URL (for future recipe verification)

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

## Running

```bash
npm install
npm run dev
```

Or with Docker:
```bash
docker compose up --build
```

