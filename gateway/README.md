# Gateway Service

API Gateway for MyCookbook. Single entry point that routes requests to backend services, handles authentication, rate limiting, and CORS.

## Overview

The Gateway Service is the single entry point for all client requests. It handles authentication verification, request routing, rate limiting, CORS, and correlation ID propagation. All backend services are accessed through the gateway, never directly by clients.

## Responsibilities

- **Request Routing**: Route requests to appropriate backend services based on URL patterns
- **JWT Verification**: Verify JWT access tokens for protected routes
- **Rate Limiting**: Token bucket rate limiting per-IP (auth endpoints) and per-user (authenticated endpoints)
- **CORS Handling**: Handle cross-origin requests with specific origin allowlist
- **Correlation ID**: Generate and propagate correlation IDs for request tracing
- **Header Injection**: Inject service-specific headers (x-user-id, x-gateway-token, x-service-token)
- **Concurrency Control**: Reject-fast concurrency limits for import job endpoints

## Architecture

- **Framework**: Fastify (TypeScript/Node.js)
- **Proxy**: `@fastify/http-proxy` for upstream proxying
- **Authentication**: JWT verification (shared secret with auth service)
- **Rate Limiting**: In-memory token bucket (can be extended to Redis for multi-instance)
- **Port**: 8080 (default)

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Gateway port |
| `AUTH_URL` | **Required** | Auth service URL |
| `USER_URL` | **Required** | User service URL |
| `RECIPE_URL` | **Required** | Recipe service URL |
| `COOKBOOK_URL` | **Required** | Cookbook service URL |
| `FEED_URL` | **Required** | Feed service URL |
| `SEARCH_URL` | **Required** | Search service URL |
| `AI_ORCHESTRATOR_URL` | **Required** | AI Orchestrator service URL |
| `JWT_PUBLIC_OR_SHARED_SECRET` | **Required** | JWT signing secret (must match auth service) |
| `SERVICE_TOKEN` | **Required** | Token for service-to-service authentication |
| `GATEWAY_TOKEN` | `SERVICE_TOKEN` | Token for gateway authentication (sent to backend services) |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | Allowed CORS origin |
| `GATEWAY_UPSTREAM_TIMEOUT_MS` | `5000` | Upstream request timeout in milliseconds |
| `CORS_MAX_AGE_SECONDS` | `600` | CORS preflight cache time |
| `TRUST_PROXY` | `false` | Enable if behind reverse proxy/load balancer |
| `RATE_LIMIT_ENABLED` | `true` | Enable/disable rate limiting |
| `RATE_LIMIT_AUTH_PER_MIN` | `10` | Auth endpoints: requests per minute |
| `RATE_LIMIT_AUTH_BURST` | `20` | Auth endpoints: burst capacity |
| `RATE_LIMIT_AUTHENTICATED_PER_MIN` | `60` | Authenticated endpoints: requests per minute |
| `RATE_LIMIT_AUTHENTICATED_BURST` | `120` | Authenticated endpoints: burst capacity |
| `GATEWAY_BODY_LIMIT` | `262144` | Request body size limit in bytes (256KB) |

## API Routes

### Public Routes (No Authentication)

These routes are accessible without authentication:

- `GET /health` - Health check
- `POST /api/auth/signup` - User signup (proxied to auth service)
- `POST /api/auth/login` - User login (proxied to auth service)
- `POST /api/auth/refresh` - Refresh access token (proxied to auth service)
- `POST /api/auth/logout` - Logout (proxied to auth service)

### Protected Routes (Require JWT)

All routes under `/api/*` (except `/api/auth/*`) require a valid JWT access token in the `Authorization: Bearer <token>` header.

**User Service Routes**:
- `GET /api/users/me` - Get current user profile
- `PATCH /api/users/me` - Update current user profile
- `GET /api/users/:id` - Get user profile by ID
- `POST /api/users/:id/follow` - Follow a user
- `DELETE /api/users/:id/follow` - Unfollow a user
- `GET /api/users/:id/followers` - Get user's followers
- `GET /api/users/:id/following` - Get users this user is following

**Recipe Service Routes**:
- `POST /api/recipes/import/youtube` - Import YouTube recipe (concurrency limited)
- `GET /api/recipes/import-jobs/:job_id` - Get import job status (concurrency limited)
- `GET /api/recipes` - List user's recipes
- `GET /api/recipes/:recipe_id` - Get recipe details
- `PATCH /api/recipes/:recipe_id` - Update recipe
- `DELETE /api/recipes/:recipe_id` - Delete recipe

