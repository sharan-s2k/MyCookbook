# AI Orchestrator Service

AI service for extracting structured recipes from transcripts using OpenAI.

## Responsibilities

- Extract recipe information (title, ingredients, steps) from video transcripts
- Use OpenAI GPT models to parse unstructured text
- Return structured JSON with timestamps

## Environment Variables

- `PORT` - Service port (default: 8004)
- `GEMINI_API_KEY` - Google Gemini API key (required)
- `GEMINI_MODEL` - Gemini model to use (default: gemini-2.5-flash)
- `REQUEST_TIMEOUT_SEC` - Request timeout in seconds (default: 60)

## API Endpoints

### POST /extract
Extract recipe from transcript.

**Request:**
```json
{
  "source_type": "youtube",
  "source_ref": "https://www.youtube.com/watch?v=...",
  "transcript": "Full transcript text...",
  "options": {
    "include_timestamps": true
  }
}
```

**Response:**
```json
{
  "title": "Recipe Title",
  "description": "Optional description",
  "ingredients": [
    "2 cups flour",
    "1 tablespoon olive oil"
  ],
  "steps": [
    {
      "index": 1,
      "text": "Mix flour and water",
      "timestamp_sec": 30
    },
    {
      "index": 2,
      "text": "Knead the dough",
      "timestamp_sec": 120
    }
  ]
}
```

### GET /health
Health check endpoint.

## Running

```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8004
```

Or with Docker:
```bash
docker compose up --build
```

## Gemini Model

Uses `gemini-2.5-flash` by default for cost efficiency. Can be changed via `GEMINI_MODEL` env var.

The service uses `response_mime_type: "application/json"` to ensure JSON output.

