import { Kafka } from 'kafkajs';
import Fastify from 'fastify';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

// Handle both comma-separated and single broker strings
const KAFKA_BROKERS_STR = process.env.KAFKA_BROKERS!;
const KAFKA_BROKERS = KAFKA_BROKERS_STR.includes(',') 
  ? KAFKA_BROKERS_STR.split(',').map(b => b.trim())
  : [KAFKA_BROKERS_STR.trim()];
const KAFKA_TOPIC_JOBS = process.env.KAFKA_TOPIC_JOBS!;
const RECIPE_INTERNAL_URL = process.env.RECIPE_INTERNAL_URL!;
const AI_ORCHESTRATOR_URL = process.env.AI_ORCHESTRATOR_URL!;
const SERVICE_TOKEN = process.env.SERVICE_TOKEN!;
const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '4', 10);

const kafka = new Kafka({
  brokers: KAFKA_BROKERS,
  clientId: 'recipe-workers',
});

const consumer = kafka.consumer({ 
  groupId: 'recipe-workers-group',
  sessionTimeout: 30000, // 30s
  heartbeatInterval: 3000, // 3s
  maxBytesPerPartition: 1048576, // 1MB
  maxWaitTimeInMs: 5000, // 5s
  retry: {
    retries: 8,
    initialRetryTime: 100,
    multiplier: 2,
    maxRetryTime: 30000,
  },
});

// Health check server
const fastify = Fastify({ logger: true });

fastify.get('/health', async () => {
  return { status: 'healthy', service: 'workers' };
});

const execFileAsync = promisify(execFile);

// Startup check: Verify yt-dlp is available
async function checkYtDlp() {
  try {
    const { stdout } = await execFileAsync('yt-dlp', ['--version']);
    const version = stdout.trim();
    console.log(`yt-dlp available: ${version}`);
    return true;
  } catch (error: any) {
    console.error('ERROR: yt-dlp is not available:', error.message);
    console.error('Worker will fail fast. Ensure yt-dlp is installed in the Docker image.');
    process.exit(1);
  }
}

// Extract video ID from YouTube URL
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

// Parse VTT file to segments
interface TranscriptSegment {
  start: number;
  dur: number;
  text: string;
}

function parseVttToSegments(vttText: string): TranscriptSegment[] {
  const lines = vttText.split(/\r?\n/);
  const segments: TranscriptSegment[] = [];

  const timeToSec = (t: string): number => {
    // Format: 00:01:02.345 or 01:02.345
    const parts = t.trim().split(':');
    if (parts.length === 3) {
      // HH:MM:SS.mmm
      const [hh, mm, rest] = parts;
      const [ss, ms] = rest.split('.');
      return Number(hh) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms || 0) / 1000;
    } else if (parts.length === 2) {
      // MM:SS.mmm
      const [mm, rest] = parts;
      const [ss, ms] = rest.split('.');
      return Number(mm) * 60 + Number(ss) + Number(ms || 0) / 1000;
    }
    return 0;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.includes('-->')) continue;

    const parts = line.split('-->').map(s => s.trim().split(' ')[0]);
    const start = timeToSec(parts[0]);
    const end = timeToSec(parts[1]);

    // Collect text lines until blank line
    const textLines: string[] = [];
    i++;
    while (i < lines.length && lines[i].trim() !== '') {
      // Strip HTML tags like <c>...</c> and any <...>
      const cleaned = lines[i].trim().replace(/<[^>]+>/g, '');
      if (cleaned) {
        textLines.push(cleaned);
      }
      i++;
    }

    const text = textLines.join(' ').replace(/\s+/g, ' ').trim();
    if (text && start >= 0 && end > start) {
      segments.push({
        start,
        dur: Math.max(0, end - start),
        text,
      });
    }
  }

  return segments;
}