**Cookbook Service Routes**:
- `GET /api/cookbooks` - List user's cookbooks (owned and saved)
- `POST /api/cookbooks` - Create cookbook
- `GET /api/cookbooks/:cookbook_id` - Get cookbook details
- `PATCH /api/cookbooks/:cookbook_id` - Update cookbook (owner only)
- `DELETE /api/cookbooks/:cookbook_id` - Delete cookbook (owner only)
- `POST /api/cookbooks/:cookbook_id/save` - Save public cookbook
- `DELETE /api/cookbooks/:cookbook_id/save` - Unsave cookbook
- `POST /api/cookbooks/recipes/:recipe_id/cookbooks` - Set recipe cookbook membership
- `GET /api/cookbooks/recipes/:recipe_id/cookbooks` - Get recipe's cookbooks

**Feed Service Routes**:
- `GET /api/feed/home` - Get user's feed (following-only)
  - Query params: `cursor` (optional), `limit` (optional, default: 20, max: 50)

**Search Service Routes**:
- `GET /api/search` - Search users and recipes
  - Query params: `q` (required), `scope` (all/users/recipes), `limitUsers`, `limitRecipes`

**AI Orchestrator Routes** (Protected, for future use):
- `POST /api/ai/chat` - Chat with AI during Cook Mode

## Running Locally

### Prerequisites

- Node.js 18+
- TypeScript
- All backend services running (or accessible)

### Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set environment variables**:
   ```bash
   export PORT=8080
   export AUTH_URL="http://localhost:8001"
   export USER_URL="http://localhost:8002"
   export RECIPE_URL="http://localhost:8003"
   export COOKBOOK_URL="http://localhost:8006"
   export FEED_URL="http://localhost:8008"
   export SEARCH_URL="http://localhost:8007"
   export AI_ORCHESTRATOR_URL="http://localhost:8004"
   export JWT_PUBLIC_OR_SHARED_SECRET="your-jwt-secret-must-match-auth"
   export SERVICE_TOKEN="your-service-token"
   export FRONTEND_ORIGIN="http://localhost:5173"
   ```

3. **Run the service**:
   ```bash
   npm run dev
   ```

Or using Docker:

```bash
docker compose up --build
```

## Testing

### Health Check

```bash
curl http://localhost:8080/health
```

**Response**:
```json
{
  "status": "healthy",
  "service": "gateway"
}
```

### Complete Authentication Flow via Gateway

```bash
# 1. Signup
curl -X POST http://localhost:8080/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }' \
  -c cookies.txt \
  -s | jq

# Output:
# {
#   "access_token": "eyJ...",
#   "user_id": "550e8400-..."
# }

# 2. Extract and store access token
ACCESS_TOKEN=$(curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123"
  }' \
  -c cookies.txt \
  -s | jq -r '.access_token')

echo "Access Token: $ACCESS_TOKEN"

# 3. Use access token for protected endpoints
curl -X GET http://localhost:8080/api/users/me \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq

# 4. Refresh token (when access token expires)
curl -X POST http://localhost:8080/api/auth/refresh \
  -b cookies.txt \
  -c cookies.txt \
  -s | jq

# 5. Logout
curl -X POST http://localhost:8080/api/auth/logout \
  -b cookies.txt \
  -c cookies.txt \
  -s | jq
```

### Testing Protected Endpoints

```bash
# Set your access token
export ACCESS_TOKEN="your-access-token"

# Get user profile
curl -X GET http://localhost:8080/api/users/me \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq

# List recipes
curl -X GET http://localhost:8080/api/recipes \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq

# Create cookbook
curl -X POST http://localhost:8080/api/cookbooks \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My Favorite Recipes",
    "description": "A collection of my favorite recipes",
    "visibility": "PRIVATE"
  }' \
  -s | jq

# Import YouTube recipe
curl -X POST http://localhost:8080/api/recipes/import/youtube \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.youtube.com/watch?v=example"
  }' \
  -s | jq

# Get feed
curl -X GET "http://localhost:8080/api/feed/home?limit=20" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq

# Search
curl -X GET "http://localhost:8080/api/search?q=chocolate&scope=all&limitUsers=10&limitRecipes=10" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq
```

### Testing Rate Limiting

