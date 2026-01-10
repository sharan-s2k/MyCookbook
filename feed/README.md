# Feed Service

Feed service for MyCookbook - provides a following-only feed showing public cookbooks from users the current user follows.

## Features

- **Fanout-on-Read (Pull Model)**: Queries user followings and public cookbooks on-demand
- **Keyset Pagination**: Efficient cursor-based pagination using (updated_at, id)
- **Protected Endpoints**: Requires gateway token authentication
- **Internal Service Calls**: Uses service tokens for secure internal communication

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

The feed service uses a fanout-on-read approach:

1. Receives request with authenticated user ID from gateway
2. Calls User Service to fetch list of following IDs
3. Calls Cookbook Service to fetch public cookbooks for those owner IDs
4. Returns paginated, sorted results (newest first by updated_at)

## Testing

### Local Development

```bash
cd feed
npm install
npm run dev
```

### Test with curl (via gateway)

```bash
# Get access token first (via login)
TOKEN="your-access-token"

# Get feed
curl -X GET "http://localhost:8080/api/feed/home?limit=20" \
  -H "Authorization: Bearer $TOKEN"

# Get next page
curl -X GET "http://localhost:8080/api/feed/home?cursor=<cursor>&limit=20" \
  -H "Authorization: Bearer $TOKEN"
```
