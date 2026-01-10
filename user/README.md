# User Service

User profile service for MyCookbook. Manages user profiles, preferences, and social graph (follow relationships).

## Overview

The User Service handles user profile management, including display names, bios, avatars, preferences, and social features (follow/unfollow relationships). It integrates with the Auth Service for profile creation and emits events to Kafka for search indexing.

## Responsibilities

- **Profile Management**: Store and manage user profile information (display name, bio, avatar, preferences)
- **Social Graph**: Manage follow/unfollow relationships between users
- **Profile Creation**: Internal endpoint for profile creation (called by auth service)
- **Event Emission**: Emit user events to Kafka for search indexing and feed services

## Architecture

- **Framework**: Fastify (TypeScript/Node.js)
- **Database**: PostgreSQL
- **Messaging**: Kafka (for user events - optional)
- **Authentication**: Gateway token authentication
- **Port**: 8002 (default)

## Database Schema

### users_profile

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key (must match auth service user_id) |
| `username` | TEXT | Unique username (nullable, for future use) |
| `display_name` | TEXT | User's display name (nullable, defaults to email prefix) |
| `bio` | TEXT | User biography (nullable) |
| `avatar_url` | TEXT | Avatar image URL (nullable) |
| `preferences` | JSONB | User preferences (theme, units, etc.) |
| `created_at` | TIMESTAMPTZ | Profile creation timestamp |
| `updated_at` | TIMESTAMPTZ | Profile update timestamp |

**Indexes**:
- `username` (unique, partial index on NOT NULL)

### user_follows

| Column | Type | Description |
|--------|------|-------------|
| `follower_id` | UUID | User who follows (FK to users_profile) |
| `following_id` | UUID | User being followed (FK to users_profile) |
| `created_at` | TIMESTAMPTZ | Follow relationship creation timestamp |

**Constraints**:
- Primary key: `(follower_id, following_id)`
- Check constraint: `follower_id != following_id` (prevent self-follow)
- Foreign keys with CASCADE delete

**Indexes**:
- `follower_id` (for "who I'm following" queries)
- `following_id` (for "who follows me" queries)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8002` | Service port |
| `DATABASE_URL` | **Required** | PostgreSQL connection string |
| `SERVICE_TOKEN` | **Required** | Token for service-to-service authentication |
| `GATEWAY_TOKEN` | `SERVICE_TOKEN` | Token for gateway authentication |
| `KAFKA_BROKERS` | `localhost:9092` | Kafka broker addresses (comma-separated, optional) |
| `KAFKA_TOPIC_USERS` | `user.events` | Kafka topic for user events |
| `DB_POOL_MAX` | `10` | Maximum database connections in pool |

## API Endpoints

### Protected Endpoints (Require JWT via Gateway)

#### GET /me

Get current user's profile.

**Headers**: `Authorization: Bearer <access_token>` (via gateway)

**Response** (200 OK):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "username": null,
  "display_name": "user",
  "bio": null,
  "avatar_url": null,
  "preferences": {},
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

**Example cURL**:
```bash
export ACCESS_TOKEN="your-access-token"

curl -X GET http://localhost:8080/api/users/me \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq
```

#### PATCH /me

Update current user's profile.

**Headers**: `Authorization: Bearer <access_token>` (via gateway)

**Request**:
```json
{
  "display_name": "New Name",
  "bio": "My bio text",
  "avatar_url": "https://example.com/avatar.jpg",
  "preferences": {
    "theme": "dark",
    "units": "metric"
  }
}
```

**Response** (200 OK): Updated profile object

**Example cURL**:
```bash
curl -X PATCH http://localhost:8080/api/users/me \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "display_name": "John Doe",
    "bio": "Passionate cook"
  }' \
  -s | jq
```

#### GET /:id

Get user profile by ID with followers/following counts and follow status.

**Headers**: `Authorization: Bearer <access_token>` (via gateway)

**Response** (200 OK):
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "johndoe",
  "display_name": "John Doe",
  "bio": "Passionate cook",
  "avatar_url": "https://example.com/avatar.jpg",
  "followers_count": 42,
  "following_count": 10,
  "is_following": true
}
```

