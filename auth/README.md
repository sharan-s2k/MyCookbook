# Auth Service

Authentication service for MyCookbook. Handles user signup, login, refresh tokens, and logout using JWT-based authentication.

## Overview

The Auth Service is responsible for user authentication, JWT token management, and session handling. It uses PostgreSQL for storing authentication data and refresh tokens, and integrates with the User Service for profile creation.

## Responsibilities

- **User Signup**: Create new user accounts with email/password
- **User Login**: Authenticate existing users
- **JWT Token Management**: Generate and manage access tokens (short-lived)
- **Refresh Token Management**: Issue and rotate refresh tokens (long-lived, stored as hashed values)
- **Session Management**: Handle logout and token invalidation
- **Profile Creation**: Automatically create user profiles in User Service after signup

## Architecture

- **Framework**: Fastify (TypeScript/Node.js)
- **Database**: PostgreSQL
- **Authentication**: JWT (access tokens) + Refresh tokens (HTTP-only cookies)
- **Password Hashing**: bcrypt
- **Port**: 8001 (default)

## Database Schema

### users_auth

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key (matches user profile ID) |
| `email` | TEXT | Unique, normalized to lowercase |
| `password_hash` | TEXT | bcrypt hash |
| `provider` | TEXT | 'local' (default, for future OAuth) |
| `email_verified` | BOOLEAN | Email verification status (default: false) |
| `created_at` | TIMESTAMPTZ | Account creation timestamp |

**Indexes**:
- `email` (unique)

### refresh_tokens

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | Foreign key to users_auth |
| `token_hash` | TEXT | SHA-256 hash of refresh token (unique) |
| `expires_at` | TIMESTAMPTZ | Token expiration time |
| `created_at` | TIMESTAMPTZ | Token creation timestamp |

**Indexes**:
- `user_id`
- `token_hash` (unique)
- `(token_hash, expires_at)` (composite)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8001` | Service port |
| `DATABASE_URL` | **Required** | PostgreSQL connection string |
| `JWT_SECRET` | **Required** | Secret for signing JWTs (must match gateway) |
| `ACCESS_TOKEN_TTL_MIN` | `15` | Access token lifetime in minutes |
| `REFRESH_TOKEN_TTL_DAYS` | `30` | Refresh token lifetime in days |
| `USER_SERVICE_INTERNAL_URL` | **Required** | User service internal endpoint URL |
| `SERVICE_TOKEN` | **Required** | Token for service-to-service authentication |
| `BCRYPT_COST` | `12` | Bcrypt cost factor (higher = more secure, slower) |
| `DB_POOL_MAX` | `10` | Maximum database connections in pool |
| `HTTP_TIMEOUT_MS` | `3000` | HTTP timeout for internal service calls |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | Allowed CORS origin |

## API Endpoints

### POST /signup

Create a new user account. Automatically creates a user profile in User Service.

**Request**:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Validation**:
- Email: Required, will be normalized to lowercase
- Password: Required, minimum 8 characters

**Response** (200 OK):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Sets HTTP-only cookie**: `refresh_token` (valid for 30 days)

**Error Responses**:
- `400`: Missing email/password or password too short
- `409`: User with email already exists
- `500`: Internal server error (including User Service failures - auth still succeeds)

**Example cURL**:
```bash
curl -X POST http://localhost:8001/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }' \
  -c cookies.txt \
  -v
```

### POST /login

Authenticate an existing user.

**Request**:
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response** (200 OK):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Sets HTTP-only cookie**: `refresh_token` (valid for 30 days)

**Error Responses**:
- `400`: Missing email/password
- `401`: Invalid email or password
- `500`: Internal server error

**Example cURL**:
```bash
# Login and save cookies
curl -X POST http://localhost:8001/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }' \
  -c cookies.txt \
  -v

# Extract access_token from response (use jq or manual extraction)
ACCESS_TOKEN=$(curl -X POST http://localhost:8001/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password123"}' \
  -c cookies.txt \
  -s | jq -r '.access_token')

echo "Access Token: $ACCESS_TOKEN"
```

### POST /refresh

Refresh access token using refresh token cookie. Rotates refresh token (old one invalidated, new one issued).

**Request**: No body required, uses `refresh_token` cookie

**Response** (200 OK):
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Sets new HTTP-only cookie**: `refresh_token` (replaces old one)

**Error Responses**:
- `401`: Refresh token missing, invalid, or expired
- `500`: Internal server error

**Example cURL**:
```bash
# Refresh token (use cookies from login)
curl -X POST http://localhost:8001/refresh \
  -b cookies.txt \
  -c cookies.txt \
  -v

# Extract new access_token
NEW_TOKEN=$(curl -X POST http://localhost:8001/refresh \
  -b cookies.txt \
  -c cookies.txt \
  -s | jq -r '.access_token')

echo "New Access Token: $NEW_TOKEN"
```

### POST /logout

Invalidate refresh token and clear cookie.

**Request**: No body required, uses `refresh_token` cookie

**Response** (200 OK):
```json
{
  "success": true
}
```

**Clears HTTP-only cookie**: `refresh_token`

**Error Responses**:
- `500`: Internal server error

**Example cURL**:
```bash
curl -X POST http://localhost:8001/logout \
  -b cookies.txt \
  -c cookies.txt \
  -v
