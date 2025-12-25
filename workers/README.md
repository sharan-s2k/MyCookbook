# Workers Service

Background workers for processing recipe import jobs. Consumes Kafka messages and processes YouTube recipe imports.

## Responsibilities

- Consume Kafka messages for recipe import jobs
- Fetch YouTube transcripts
- Call AI orchestrator to extract recipe information
- Store recipes via recipe service internal endpoints
- Update job status throughout the process

## Environment Variables

- `KAFKA_BROKERS` - Comma-separated Kafka broker addresses
- `KAFKA_TOPIC_JOBS` - Kafka topic to consume from (default: recipe.jobs)
- `RECIPE_INTERNAL_URL` - Recipe service internal endpoint URL
- `AI_ORCHESTRATOR_URL` - AI orchestrator service URL
- `SERVICE_TOKEN` - Token for service-to-service authentication

## Process Flow

1. Consume job message from Kafka
2. Update job status to RUNNING
3. Fetch YouTube transcript
4. Call AI orchestrator to extract recipe
5. Create recipe via recipe service internal endpoint
6. Update job status to READY (or FAILED on error)

## Error Handling

- Transcript fetch failures → Job marked FAILED with error message
- AI extraction failures → Retry up to 2 times, then FAILED
- Invalid AI responses → Job marked FAILED with validation error

## Health Check

- `GET /health` - Health check endpoint (port 8005)

## Running

```bash
npm install
npm run dev
```

Or with Docker:
```bash
docker compose up --build
```

## Dependencies

- `yt-dlp` - Fetches YouTube video transcripts (installed in Docker image via Python pip)
- `kafkajs` - Kafka consumer client

## Transcript Fetching

The service uses `yt-dlp` to fetch YouTube video transcripts. The Docker image includes Python 3, pip, ffmpeg, and yt-dlp. On startup, the worker verifies that yt-dlp is available and will fail fast with a clear error if it's missing.

