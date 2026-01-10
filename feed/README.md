# Feed Service

Feed service for MyCookbook - provides a following-only feed showing public cookbooks from users the current user follows.

## Overview

The Feed Service implements a fanout-on-read (pull model) approach for generating user feeds. It queries the user's following list and retrieves public cookbooks from those users, sorted by recency (updated_at). The service uses keyset pagination for efficient infinite scroll.

## Features

- **Fanout-on-Read (Pull Model)**: Queries user followings and public cookbooks on-demand (no pre-computation)
- **Keyset Pagination**: Efficient cursor-based pagination using (updated_at, id) tuple
- **Following-Only Feed**: Only shows public cookbooks from users you follow
- **Protected Endpoints**: Requires gateway token authentication
- **Internal Service Calls**: Uses service tokens for secure internal communication
- **Stateless**: No database, aggregates data from User and Cookbook services

## Endpoints

### GET /health
Health check endpoint.

### GET /feed/home?cursor=<string>&limit=<int>
Get the authenticated user's feed.

- **Query Parameters**:
  - `cursor` (optional): Base64-encoded cursor for pagination
  - `limit` (optional): Number of items per page (default: 20, max: 50)

- **Response**:
  ```json
  {
    "items": [
      {
        "id": "cookbook-id",
        "owner_id": "user-id",
        "title": "Cookbook Title",
        "description": "Cookbook description",
        "visibility": "PUBLIC",
        "recipe_count": 5,
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-02T00:00:00Z",
        "published_at": "2024-01-02T00:00:00Z"
      }
    ],
    "next_cursor": "base64-encoded-cursor" | null
  }
  ```

## Environment Variables