**Example cURL**:
```bash
export USER_ID="550e8400-e29b-41d4-a716-446655440000"

curl -X GET http://localhost:8080/api/users/$USER_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq
```

#### POST /:id/follow

Follow a user.

**Headers**: `Authorization: Bearer <access_token>` (via gateway)

**Response** (200 OK):
```json
{
  "success": true
}
```

**Error Responses**:
- `400`: Cannot follow yourself
- `404`: User not found

**Example cURL**:
```bash
export USER_ID="550e8400-e29b-41d4-a716-446655440000"

curl -X POST http://localhost:8080/api/users/$USER_ID/follow \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq
```

#### DELETE /:id/follow

Unfollow a user.

**Headers**: `Authorization: Bearer <access_token>` (via gateway)

**Response** (200 OK):
```json
{
  "success": true
}
```

**Example cURL**:
```bash
curl -X DELETE http://localhost:8080/api/users/$USER_ID/follow \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq
```

#### GET /:id/followers

Get list of users following this user.

**Headers**: `Authorization: Bearer <access_token>` (via gateway)

**Response** (200 OK):
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "username": "alice",
    "display_name": "Alice",
    "avatar_url": "https://example.com/alice.jpg"
  }
]
```

**Example cURL**:
```bash
curl -X GET http://localhost:8080/api/users/$USER_ID/followers \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq
```

#### GET /:id/following

Get list of users this user is following.

**Headers**: `Authorization: Bearer <access_token>` (via gateway)

**Response** (200 OK): Array of user objects (same format as followers)

**Example cURL**:
```bash
curl -X GET http://localhost:8080/api/users/$USER_ID/following \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq
```

### Internal Endpoints (Service-to-Service)

#### POST /internal/users

Create a user profile. Called by auth service after signup.

**Headers**: `x-service-token: <service-token>`

**Request**:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "email": "user@example.com"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### GET /internal/users/all

Get all users (for reindexing). Called by search service.

**Headers**: `x-service-token: <service-token>`

**Response** (200 OK): Array of user objects

#### GET /internal/users/:userId/following-ids

Get list of following IDs for a user. Called by feed service.

**Headers**: `x-service-token: <service-token>`

**Response** (200 OK):
```json
[
  "550e8400-e29b-41d4-a716-446655440001",
  "550e8400-e29b-41d4-a716-446655440002"
]
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
- Kafka (optional, for event emission)

### Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up database**:
   ```bash
   # Start PostgreSQL (using docker-compose)
   docker compose up -d user-db

   # Run migrations
   npm run migrate
   ```

3. **Set environment variables**:
   ```bash
   export DATABASE_URL="postgresql://user:password@localhost:5432/user_db"
   export SERVICE_TOKEN="your-service-token"
   export GATEWAY_TOKEN="your-gateway-token"
   export KAFKA_BROKERS="localhost:9092"  # Optional
   export PORT=8002
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

### Testing via Gateway

All endpoints are accessed via the gateway at `http://localhost:8080/api/users/*`.

```bash
# Get your access token first (via login/signup)
export ACCESS_TOKEN="your-access-token"

# Get current user profile
curl -X GET http://localhost:8080/api/users/me \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq

# Update profile
curl -X PATCH http://localhost:8080/api/users/me \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "display_name": "John Doe",
    "bio": "Passionate cook",
    "preferences": {"theme": "dark"}
  }' \
  -s | jq

# Get another user's profile
export USER_ID="550e8400-e29b-41d4-a716-446655440000"
curl -X GET http://localhost:8080/api/users/$USER_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq

# Follow a user
curl -X POST http://localhost:8080/api/users/$USER_ID/follow \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq

# Get followers
curl -X GET http://localhost:8080/api/users/$USER_ID/followers \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq

# Get following
curl -X GET http://localhost:8080/api/users/$USER_ID/following \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq

# Unfollow a user
curl -X DELETE http://localhost:8080/api/users/$USER_ID/follow \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq
```

