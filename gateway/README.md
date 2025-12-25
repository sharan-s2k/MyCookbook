# Gateway Service

API Gateway for MyCookbook. Routes requests to backend services and handles authentication.

## Responsibilities

- Route requests to appropriate services
- JWT verification for protected routes
- Correlation ID generation and propagation
- CORS handling
- Cookie forwarding for refresh tokens

## Environment Variables

- `PORT` - Gateway port (default: 8080)
- `AUTH_URL` - Auth service URL
- `USER_URL` - User service URL
- `RECIPE_URL` - Recipe service URL
- `JWT_PUBLIC_OR_SHARED_SECRET` - JWT signing secret (must match auth service)
- `FRONTEND_ORIGIN` - Allowed CORS origin (default: http://localhost:5173)

## Routes

### Public Routes

- `GET /health` - Health check
- `POST /api/auth/signup` - User signup (proxied to auth)
- `POST /api/auth/login` - User login (proxied to auth)
- `POST /api/auth/refresh` - Refresh access token (proxied to auth)
- `POST /api/auth/logout` - Logout (proxied to auth)

### Protected Routes (Require JWT)

- `GET /api/users/me` - Get user profile (proxied to user)
- `PATCH /api/users/me` - Update user profile (proxied to user)
- `POST /api/recipes/import/youtube` - Import YouTube recipe (proxied to recipe)
- `GET /api/recipes/import-jobs/:job_id` - Get import job status (proxied to recipe)
- `GET /api/recipes/:recipe_id` - Get recipe (proxied to recipe)

## Authentication

Protected routes require:
- `Authorization: Bearer <access_token>` header

The gateway:
1. Verifies JWT signature and expiration
2. Extracts user ID from JWT `sub` claim
3. Adds `x-user-id` header to downstream requests

## Correlation IDs

All requests get a correlation ID:
- Uses existing `x-request-id` header if present
- Generates new UUID if missing
- Propagates to all downstream services

## Running

```bash
npm install
npm run dev
```

Or with Docker:
```bash
docker compose up --build
```