// Store transcript segments
async function storeTranscript(
  jobId: string,
  segments: TranscriptSegment[],
  transcriptText: string
): Promise<void> {
  const response = await fetch(`${RECIPE_INTERNAL_URL}/internal/import-jobs/${jobId}/transcript`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-service-token': SERVICE_TOKEN,
    },
    body: JSON.stringify({
      provider: 'yt-dlp',
      lang: 'en',
      segments,
      transcript_text: transcriptText,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to store transcript: ${error}`);
  }

  const result = await response.json();
  console.log(`Stored transcript segments: ${result.segment_count || segments.length} for jobId=${jobId}`);
}

// Fetch YouTube transcript using yt-dlp
async function fetchTranscript(url: string, jobId: string): Promise<{ transcriptText: string; segments: TranscriptSegment[] }> {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error('Invalid YouTube URL');
  }

  console.log(`Fetching transcript via yt-dlp... url=${url} jobId=${jobId}`);

  // Validate jobId to prevent path traversal attacks
  if (jobId.includes('..') || jobId.includes('/') || jobId.includes('\\')) {
    throw new Error('Invalid job ID: path traversal not allowed');
  }

  // Create per-job temp directory
  const tmpDir = path.join('/tmp/mycookbook', jobId);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    const outTemplate = path.join(tmpDir, '%(id)s.%(ext)s');

    const args = [
      url,
      '--skip-download',
      '--write-auto-subs',
      '--sub-lang', 'en',
      '--sub-format', 'vtt',
      '-o', outTemplate,
    ];

    try {
      // Run yt-dlp with timeout (90 seconds)
      const timeout = 90000;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('yt-dlp timeout after 90s')), timeout);
      });

      await Promise.race([
        execFileAsync('yt-dlp', args, { maxBuffer: 1024 * 1024 * 50 }),
        timeoutPromise,
      ]);
    } catch (error: any) {
      const errorMsg = error.stderr?.toString() || error.message || String(error);
      const errorTail = errorMsg.split('\n').slice(-5).join(' ');
      throw new Error(`yt-dlp failed: ${errorTail}`);
    }

    // Find produced .vtt file
    const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.vtt'));
    if (!files.length) {
      throw new Error('yt-dlp produced no VTT files');
    }

    // Prefer files containing .en. or ending .en.vtt
    let vttFile = files.find(f => f.includes('.en.') || f.endsWith('.en.vtt'));
    if (!vttFile) {
      vttFile = files[0]; // Fallback to first vtt file
    }

    const vttPath = path.join(tmpDir, vttFile);
    const vttText = fs.readFileSync(vttPath, 'utf-8');
    const segments = parseVttToSegments(vttText);

    console.log(`yt-dlp wrote vtt: ${vttFile}`);
    console.log(`Parsed segments: ${segments.length}`);

    if (segments.length === 0) {
      throw new Error('Parsed transcript has no segments');
    }

    // Format transcript with timestamps for AI orchestrator
    // Cap to 2500 segments for safety
    const capped = segments.slice(0, 2500);
    const transcriptText = capped
      .map((seg) => `[${seg.start.toFixed(2)}s] ${seg.text}`)
      .join('\n');

    // Store transcript segments in DB before returning
    await storeTranscript(jobId, segments, transcriptText);

    return { transcriptText, segments };
  } finally {
    // Cleanup temp directory - always runs even if errors occur
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.warn(`Failed to cleanup temp dir ${tmpDir}:`, cleanupError);
    }
  }
}

// Retry helper with exponential backoff and jitter
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000,
  label: string = 'operation'
): Promise<T> {
  let lastError: Error;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      if (attempt === maxRetries) {
        break;
      }
      // Exponential backoff with jitter (±20%)
      const delay = baseDelayMs * Math.pow(2, attempt);
      const jitter = delay * 0.2 * (Math.random() * 2 - 1); // ±20%
      const backoffMs = Math.max(100, delay + jitter);
      console.log(`${label} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${backoffMs.toFixed(0)}ms:`, error.message);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
    }
  }
  throw lastError!;
}

// Update job status (with retry)
async function updateJobStatus(
  jobId: string,
  status: 'RUNNING' | 'FAILED' | 'READY',
  errorMessage?: string,
  recipeId?: string
) {
  await retryWithBackoff(async () => {
    const response = await fetch(`${RECIPE_INTERNAL_URL}/internal/import-jobs/${jobId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-service-token': SERVICE_TOKEN,
      },
      body: JSON.stringify({
        status,
        error_message: errorMessage,
        recipe_id: recipeId,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to update job status: ${error}`);
    }
  }, 3, 500, `updateJobStatus(${jobId})`);
}

// Create recipe from import job (with retry)
async function createRecipeFromJob(
  jobId: string,
  ownerId: string,
  sourceRef: string,
  title: string,
  description: string | null,
  ingredients: string[],
  steps: Array<{ index: number; text: string; timestamp_sec: number }>,
  rawTranscript: string
) {
  return await retryWithBackoff(async () => {
    const response = await fetch(`${RECIPE_INTERNAL_URL}/internal/recipes/from-import-job`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-service-token': SERVICE_TOKEN,
      },
      body: JSON.stringify({
        job_id: jobId,
        owner_id: ownerId,
        source_ref: sourceRef,
        title,
        description,
        ingredients,
        steps,
        raw_transcript: rawTranscript,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create recipe: ${error}`);
    }

    const result = await response.json();
    return result.recipe_id;
  }, 3, 1000, `createRecipeFromJob(${jobId})`);
}