- `PORT`: Service port (default: 8008)
- `SERVICE_TOKEN`: Token for service-to-service authentication
- `GATEWAY_TOKEN`: Token for gateway authentication
- `USER_INTERNAL_URL`: Internal URL for user service (default: http://user:8002)
- `COOKBOOK_INTERNAL_URL`: Internal URL for cookbook service (default: http://cookbook:8006)
- `HTTP_TIMEOUT_MS`: HTTP timeout for internal calls (default: 3000)
- `MAX_OWNER_IDS`: Maximum number of owner IDs to query (default: 500)

## Architecture

- **Framework**: Fastify (TypeScript/Node.js)
- **Database**: None (stateless service)
- **Authentication**: Gateway token authentication
- **Integration**: Calls User Service and Cookbook Service internally
- **Port**: 8008 (default)

## Architecture Flow

The feed service uses a fanout-on-read approach:

1. **Receive Request**: Gateway authenticates user and forwards request with `x-user-id`
2. **Fetch Following IDs**: Call User Service internal endpoint to get list of user IDs being followed
3. **Fetch Public Cookbooks**: Call Cookbook Service internal endpoint to get public cookbooks for those owner IDs
4. **Paginate Results**: Apply keyset pagination using (updated_at, id) cursor
5. **Return Feed**: Return paginated cookbooks sorted by updated_at DESC

## API Endpoints

### Protected Endpoints (Require JWT via Gateway)

#### GET /feed/home

Get the authenticated user's feed (following-only). Returns public cookbooks from users the current user follows.

**Headers**: `Authorization: Bearer <access_token>` (via gateway)

**Query Parameters**:
- `cursor` (optional): Base64-encoded cursor for pagination (format: `base64(updated_at|id)`)
- `limit` (optional): Number of items per page (default: 20, max: 50, min: 1)

**Response** (200 OK):
```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "owner_id": "550e8400-e29b-41d4-a716-446655440001",
      "title": "Cookbook Title",
      "description": "Cookbook description",
      "visibility": "PUBLIC",
      "recipe_count": 5,
      "created_at": "2024-01-01T00:00:00Z",
      "updated_at": "2024-01-02T00:00:00Z",
      "published_at": "2024-01-02T00:00:00Z"
    }
  ],
  "next_cursor": "base64-encoded-cursor" | null
}
```

**Empty Feed** (no following):
```json
{
  "items": [],
  "next_cursor": null
}
```

**Error Responses**:
- `400`: Too many following users (exceeds MAX_OWNER_IDS, default: 500)
- `401`: Unauthorized (missing/invalid token)
- `502`: Upstream service error (User Service or Cookbook Service)

**Example cURL**:
```bash
export ACCESS_TOKEN="your-access-token"

# Get first page of feed
curl -X GET "http://localhost:8080/api/feed/home?limit=20" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq

# Get next page (use cursor from previous response)
export CURSOR="base64-encoded-cursor-from-previous-response"
curl -X GET "http://localhost:8080/api/feed/home?cursor=$CURSOR&limit=20" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq
```

### Health Endpoint

#### GET /health

Health check endpoint.

**Response** (200 OK):
```json
{
  "status": "healthy",
  "service": "feed"
}
```

## Running Locally

### Prerequisites

- Node.js 18+
- TypeScript
- User Service running and accessible
- Cookbook Service running and accessible

### Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set environment variables**:
   ```bash
   export PORT=8008
   export SERVICE_TOKEN="your-service-token"
   export GATEWAY_TOKEN="your-gateway-token"
   export USER_INTERNAL_URL="http://localhost:8002"
   export COOKBOOK_INTERNAL_URL="http://localhost:8006"
   export HTTP_TIMEOUT_MS=3000
   export MAX_OWNER_IDS=500
   ```

3. **Run the service**:
   ```bash
   npm run dev
   ```

Or using Docker (see docker-compose.yml section):

```bash
docker compose up --build
```

## Testing

### Complete Feed Flow

```bash
export ACCESS_TOKEN="your-access-token"

# 1. Get first page of feed
FEED_RESPONSE=$(curl -X GET "http://localhost:8080/api/feed/home?limit=20" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s)

echo "$FEED_RESPONSE" | jq

# 2. Extract next cursor
NEXT_CURSOR=$(echo "$FEED_RESPONSE" | jq -r '.next_cursor')

if [ "$NEXT_CURSOR" != "null" ]; then
  # 3. Get next page
  curl -X GET "http://localhost:8080/api/feed/home?cursor=$NEXT_CURSOR&limit=20" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -s | jq
fi

# 4. Test empty feed (user with no following)
# Note: Returns empty items array if user follows no one
curl -X GET "http://localhost:8080/api/feed/home?limit=20" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -s | jq
```

### Testing Feed with Following

```bash
# Prerequisites:
# 1. User A (current user)
# 2. User B (followed by User A)
# 3. User B has a public cookbook

export USER_A_TOKEN="user-a-access-token"
export USER_B_ID="550e8400-e29b-41d4-a716-446655440001"

# 1. User A follows User B (via user service)
curl -X POST http://localhost:8080/api/users/$USER_B_ID/follow \
  -H "Authorization: Bearer $USER_A_TOKEN" \
  -s | jq

# 2. User B creates a public cookbook (via cookbook service)
# (Use User B's token to create cookbook with visibility: "PUBLIC")

# 3. User A gets feed (should see User B's public cookbook)
curl -X GET "http://localhost:8080/api/feed/home?limit=20" \
  -H "Authorization: Bearer $USER_A_TOKEN" \
  -s | jq
```

## Docker Deployment

### Build and Run

```bash
# Build image
docker build -t feed-service .

# Run container
docker run -p 8008:8008 \
  -e SERVICE_TOKEN="your-service-token" \
  -e GATEWAY_TOKEN="your-gateway-token" \
  -e USER_INTERNAL_URL="http://user:8002" \
  -e COOKBOOK_INTERNAL_URL="http://cookbook:8006" \
  feed-service
```

### Docker Compose

Create `docker-compose.yml` for standalone deployment (see docker-compose.yml section below).

## Keyset Pagination

### Cursor Format

**Encoding**: Base64-encoded string containing `updated_at|id`
- **Format**: `base64(updated_at + "|" + id)`
- **Example**: `base64("2024-01-02T00:00:00Z|550e8400-e29b-41d4-a716-446655440000")`

**Decoding**:
```typescript
const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
const [published_at, id] = decoded.split('|');
```

### Pagination Logic

**First Page** (no cursor):
```sql
SELECT * FROM cookbooks
WHERE owner_id = ANY(owner_ids) AND visibility = 'PUBLIC'
ORDER BY updated_at DESC, id DESC
LIMIT 20
```

**Subsequent Pages** (with cursor):
```sql
SELECT * FROM cookbooks
WHERE owner_id = ANY(owner_ids) 
  AND visibility = 'PUBLIC'
  AND (
    updated_at < $cursor_updated_at 
    OR (updated_at = $cursor_updated_at AND id < $cursor_id)
  )
ORDER BY updated_at DESC, id DESC
LIMIT 20
```

**Next Cursor**: Generated from last item's `(updated_at, id)` tuple

## Performance Considerations

### Query Optimization

- **Composite Index**: Cookbook Service uses `(owner_id, updated_at DESC, id DESC) WHERE visibility = 'PUBLIC'` for efficient feed queries
- **Limit Fetch**: Fetch `limit + 1` items to determine if there's a next page
- **Owner ID Limit**: Maximum 500 owner IDs to prevent abuse (configurable via `MAX_OWNER_IDS`)

### Internal Service Calls

- **User Service**: Single call to get following IDs (O(1) operation)
- **Cookbook Service**: Single call with owner IDs array (O(n log n) with index)
- **HTTP Timeout**: 3 seconds default (configurable via `HTTP_TIMEOUT_MS`)
- **Retries**: 1 retry on timeout/connection errors (with 100ms delay)

### Scalability

**Current Design (Fanout-on-Read)**:
- **Pros**: Simple, no pre-computation, real-time data
- **Cons**: O(n) query time where n = number of following

**Future Enhancement (Fanout-on-Write)**:
- Pre-compute feed entries when cookbook is published
- Store feed items in database or cache
- Trade-off: More storage, faster reads

## Security Considerations

1. **Gateway Token**: All endpoints verify `x-gateway-token` header
2. **User ID**: Extracted from gateway (verified JWT), never from client
3. **Service Token**: Internal service calls use `x-service-token` header
4. **Owner ID Limit**: Maximum 500 owner IDs prevents abuse
5. **UUID Validation**: All IDs validated as UUIDs before service calls

## Integration

### Upstream (Calls This Service)

- **Gateway**: Routes `/api/feed/*` requests to this service

### Downstream (This Service Calls)

1. **User Service**: `GET /internal/users/:userId/following-ids` - Get following IDs
2. **Cookbook Service**: `GET /internal/cookbooks/public` - Get public cookbooks by owner IDs

### Dependencies

- **User Service**: Must be running and accessible
- **Cookbook Service**: Must be running and accessible
- **No Database**: Service is stateless

See [Design.md](./Design.md) for detailed architecture and integration patterns.
