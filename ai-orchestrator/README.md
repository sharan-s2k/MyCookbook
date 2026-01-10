# AI Orchestrator Service

AI service for extracting structured recipes from transcripts using Google Gemini. Provides recipe extraction from YouTube transcripts and cook-mode chat assistance.

## Overview

The AI Orchestrator is a FastAPI service that processes video transcripts and extracts structured recipe data (ingredients, steps with timestamps) using Google Gemini AI. It also provides a chat interface for cooking assistance during Cook Mode.

## Responsibilities

- **Recipe Extraction**: Extract structured recipe information (title, ingredients, steps with timestamps) from video transcripts
- **Chat Assistance**: Provide cooking Q&A assistance during Cook Mode based on recipe context
- **Schema Validation**: Ensure AI responses conform to expected JSON schemas
- **Error Handling**: Gracefully handle AI API failures with retries and fallbacks

## Architecture

- **Framework**: FastAPI (Python)
- **AI Provider**: Google Gemini 2.5 Flash (configurable)
- **Authentication**: Service-to-service token authentication
- **Port**: 8004 (default)

## Database

This service is stateless and does not use a database. All processing is done in-memory with AI API calls.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8004` | Service port |
| `GEMINI_API_KEY` | **Required** | Google Gemini API key |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model to use |
| `REQUEST_TIMEOUT_SEC` | `60` | Request timeout in seconds |
| `FRONTEND_ORIGIN` | `http://localhost:5173` | Allowed CORS origin |
| `SERVICE_TOKEN` | **Required** | Token for service-to-service authentication |

## API Endpoints

### POST /extract

Extract recipe from transcript. This endpoint is called by the workers service after fetching YouTube transcripts.

**Authentication**: Requires `x-service-token` header

**Request**:
```json
{
  "source_type": "youtube",
  "source_ref": "https://www.youtube.com/watch?v=...",
  "transcript": "[0.00s] Hello and welcome...\n[30.45s] First, we need 2 cups of flour...",
  "options": {
    "include_timestamps": true
  }
}
```

**Response**:
```json
{
  "title": "Perfect Chocolate Chip Cookies",
  "description": "A classic recipe for soft and chewy chocolate chip cookies",
  "ingredients": [
    {
      "qty": "2.5",
      "unit": "cup",
      "item": "all-purpose flour"
    },
    {
      "qty": "1",
      "unit": "cup",
      "item": "butter, softened"
    },
    {
      "qty": "To taste",
      "unit": "",
      "item": "salt"
    }
  ],
  "steps": [
    {
      "index": 1,
      "text": "Preheat oven to 375°F (190°C)",
      "timestamp_sec": 120
    },
    {
      "index": 2,
      "text": "Mix flour, butter, and sugar in a large bowl",
      "timestamp_sec": 180
    }
  ]
}
```

**Error Response** (422):
```json
{
  "detail": "Invalid response format: Missing 'title' in response"
}
```

### POST /chat

Answer cooking questions during Cook Mode. Provides context-aware assistance based on the recipe being cooked.

**Authentication**: Requires `x-service-token` header

**Request**:
```json
{
  "recipe_id": "uuid",
  "title": "Perfect Chocolate Chip Cookies",
  "description": "A classic recipe...",
  "ingredients": [
    {
      "qty": "2.5",
      "unit": "cup",
      "item": "all-purpose flour"
    }
  ],
  "steps": [
    {
      "text": "Preheat oven to 375°F",
      "index": 1
    }
  ],
  "user_message": "Can I substitute butter with oil?",
  "current_step_index": 0
}
```

**Response**:
```json
{
  "message": "Yes, you can substitute butter with oil, but it will change the texture. Use 3/4 cup of oil for 1 cup of butter. The cookies may be slightly more crispy."
}
```

### GET /health

Health check endpoint. No authentication required.

**Response**:
```json
{
  "status": "healthy",
  "service": "ai-orchestrator"
}
```

## Running Locally

### Prerequisites

- Python 3.11+
- Google Gemini API key

### Setup

1. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Set environment variables**:
   ```bash
   export GEMINI_API_KEY="your-gemini-api-key"
   export SERVICE_TOKEN="your-service-token"
   export PORT=8004
   ```