### Testing Internal Endpoints

```bash
export SERVICE_TOKEN="your-service-token"

# Create user profile (internal)
curl -X POST http://localhost:8002/internal/users \
  -H "Content-Type: application/json" \
  -H "x-service-token: $SERVICE_TOKEN" \
  -d '{
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com"
  }' \
  -s | jq

# Get all users (internal, for reindexing)
curl -X GET http://localhost:8002/internal/users/all \
  -H "x-service-token: $SERVICE_TOKEN" \
  -s | jq

# Get following IDs (internal, for feed service)
export USER_ID="550e8400-e29b-41d4-a716-446655440000"
curl -X GET http://localhost:8002/internal/users/$USER_ID/following-ids \
  -H "x-service-token: $SERVICE_TOKEN" \
  -s | jq
```

## Docker Deployment

### Build and Run

```bash
# Build image
docker build -t user-service .

# Run container
docker run -p 8002:8002 \
  -e DATABASE_URL="postgresql://user:password@host:5432/user_db" \
  -e SERVICE_TOKEN="your-service-token" \
  -e GATEWAY_TOKEN="your-gateway-token" \
  -e KAFKA_BROKERS="kafka:9092" \
  user-service
```

### Docker Compose

The service includes a `docker-compose.yml` for standalone deployment:

```yaml
services:
  user-db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: user_db
      POSTGRES_USER: user_user
      POSTGRES_PASSWORD: user_pass
    ports:
      - "5434:5432"
    volumes:
      - user_db_data:/var/lib/postgresql/data

  user:
    build: .
    depends_on:
      - user-db
    ports:
      - "8002:8002"
    environment:
      PORT: 8002
      DATABASE_URL: postgresql://user_user:user_pass@user-db:5432/user_db
      SERVICE_TOKEN: ${SERVICE_TOKEN}
      GATEWAY_TOKEN: ${GATEWAY_TOKEN}
      KAFKA_BROKERS: ${KAFKA_BROKERS}

volumes:
  user_db_data:
```

Run with:

```bash
docker compose up --build
```

## Kafka Integration

### Event Emission

The service emits user events to Kafka for search indexing and feed services:

- **Topic**: `user.events` (configurable via `KAFKA_TOPIC_USERS`)
- **Events**:
  - `user.created`: When a new profile is created
  - `user.updated`: When a profile is updated
  - `user.deleted`: When a profile is deleted (future)

**Event Format**:
```json
{
  "event": "user.created",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "username": "johndoe",
  "display_name": "John Doe",
  "bio": "Passionate cook",
  "avatar_url": "https://example.com/avatar.jpg",
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

**Optional**: Service works without Kafka (events are skipped if Kafka is unavailable)

## Security Considerations

1. **Gateway Token**: All protected endpoints verify `x-gateway-token` header
2. **Service Token**: Internal endpoints require `x-service-token` header
3. **User ID Extraction**: User ID comes from gateway (verified JWT), never from client
4. **Self-Follow Prevention**: Database constraint prevents users from following themselves
5. **SQL Injection**: All queries use parameterized statements
6. **Email Not Exposed**: Email is stored in auth service, not exposed in profile

## Integration

### Upstream (Calls This Service)

- **Gateway**: Routes `/api/users/*` requests to this service
- **Auth Service**: Calls `POST /internal/users` after signup
- **Feed Service**: Calls `GET /internal/users/:userId/following-ids` for feed queries
- **Search Service**: Calls `GET /internal/users/all` for reindexing

### Downstream (This Service Calls)

- **Kafka**: Emits user events (optional, non-fatal if unavailable)

### Dependencies

- **PostgreSQL**: User profile data and follow relationships
- **Kafka**: User events (optional)

## Migration

Migrations are automatically run on container startup. To run manually:

```bash
npm run migrate
```

Migration file: `src/migrations/001_initial.sql`

Creates:
- `users_profile` table
- `user_follows` table
- Required indexes and constraints

See [Design.md](./Design.md) for detailed architecture and integration patterns.
