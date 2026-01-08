# Search Service

Search service for MyCookbook using OpenSearch for global search functionality.

## Features

- Global search for users and recipes
- OpenSearch indexing with highlighting
- Kafka-based event-driven indexing
- Access control: recipes filtered by owner, users are public

## Environment Variables

- `PORT` - Service port (default: 8007)
- `OPENSEARCH_URL` - OpenSearch cluster URL
- `OPENSEARCH_INDEX_NAME` - Index name (default: cookflow_search)
- `KAFKA_BROKERS` - Kafka broker addresses (comma-separated)
- `KAFKA_TOPIC_USERS` - Kafka topic for user events (default: user.events)
- `KAFKA_TOPIC_RECIPES` - Kafka topic for recipe events (default: recipe.events)
- `SERVICE_TOKEN` - Service-to-service authentication token
- `GATEWAY_TOKEN` - Gateway authentication token
- `USER_SERVICE_URL` - User service URL for reindexing
- `RECIPE_SERVICE_URL` - Recipe service URL for reindexing

## API Endpoints

### Public (Protected via Gateway)

- `GET /search?q=<query>&scope=all|users|recipes&limitUsers=<n>&limitRecipes=<n>` - Search endpoint

### Internal

- `POST /internal/index/upsert` - Upsert documents (bulk supported)
- `POST /internal/index/delete` - Delete documents
- `POST /internal/reindex/users` - Reindex all users
- `POST /internal/reindex/recipes` - Reindex all recipes

## Running

```bash
npm install
npm run dev
```

Or with Docker:
```bash
docker compose up --build
```