3. **Run the service**:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8004 --reload
   ```

Or using Docker:

```bash
docker compose up --build
```

## Testing

### Test Health Endpoint

```bash
curl http://localhost:8004/health
```

### Test Recipe Extraction (with service token)

```bash
# Set your service token
export SERVICE_TOKEN="your-service-token"

# Test extraction
curl -X POST http://localhost:8004/extract \
  -H "Content-Type: application/json" \
  -H "x-service-token: $SERVICE_TOKEN" \
  -d '{
    "source_type": "youtube",
    "source_ref": "https://www.youtube.com/watch?v=test",
    "transcript": "[0.00s] In this video, we will make chocolate chip cookies.\n[30.00s] First, preheat your oven to 375 degrees.\n[45.00s] Then, mix 2 cups of flour with 1 cup of butter.",
    "options": {
      "include_timestamps": true
    }
  }'
```

### Test Chat Endpoint

```bash
curl -X POST http://localhost:8004/chat \
  -H "Content-Type: application/json" \
  -H "x-service-token: $SERVICE_TOKEN" \
  -d '{
    "recipe_id": "test-id",
    "title": "Chocolate Chip Cookies",
    "ingredients": [
      {"qty": "2", "unit": "cup", "item": "flour"}
    ],
    "steps": [
      {"text": "Preheat oven to 375°F", "index": 1}
    ],
    "user_message": "What temperature should the oven be?",
    "current_step_index": 0
  }'
```

## Docker Deployment

### Build and Run

```bash
docker build -t ai-orchestrator .
docker run -p 8004:8004 \
  -e GEMINI_API_KEY="your-key" \
  -e SERVICE_TOKEN="your-token" \
  ai-orchestrator
```

Or using docker-compose:

```bash
# Set environment variables in .env file or export them
export GEMINI_API_KEY="your-key"
export SERVICE_TOKEN="your-token"

docker compose up --build
```

### Docker Compose Configuration

The service includes a `docker-compose.yml` for standalone deployment:

```yaml
services:
  ai-orchestrator:
    build: .
    ports:
      - "8004:8004"
    environment:
      PORT: 8004
      GEMINI_API_KEY: ${GEMINI_API_KEY}
      GEMINI_MODEL: ${GEMINI_MODEL:-gemini-2.5-flash}
      REQUEST_TIMEOUT_SEC: ${REQUEST_TIMEOUT_SEC:-60}
      SERVICE_TOKEN: ${SERVICE_TOKEN}
```

## Model Configuration

### Gemini 2.5 Flash

- **Default Model**: `gemini-2.5-flash`
- **Why Flash**: Cost-efficient, fast response times suitable for recipe extraction
- **JSON Mode**: Uses `response_mime_type: "application/json"` to ensure structured output
- **Temperature**: 0.3 for extraction (deterministic), 0.7 for chat (creative)

### Changing Models

Set `GEMINI_MODEL` environment variable:

```bash
export GEMINI_MODEL="gemini-2.0-flash-exp"  # Experimental model
export GEMINI_MODEL="gemini-pro"            # More powerful but slower
```

## Error Handling

The service includes comprehensive error handling:

1. **JSON Parsing**: Attempts to repair invalid JSON from AI responses
2. **Validation**: Validates all required fields before returning
3. **Retries**: Workers service handles retries, not this service
4. **Error Codes**:
   - `422`: Invalid request/response format
   - `503`: Gemini API errors
   - `500`: Internal server errors

## Performance Considerations

- **Request Timeout**: Default 60 seconds (configurable)
- **Token Limits**: Chat endpoint limits responses to 300 tokens for cost efficiency
- **Concurrent Requests**: FastAPI handles async requests efficiently
- **Caching**: No caching implemented (stateless service)

## Security

- **Service Token**: All endpoints except `/health` require `x-service-token` header
- **CORS**: Restricted to frontend origin only (not wildcard)
- **Input Validation**: All inputs validated via Pydantic models
- **No User Data Storage**: Service is stateless and doesn't store any user data

## Integration

This service is called by:

- **Workers Service**: Calls `/extract` after fetching YouTube transcripts
- **Frontend (via Gateway)**: Calls `/chat` during Cook Mode (if implemented)

See [Design.md](./Design.md) for detailed architecture and integration patterns.