```

### GET /health

Health check endpoint. Checks database connectivity.

**Response** (200 OK):
```json
{
  "status": "healthy"
}
```

**Response** (200 OK, unhealthy):
```json
{
  "status": "unhealthy",
  "error": "Database connection failed"
}
```

**Example cURL**:
```bash
curl http://localhost:8001/health
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
   docker compose up -d auth-db

   # Run migrations
   npm run migrate
   ```

3. **Set environment variables**:
   ```bash
   export DATABASE_URL="postgresql://user:password@localhost:5432/auth_db"
   export JWT_SECRET="your-secret-key-min-32-chars"
   export USER_SERVICE_INTERNAL_URL="http://localhost:8002"
   export SERVICE_TOKEN="your-service-token"
   export PORT=8001
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

### Complete Authentication Flow

```bash
# 1. Signup
curl -X POST http://localhost:8001/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }' \
  -c cookies.txt \
  -s | jq

# Output:
# {
#   "access_token": "eyJ...",
#   "user_id": "550e8400-..."
# }

# 2. Extract access token (store in variable)
ACCESS_TOKEN=$(curl -X POST http://localhost:8001/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }' \
  -c cookies.txt \
  -s | jq -r '.access_token')

echo "Access Token: $ACCESS_TOKEN"

# 3. Use access token (example: call gateway/protected endpoint)
# Note: Gateway expects "Authorization: Bearer <token>" header
curl -X GET http://localhost:8080/api/users/me \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -v

# 4. Refresh token (when access token expires)
NEW_TOKEN=$(curl -X POST http://localhost:8001/refresh \
  -b cookies.txt \
  -c cookies.txt \
  -s | jq -r '.access_token')

echo "New Access Token: $NEW_TOKEN"

# 5. Logout
curl -X POST http://localhost:8001/logout \
  -b cookies.txt \
  -c cookies.txt \
  -v
```

### Testing via Gateway

Since the auth service is typically accessed via the gateway:

```bash
# 1. Signup via gateway
curl -X POST http://localhost:8080/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }' \
  -c cookies.txt \
  -s | jq

# 2. Login via gateway
ACCESS_TOKEN=$(curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }' \
  -c cookies.txt \
  -s | jq -r '.access_token')

# 3. Use token for protected endpoints
curl -X GET http://localhost:8080/api/users/me \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq

# 4. Refresh via gateway
curl -X POST http://localhost:8080/api/auth/refresh \
  -b cookies.txt \
  -c cookies.txt \
  -s | jq

# 5. Logout via gateway
curl -X POST http://localhost:8080/api/auth/logout \
  -b cookies.txt \
  -c cookies.txt \
  -s | jq
```

## Docker Deployment

### Build and Run

```bash
# Build image
docker build -t auth-service .

# Run container
docker run -p 8001:8001 \
  -e DATABASE_URL="postgresql://user:password@host:5432/auth_db" \
  -e JWT_SECRET="your-secret-key" \
  -e USER_SERVICE_INTERNAL_URL="http://user-service:8002" \
  -e SERVICE_TOKEN="your-service-token" \
  auth-service
```

### Docker Compose

The service includes a `docker-compose.yml` for standalone deployment:

```yaml
services:
  auth-db:
    image: postgres:15
    environment:
      POSTGRES_DB: auth_db
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - auth_db_data:/var/lib/postgresql/data

  auth:
    build: .
    ports:
      - "8001:8001"
    environment:
      PORT: 8001
      DATABASE_URL: postgresql://postgres:postgres@auth-db:5432/auth_db
      JWT_SECRET: ${JWT_SECRET}
      USER_SERVICE_INTERNAL_URL: ${USER_SERVICE_INTERNAL_URL}
      SERVICE_TOKEN: ${SERVICE_TOKEN}
    depends_on:
      - auth-db

volumes:
  auth_db_data:
```

Run with:

```bash
docker compose up --build
```

## Security Considerations

### Password Hashing

- **Algorithm**: bcrypt
- **Cost Factor**: 12 (default, configurable)
- **Salt**: Automatically generated by bcrypt

### JWT Tokens

- **Access Token**:
  - Short-lived (15 minutes default)
  - Contains: `{sub: userId, type: 'access'}`
  - Signed with HS256 algorithm
  - Stored in memory/client (sent in Authorization header)

- **Refresh Token**:
  - Long-lived (30 days default)
  - Random UUID
  - Stored as SHA-256 hash in database
  - HTTP-only cookie (not accessible via JavaScript)
  - Rotated on each refresh

### Token Rotation

Refresh tokens are rotated (invalidated and reissued) on each refresh:
- Prevents token reuse if compromised
- Limits attack window if token is stolen

### Email Normalization

- All emails normalized to lowercase before storage
- Prevents duplicate accounts with different cases

### Error Messages

- Generic error messages to prevent user enumeration:
  - "Invalid email or password" (not "user not found" or "wrong password")

## Integration

### Upstream (Calls This Service)

- **Gateway**: Routes `/api/auth/*` requests to this service
- **Frontend**: Sends signup/login requests via gateway

### Downstream (This Service Calls)

- **User Service**: Creates user profile after signup (internal endpoint)
  - Endpoint: `POST /internal/users`
  - Headers: `x-service-token`
  - Body: `{id, email}`
  - Note: Profile creation failure doesn't fail signup (logged as warning)

### Dependencies

- **PostgreSQL**: User authentication data
- **User Service**: Profile creation
- **Gateway**: JWT secret must match gateway's `JWT_PUBLIC_OR_SHARED_SECRET`

## Migration

Migrations are automatically run on container startup. To run manually:

```bash
npm run migrate
```

Migration file: `src/migrations/001_initial.sql`

Creates:
- `users_auth` table
- `refresh_tokens` table
- Required indexes

See [Design.md](./Design.md) for detailed architecture and integration patterns.
