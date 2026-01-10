# Search Service - Design Document

## Table of Contents

1. [High-Level Design (HLD)](#high-level-design-hld)
2. [Low-Level Design (LLD)](#low-level-design-lld)
3. [Search Flow](#search-flow)
4. [Indexing Flow](#indexing-flow)
5. [Access Control](#access-control)

## High-Level Design (HLD)

### System Context

The Search Service provides global search functionality using OpenSearch.

```mermaid
graph TB
    Gateway[API Gateway]
    User[User Service]
    Recipe[Recipe Service]
    Kafka[Kafka Topics<br/>user.events, recipe.events]
    Search[Search Service<br/>Fastify + OpenSearch + Kafka]
    OpenSearch[(OpenSearch<br/>cookflow_search Index)]
    
    Gateway -->|GET /api/search<br/>x-user-id: <userId>| Search
    Kafka -->|Consume Events| Search
    User -->|GET /internal/users/all<br/>Reindexing| Search
    Recipe -->|GET /internal/recipes/all<br/>Reindexing| Search
    Search -->|Query| OpenSearch
    Search -->|Index Documents| OpenSearch
    Search -->|Delete Documents| OpenSearch
```

### Responsibilities

1. **Global Search**: Full-text search across users and recipes
2. **Event-Driven Indexing**: Consume Kafka events for real-time index updates
3. **Manual Indexing**: Provide reindexing endpoints for bulk operations
4. **Access Control**: Enforce recipe access control (filter by owner)
5. **Highlighting**: Provide search result highlights

## Low-Level Design (LLD)

### Service Architecture

```mermaid
graph LR
    subgraph "Search Service"
        Fastify[Fastify App]
        Search[GET /search]
        Upsert[POST /internal/index/upsert]
        Delete[POST /internal/index/delete]
        ReindexUsers[POST /internal/reindex/users]
        ReindexRecipes[POST /internal/reindex/recipes]
        Health[GET /health]
        GatewayAuth[Gateway Token<br/>Verification]
        KafkaConsumer[Kafka Consumer<br/>Event-Driven Indexing]
        OpenSearchClient[OpenSearch Client]
        UserClient[User Service Client]
        RecipeClient[Recipe Service Client]
    end
    
    subgraph "External"
        OpenSearch[OpenSearch Cluster]
        Kafka[Kafka Topics]
        UserSvc[User Service]
        RecipeSvc[Recipe Service]
    end
    
    Fastify --> GatewayAuth
    GatewayAuth --> Search
    Fastify --> Upsert
    Fastify --> Delete
    Fastify --> ReindexUsers
    Fastify --> ReindexRecipes
    Fastify --> Health
    Search --> OpenSearchClient
    Upsert --> OpenSearchClient
    Delete --> OpenSearchClient
    ReindexUsers --> UserClient
    ReindexRecipes --> RecipeClient
    ReindexUsers --> OpenSearchClient
    ReindexRecipes --> OpenSearchClient
    KafkaConsumer --> Kafka
    KafkaConsumer --> OpenSearchClient
    OpenSearchClient --> OpenSearch
    UserClient --> UserSvc
    RecipeClient --> RecipeSvc
```

### Component Details

#### 1. OpenSearch Index Schema

**Index Name**: `cookflow_search` (configurable)

**Document ID Format**: `{type}_{id}` (e.g., `user_550e8400-...`, `recipe_550e8400-...`)

**Index Settings**:
```json
{
  "settings": {
    "analysis": {
      "analyzer": {
        "default": {
          "type": "standard"
        }
      }
    },
    "number_of_shards": 1,
    "number_of_replicas": 0
  }
}
```

**Field Mappings**:
- **type**: `keyword` (user | recipe)
- **id**: `keyword`
- **title**: `text` with `keyword` subfield (display name for users, recipe title for recipes)
- **subtitle**: `text` (username for users, description for recipes)
- **content**: `text` (bio for users, ingredients text for recipes)
- **ownerId**: `text` with `keyword` subfield (for recipes, query-time filtering)
- **username**: `keyword` (for users)
- **displayName**: `text` (for users)
- **avatarUrl**: `keyword` (for users)
- **thumbnailUrl**: `keyword` (for recipes)
- **updatedAt**: `date` (for sorting)

## Search Flow

### Complete Search Flow

```mermaid
sequenceDiagram
    participant Client
    participant Gateway
    participant Search as Search Service
    participant OpenSearch as OpenSearch
    
    Client->>Gateway: GET /api/search?q=chocolate&scope=all
    Gateway->>Gateway: Verify JWT (extract userId)
    Gateway->>Search: GET /search?q=chocolate&scope=all<br/>x-user-id: <userId><br/>x-gateway-token: <token>
    Search->>Search: Verify gateway token
    Search->>Search: Validate query and scope
    alt scope === 'all' or scope === 'users'
        Search->>OpenSearch: Search users query<br/>(multi_match on displayName, username, title, content)
        OpenSearch-->>Search: User results (with highlights)
    end
    alt scope === 'all' or scope === 'recipes'
        Search->>Search: Verify userId exists (from gateway)
        Search->>OpenSearch: Search recipes query<br/>(match on title)<br/>Filter: ownerId.keyword = userId
        OpenSearch-->>Search: Recipe results (filtered by owner, with highlights)
        Search->>Search: Defense-in-depth: Verify ownerId matches
        Search->>Search: Drop any mismatched results (log warning)
    end
    Search->>Search: Format response based on scope
    Search-->>Gateway: 200 OK (users: [...], recipes: [...])
    Gateway-->>Client: 200 OK (search results)
```

### Search Query Construction

**User Search Query**:
```json
{
  "size": 10,
  "query": {
    "bool": {
      "must": [
        { "term": { "type.keyword": "user" } },
        {
          "multi_match": {
            "query": "chocolate",
            "fields": ["displayName^3", "username^4", "title^2", "content^1"],
            "type": "best_fields",
            "operator": "or"
          }
        }
      ]
    }
  },
  "highlight": {
    "fields": {
      "displayName": {},
      "username": {},
      "content": {}
    }
  }
}
```

**Recipe Search Query** (with access control):
```json
{
  "size": 10,
  "query": {
    "bool": {
      "must": [
        { "term": { "type.keyword": "recipe" } },
        {
          "match": {
            "title": "chocolate"
          }
        }
      ],
      "filter": [
        { "term": { "ownerId.keyword": "550e8400-..." } }
      ]
    }
  },
  "highlight": {
    "fields": {
      "title": {}
    }
  }
}
```

## Indexing Flow

### Event-Driven Indexing (Kafka Consumer)

```mermaid
sequenceDiagram
    participant Kafka as Kafka Topics
    participant Consumer as Kafka Consumer
    participant Search as Search Service
    participant OpenSearch as OpenSearch
    
    Kafka->>Consumer: user.created event<br/>{id, username, display_name, ...}
    Consumer->>Search: eachMessage handler
    Search->>Search: Transform user to document<br/>{type: 'user', id, title, subtitle, ...}
    Search->>OpenSearch: index({ id: 'user_{id}', body: document })
    OpenSearch-->>Search: Success
    
    Kafka->>Consumer: recipe.created event<br/>{id, owner_id, title, ingredients, ...}
    Consumer->>Search: eachMessage handler
    Search->>Search: Transform recipe to document<br/>{type: 'recipe', id, ownerId, title, ...}
    Search->>OpenSearch: index({ id: 'recipe_{id}', body: document })
    OpenSearch-->>Search: Success
    
    Kafka->>Consumer: recipe.deleted event<br/>{id}
    Consumer->>Search: eachMessage handler
    Search->>OpenSearch: delete({ id: 'recipe_{id}' })
    OpenSearch-->>Search: Success (or 404 if already deleted)
```

### Manual Reindexing Flow

```mermaid
sequenceDiagram
    participant Admin
    participant Search as Search Service
    participant User as User Service
    participant Recipe as Recipe Service
    participant OpenSearch as OpenSearch
    
    Admin->>Search: POST /internal/reindex/users<br/>x-service-token: <token>
    Search->>Search: Verify service token
    Search->>User: GET /internal/users/all<br/>x-service-token: <token>
    User-->>Search: Array of all users
    Search->>Search: Transform users to documents
    Search->>OpenSearch: bulk({ body: [{index, document}, ...] })
    OpenSearch-->>Search: Success (indexed count)
    Search-->>Admin: 200 OK (indexed: 150)
    
    Admin->>Search: POST /internal/reindex/recipes<br/>x-service-token: <token>
    Search->>Recipe: GET /internal/recipes/all<br/>x-service-token: <token>
    Recipe-->>Search: Array of all recipes
    Search->>Search: Transform recipes to documents<br/>(extract ingredients text, add ownerId)
    Search->>OpenSearch: bulk({ body: [{index, document}, ...] })
    OpenSearch-->>Search: Success (indexed count)
    Search-->>Admin: 200 OK (indexed: 500)
```

## Access Control

### Recipe Search Access Control

**Query-Time Enforcement**:
- **Filter**: `filter: [{ term: { 'ownerId.keyword': userId } }]` - Only user's own recipes
- **Defense-in-Depth**: Verify ownerId matches after receiving results (should never drop, but prevents regressions)

**Access Control Flow**:
```mermaid
flowchart TD
    Start([GET /search?scope=recipes]) --> ExtractUserId[Extract User ID from Gateway<br/>Verified JWT]
    ExtractUserId --> BuildQuery[Build OpenSearch Query<br/>Filter: ownerId.keyword = userId]
    BuildQuery --> ExecuteQuery[Execute OpenSearch Query]
    ExecuteQuery --> Results[Get Results]
    Results --> VerifyOwnerId{For Each Result:<br/>ownerId === userId?}
    VerifyOwnerId -->|Matches| Include[Include Result]
    VerifyOwnerId -->|Mismatch| LogWarning[Log Security Warning<br/>Drop Result]
    Include --> ReturnResults[Return Filtered Results]
    LogWarning --> ReturnResults
    ReturnResults --> End([Client Response])
```

**Key Points**:
- **Query Filter**: Primary enforcement at query time
- **Server Verification**: Defense-in-depth after receiving results
- **Logging**: Warns if any hits are dropped (security audit trail)

### User Search Access Control

- **Public**: All users are searchable (no filtering)
- **No Access Control**: User search is public

## Performance Considerations

### Search Performance

**Query Performance**:
- **Text Search**: O(log n) - OpenSearch inverted index
- **Filter Performance**: O(log n) - OpenSearch term filter
- **Highlighting**: Minimal overhead

**Index Settings**:
- **Shards**: 1 (for local dev, scale horizontally in production)
- **Replicas**: 0 (for local dev, add replicas in production for HA)

### Indexing Performance

**Bulk Operations**:
- **Reindexing**: Fetches all documents, then bulk indexes (efficient for large datasets)
- **Event-Driven**: Individual document indexing (real-time updates)

**OpenSearch Bulk API**:
- **Batch Size**: OpenSearch handles bulk operations efficiently
- **Refresh**: Refresh index after bulk operations (configurable)

## Security Considerations

1. **Gateway Token**: All protected endpoints verify `x-gateway-token` header
2. **Service Token**: Internal endpoints require `x-service-token` header
3. **User ID**: Extracted from gateway (verified JWT), never from client
4. **Access Control**: Recipes filtered by ownerId at query time + server-side verification
5. **OpenSearch Security**: OpenSearch connection should be secured in production (TLS, authentication)
6. **Input Sanitization**: Search queries validated and sanitized

## Future Enhancements

1. **Advanced Search**: Filters, sorting, faceted search
2. **Search Analytics**: Track popular searches, trends
3. **Auto-Complete**: Search suggestions
4. **Fuzzy Search**: Typo-tolerant search
5. **Multi-Language**: Language detection and indexing
6. **Search Ranking**: Relevance-based ranking (TF-IDF, BM25 tuning)
7. **Search History**: User search history tracking
8. **Personalized Search**: Personalized search results based on user preferences