```bash
# Test auth rate limiting (per-IP)
for i in {1..25}; do
  curl -X POST http://localhost:8080/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email": "test@example.com", "password": "wrong"}' \
    -s -w "\nStatus: %{http_code}\n"
  sleep 0.1
done

# After ~10-20 requests, you should see 429 Rate Limit Exceeded

# Test authenticated rate limiting (per-user)
export ACCESS_TOKEN="your-access-token"

for i in {1..150}; do
  curl -X GET http://localhost:8080/api/users/me \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -s -w "\nStatus: %{http_code}\n" > /dev/null
done

# After ~60-120 requests, you should see 429 Rate Limit Exceeded
```

### Testing Concurrency Limits

```bash
# Test import job creation concurrency limit (max 10 concurrent)
# This will be rejected fast (503) if > 10 concurrent requests

export ACCESS_TOKEN="your-access-token"

# Create 15 concurrent requests
for i in {1..15}; do
  (
    curl -X POST http://localhost:8080/api/recipes/import/youtube \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"url": "https://www.youtube.com/watch?v=test'$i'"}' \
      -s -w "\nRequest $i Status: %{http_code}\n"
  ) &
done
wait
```

## Docker Deployment

### Build and Run

```bash
# Build image
docker build -t gateway-service .

# Run container
docker run -p 8080:8080 \
  -e AUTH_URL="http://auth:8001" \
  -e USER_URL="http://user:8002" \
  -e RECIPE_URL="http://recipe:8003" \
  -e COOKBOOK_URL="http://cookbook:8006" \
  -e FEED_URL="http://feed:8008" \
  -e SEARCH_URL="http://search:8007" \
  -e AI_ORCHESTRATOR_URL="http://ai-orchestrator:8004" \
  -e JWT_PUBLIC_OR_SHARED_SECRET="your-secret" \
  -e SERVICE_TOKEN="your-service-token" \
  gateway-service
```

### Docker Compose

The service includes a `docker-compose.yml` for standalone deployment:

```yaml
services:
  gateway:
    build: .
    ports:
      - "8080:8080"
    environment:
      PORT: 8080
      AUTH_URL: ${AUTH_URL}
      USER_URL: ${USER_URL}
      RECIPE_URL: ${RECIPE_URL}
      # ... other service URLs
      JWT_PUBLIC_OR_SHARED_SECRET: ${JWT_SECRET}
      SERVICE_TOKEN: ${SERVICE_TOKEN}
    depends_on:
      - auth
      - user
      - recipe
      # ... other services
```

Run with:

```bash
docker compose up --build
```

## Authentication Flow

### JWT Verification

1. **Client Request**: Includes `Authorization: Bearer <access_token>` header
2. **Gateway Verification**:
   - Extract token from header
   - Verify JWT signature using `JWT_PUBLIC_OR_SHARED_SECRET`
   - Check expiration (`exp` claim)
   - Verify token type is `access`
   - Extract user ID from `sub` claim
3. **Header Injection**: Add `x-user-id` and `x-gateway-token` headers to upstream request
4. **Upstream Request**: Backend service verifies `x-gateway-token` header

### Error Responses

