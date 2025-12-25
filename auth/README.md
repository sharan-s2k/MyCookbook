# Auth Service

Authentication service for MyCookbook. Handles user signup, login, refresh tokens, and logout.

## Responsibilities

- User authentication (email + password)
- Password hashing with bcrypt
- JWT access token generation
- Refresh token management (stored as hashed values)
- Integration with user service for profile creation

## Database

PostgreSQL database: `auth_db`

### Schema

**users_auth**
- `id` (UUID, PK)
- `email` (TEXT, UNIQUE)
- `password_hash` (TEXT)
- `provider` (TEXT, default: 'local')
- `email_verified` (BOOLEAN, default: false)
- `created_at` (TIMESTAMP)

**refresh_tokens**
- `id` (UUID, PK)
- `user_id` (UUID)
- `token_hash` (TEXT)
- `expires_at` (TIMESTAMP)
- `created_at` (TIMESTAMP)

## Environment Variables

- `PORT` - Service port (default: 8001)
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Secret for signing JWTs
- `ACCESS_TOKEN_TTL_MIN` - Access token lifetime in minutes (default: 15)
- `REFRESH_TOKEN_TTL_DAYS` - Refresh token lifetime in days (default: 30)
- `USER_SERVICE_INTERNAL_URL` - URL for user service internal endpoints
- `SERVICE_TOKEN` - Token for service-to-service authentication
- `BCRYPT_COST` - Bcrypt cost factor (default: 12)

## API Endpoints

### POST /signup
Create a new user account.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "access_token": "...",
  "user_id": "..."
}
```

Sets `refresh_token` cookie.

### POST /login
Authenticate existing user.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "access_token": "...",
  "user_id": "..."
}
```

Sets `refresh_token` cookie.

### POST /refresh
Refresh access token using refresh token cookie.

**Response:**
```json
{
  "access_token": "..."
}
```

Rotates refresh token and sets new cookie.

### POST /logout
Invalidate refresh token and clear cookie.

**Response:**
```json
{
  "success": true
}
```

### GET /health
Health check endpoint.

## Running Standalone

1. **Start database:**
   ```bash
   docker compose up -d auth-db
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

Migrations are automatically run on container startup. To run manually:

```bash
npm run migrate
```

