# User Service

User profile service for MyCookbook. Manages user profiles and preferences.

## Responsibilities

- Store user profile information (display name, bio, avatar, preferences)
- Provide user profile endpoints
- Internal endpoint for profile creation (called by auth service)

## Database

PostgreSQL database: `user_db`

### Schema

**users_profile**
- `id` (UUID, PK) - Must match auth service user_id
- `username` (TEXT, UNIQUE, nullable)
- `display_name` (TEXT, nullable)
- `bio` (TEXT, nullable)
- `avatar_url` (TEXT, nullable)
- `preferences` (JSONB, nullable)
- `created_at` (TIMESTAMP)
- `updated_at` (TIMESTAMP)

## Environment Variables

- `PORT` - Service port (default: 8002)
- `DATABASE_URL` - PostgreSQL connection string
- `SERVICE_TOKEN` - Token for service-to-service authentication

## API Endpoints

### POST /internal/users (Internal only)
Create a user profile. Called by auth service.

**Headers:**
- `x-service-token`: Service authentication token

**Request:**
```json
{
  "id": "user-uuid",
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "id": "user-uuid"
}
```

### GET /me (Protected)
Get current user's profile.

**Headers:**
- `Authorization: Bearer <access_token>`
- `x-user-id`: Set by gateway (from JWT)

**Response:**
```json
{
  "id": "...",
  "username": null,
  "display_name": "user",
  "bio": null,
  "avatar_url": null,
  "preferences": {},
  "created_at": "...",
  "updated_at": "..."
}
```

### PATCH /me (Protected)
Update current user's profile.

**Headers:**
- `Authorization: Bearer <access_token>`
- `x-user-id`: Set by gateway

**Request:**
```json
{
  "display_name": "New Name",
  "bio": "Bio text",
  "avatar_url": "https://...",
  "preferences": { "theme": "dark" }
}
```

**Response:**
Updated profile object.

### GET /health
Health check endpoint.

## Running Standalone

1. **Start database:**
   ```bash
   docker compose up -d user-db
   ```

2. **Run migrations:**
   ```bash
   npm run migrate
   ```

3. **Start service:**
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