**401 Unauthorized**:
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing or invalid authorization header",
    "request_id": "uuid"
  }
}
```

**401 Invalid Token**:
```json
{
  "error": {
    "code": "INVALID_TOKEN",
    "message": "Invalid or expired token",
    "request_id": "uuid"
  }
}
```

**429 Rate Limit Exceeded**:
```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Limit: 60 requests per minute (burst: 120)",
    "request_id": "uuid"
  }
}
```

**503 Overloaded** (concurrency limit):
```json
{
  "error": {
    "code": "OVERLOADED",
    "message": "Too many concurrent requests",
    "request_id": "uuid"
  }
}
```

**504 Upstream Timeout**:
```json
{
  "error": {
    "code": "UPSTREAM_TIMEOUT",
    "message": "Upstream request timed out",
    "request_id": "uuid"
  }
}
```

## Rate Limiting

### Token Bucket Algorithm

- **Sustained Rate**: Tokens refill at sustained rate (e.g., 60/min)
- **Burst Capacity**: Initial bucket size (e.g., 120 tokens)
- **Per-IP** (auth endpoints): Key is `auth:${ip}`
- **Per-User** (authenticated endpoints): Key is `user:${userId}`

### Configuration

- **Auth Endpoints** (`/api/auth/login`, `/api/auth/signup`):
  - Sustained: 10 requests/minute
  - Burst: 20 requests

- **Authenticated Endpoints** (all `/api/*` except auth):
  - Sustained: 60 requests/minute
  - Burst: 120 requests

### Rate Limit Headers

Gateway does not set rate limit headers (Retry-After, X-RateLimit-*), but could be added in future.

## CORS

### Configuration

- **Allowed Origin**: `FRONTEND_ORIGIN` (not wildcard, for security)
- **Credentials**: Enabled (for refresh token cookies)
- **Max Age**: 600 seconds (10 minutes)
- **Methods**: All (`*`)
- **Headers**: All (`*`)

### Preflight Requests

Gateway handles CORS preflight (`OPTIONS`) requests automatically via Fastify CORS plugin.

## Correlation IDs

All requests get a correlation ID:

1. **Check for existing**: `x-request-id` header (from load balancer/proxy)
2. **Generate if missing**: New UUID
3. **Propagate**: Added to all upstream requests as `x-request-id` header
4. **Logging**: Included in all log entries

## Concurrency Control

### Import Job Endpoints

- **POST /api/recipes/import/youtube**: Max 10 concurrent requests (reject-fast)
- **GET /api/recipes/import-jobs/:job_id**: Max 50 concurrent requests (reject-fast)

**Implementation**: Simple counters (no queueing to avoid unbounded memory)

## Security Considerations

1. **JWT Secret**: Must match auth service's `JWT_SECRET`
2. **Gateway Token**: Backend services verify `x-gateway-token` header
3. **Service Token**: Used for AI orchestrator routes (`x-service-token`)
4. **Header Sanitization**: Removes user-supplied `x-user-id`, `x-gateway-token`, `x-service-token`
5. **CORS**: Restricted to specific origin (not wildcard)
6. **Body Size Limit**: 256KB default (prevents abuse)
7. **Request Timeout**: 5 seconds default (prevents hanging requests)

## Integration

### Upstream Services

Gateway proxies to:
- **Auth Service** (`AUTH_URL`): Authentication endpoints
- **User Service** (`USER_URL`): User profile and social features
- **Recipe Service** (`RECIPE_URL`): Recipe management
- **Cookbook Service** (`COOKBOOK_URL`): Cookbook management
- **Feed Service** (`FEED_URL`): User feed
- **Search Service** (`SEARCH_URL`): Global search
- **AI Orchestrator** (`AI_ORCHESTRATOR_URL`): AI endpoints (chat)

### Header Injection

Gateway injects headers into upstream requests:

- **`x-user-id`**: User ID from JWT `sub` claim (protected routes only)
- **`x-gateway-token`**: Gateway authentication token (protected routes)
- **`x-service-token`**: Service-to-service token (AI orchestrator routes)
- **`x-request-id`**: Correlation ID (all routes)

### Dependencies

- **Backend Services**: Must be running and accessible
- **JWT Secret**: Must match auth service
- **No Database**: Gateway is stateless

## Performance Considerations

### Request Timeout

- **Default**: 5 seconds (`GATEWAY_UPSTREAM_TIMEOUT_MS`)
- **Purpose**: Prevent hanging requests from upstream services
- **Behavior**: Returns 504 Gateway Timeout if upstream doesn't respond

### Connection Pooling

- **@fastify/http-proxy**: Manages upstream connections internally
- **No explicit pool configuration**: Fastify handles connection reuse

### Rate Limiting Performance

- **In-Memory**: O(1) per request (token bucket)
- **Cleanup**: Periodic cleanup of unused entries (every 5 minutes)
- **Multi-Instance**: For production, consider Redis-backed rate limiting

### Body Size Limit

- **Default**: 256KB (`GATEWAY_BODY_LIMIT`)
- **Purpose**: Prevent abuse via large payloads
- **Configurable**: Via environment variable

## Monitoring and Observability

### Health Check

- **Endpoint**: `GET /health`
- **Response Time**: Should be < 100ms
- **No Dependencies**: Always returns healthy if service is running

### Metrics to Track

1. **Request Rate**: Requests per second per endpoint
2. **Error Rate**: 401/429/503/504 error rates
3. **Latency**: P50, P95, P99 for each upstream service
4. **Rate Limit Hits**: Number of 429 responses
5. **Upstream Timeouts**: Number of 504 responses
6. **JWT Verification Failures**: Number of 401 responses

### Logging

- **Request Logging**: Fastify default logging (includes correlation ID)
- **Error Logging**: Log all 4xx/5xx errors with context
- **Sensitive Data**: Never log access tokens or passwords

See [Design.md](./Design.md) for detailed architecture and integration patterns.