// Call AI orchestrator
async function extractRecipe(sourceRef: string, transcript: string) {
  const response = await fetch(`${AI_ORCHESTRATOR_URL}/extract`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-service-token': SERVICE_TOKEN,
    },
    body: JSON.stringify({
      source_type: 'youtube',
      source_ref: sourceRef,
      transcript: transcript,
      options: {
        include_timestamps: true,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AI extraction failed: ${error}`);
  }

  return await response.json();
}

// Check if job is in terminal state (best-effort to avoid wasted work)
async function checkJobStatus(jobId: string): Promise<string | null> {
  try {
    const response = await fetch(`${RECIPE_INTERNAL_URL}/internal/import-jobs/${jobId}`, {
      method: 'GET',
      headers: {
        'x-service-token': SERVICE_TOKEN,
      },
    });
    if (response.ok) {
      const job = await response.json();
      return job.status; // Return status if we can fetch it
    }
  } catch (error) {
    // If check fails, proceed with processing (non-blocking)
    console.warn(`Could not check job status for ${jobId}, proceeding anyway:`, error);
  }
  return null;
}

// Process a single job
async function processJob(message: any) {
  const { job_id, owner_id, source_type, url } = message;

  console.log(`Processing job ${job_id} for URL: ${url}`);

  try {
    // Check if job is already terminal (best-effort check to avoid wasted work)
    const currentStatus = await checkJobStatus(job_id);
    if (currentStatus === 'READY' || currentStatus === 'FAILED') {
      console.log(`Job ${job_id} is already in terminal state (${currentStatus}), skipping`);
      return;
    }

    // Update status to RUNNING
    await updateJobStatus(job_id, 'RUNNING');

    // Fetch transcript
    let transcript: string;
    try {
      const transcriptResult = await fetchTranscript(url, job_id);
      transcript = transcriptResult.transcriptText;
      console.log(`Transcript fetched for job ${job_id}, length: ${transcript?.length || 0}`);
      
      if (!transcript || transcript.trim().length === 0) {
        throw new Error('No transcript available - this video may not have captions enabled');
      }
      
      if (transcript.trim().length < 100) {
        console.warn(`Transcript is very short (${transcript.trim().length} chars) for job ${job_id}`);
        throw new Error(`Transcript is too short (${transcript.trim().length} characters). Recipe videos typically have longer transcripts.`);
      }
    } catch (error: any) {
      console.error(`Failed to fetch transcript for job ${job_id}:`, error.message);
      
      // Provide more specific error messages
      // Note: error.message may already contain "yt-dlp failed:" prefix from fetchTranscript, so don't wrap it again
      let errorMessage = error.message;
      if (!error.message.includes('yt-dlp failed') && !error.message.includes('No transcript available') && !error.message.includes('Transcript too short')) {
        // Only add prefix if it's not already present and not a known specific error
        errorMessage = `Unable to get transcript: ${error.message}`;
      }
      
      await updateJobStatus(job_id, 'FAILED', errorMessage);
      return;
    }

    // Extract recipe using AI (with exponential backoff retry)
    const recipeData = await retryWithBackoff(
      () => extractRecipe(url, transcript),
      2, // 2 retries = 3 total attempts
      2000, // Start with 2s delay
      `extractRecipe(${job_id})`
    );

    // Validate AI response
    if (!recipeData.title || !recipeData.ingredients || !recipeData.steps) {
      throw new Error('Invalid recipe data from AI');
    }

    // Create recipe
    const recipeId = await createRecipeFromJob(
      job_id,
      owner_id,
      url,
      recipeData.title,
      recipeData.description || null,
      recipeData.ingredients,
      recipeData.steps,
      transcript
    );

    // Update job status to READY
    await updateJobStatus(job_id, 'READY', undefined, recipeId);

    console.log(`Job ${job_id} completed successfully. Recipe ID: ${recipeId}`);
  } catch (error: any) {
    console.error(`Job ${job_id} failed:`, error);
    await updateJobStatus(job_id, 'FAILED', error.message || 'Unknown error');
  }
}

// WORKER_CONCURRENCY: reserved for future eachBatch bounded concurrency or horizontal scaling
// With kafkajs eachMessage, throughput is primarily controlled by partitions/replicas

// Main worker loop
async function runWorker() {
  try {
    await consumer.connect();
    console.log('Kafka consumer connected');

    await consumer.subscribe({ topic: KAFKA_TOPIC_JOBS, fromBeginning: false });

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const value = message.value?.toString();
          if (!value) {
            console.error('Empty message value');
            return;
          }

          const jobMessage = JSON.parse(value);
          await processJob(jobMessage);
        } catch (error) {
          console.error('Error processing message:', error);
        }
      },
    });
  } catch (error) {
    console.error('Worker error:', error);
    process.exit(1);
  }
}

// Start health check server
const startHealthServer = async () => {
  try {
    await fastify.listen({ port: 8005, host: '0.0.0.0' });
    console.log('Health check server listening on port 8005');
  } catch (err) {
    console.error('Failed to start health server:', err);
  }
};

// Graceful shutdown
const shutdown = async () => {
  let forceExitTimer: NodeJS.Timeout | null = null;
  try {
    console.log('Shutting down workers service...');
    // Set forced exit timer (unref so it doesn't keep process alive)
    forceExitTimer = setTimeout(() => {
      console.warn('Forcing exit after shutdown timeout');
      process.exit(1);
    }, 10000);
    forceExitTimer.unref();
    
    // Close server first, then disconnect consumer
    await fastify.close();
    await consumer.disconnect();
    console.log('Workers service closed');
    
    // Clear timer if shutdown completed successfully
    if (forceExitTimer) clearTimeout(forceExitTimer);
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    if (forceExitTimer) clearTimeout(forceExitTimer);
    process.exit(1);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start services
(async () => {
  // Check yt-dlp availability on startup
  await checkYtDlp();
  
  startHealthServer();
  runWorker();
})();

