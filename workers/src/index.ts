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

const kafka = new Kafka({
  brokers: KAFKA_BROKERS,
  clientId: 'recipe-workers',
});

const consumer = kafka.consumer({ groupId: 'recipe-workers-group' });

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

// Fetch YouTube transcript using yt-dlp
async function fetchTranscript(url: string, jobId: string): Promise<string> {
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

    return transcriptText;
  } finally {
    // Cleanup temp directory - always runs even if errors occur
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.warn(`Failed to cleanup temp dir ${tmpDir}:`, cleanupError);
    }
  }
}

// Update job status
async function updateJobStatus(
  jobId: string,
  status: 'RUNNING' | 'FAILED' | 'READY',
  errorMessage?: string,
  recipeId?: string
) {
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
}

// Create recipe from import job
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

// Process a single job
async function processJob(message: any) {
  const { job_id, owner_id, source_type, url } = message;

  console.log(`Processing job ${job_id} for URL: ${url}`);

  try {
    // Update status to RUNNING
    await updateJobStatus(job_id, 'RUNNING');

    // Fetch transcript
    let transcript: string;
    try {
      transcript = await fetchTranscript(url, job_id);
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

    // Extract recipe using AI
    let recipeData: any;
    let retries = 2;
    while (retries >= 0) {
      try {
        recipeData = await extractRecipe(url, transcript);
        break;
      } catch (error: any) {
        if (retries === 0) {
          throw error;
        }
        console.log(`AI extraction failed, retrying... (${retries} retries left)`);
        retries--;
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2s before retry
      }
    }

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
process.on('SIGTERM', async () => {
  console.log('Shutting down...');
  await consumer.disconnect();
  await fastify.close();
  process.exit(0);
});

// Start services
(async () => {
  // Check yt-dlp availability on startup
  await checkYtDlp();
  
  startHealthServer();
  runWorker();
})();

