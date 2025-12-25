import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Pool } from 'pg';
import { Kafka } from 'kafkajs';
import { v4 as uuidv4 } from 'uuid';

const PORT = parseInt(process.env.PORT || '8003', 10);
const DATABASE_URL = process.env.DATABASE_URL!;
// Handle both comma-separated and single broker strings
const KAFKA_BROKERS_STR = process.env.KAFKA_BROKERS!;
const KAFKA_BROKERS = KAFKA_BROKERS_STR.includes(',') 
  ? KAFKA_BROKERS_STR.split(',').map(b => b.trim())
  : [KAFKA_BROKERS_STR.trim()];
const KAFKA_TOPIC_JOBS = process.env.KAFKA_TOPIC_JOBS!;
const SERVICE_TOKEN = process.env.SERVICE_TOKEN!;
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || SERVICE_TOKEN; // Gateway token (same as SERVICE_TOKEN for MVP)

const pool = new Pool({ connectionString: DATABASE_URL });

const kafka = new Kafka({
  brokers: KAFKA_BROKERS,
  clientId: 'recipe-service',
});

const producer = kafka.producer();

const fastify = Fastify({ logger: true });

fastify.register(cors, {
  origin: true,
  credentials: true,
});

// Middleware: Verify service token for internal endpoints
async function verifyServiceToken(request: any, reply: any) {
  const token = request.headers['x-service-token'];
  if (token !== SERVICE_TOKEN) {
    return reply.code(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid service token',
        request_id: request.id,
      },
    });
  }
}

// Middleware: Verify gateway token and extract user ID
async function extractUserId(request: any, reply: any) {
  const gatewayToken = request.headers['x-gateway-token'];
  const userId = request.headers['x-user-id'];

  // Verify gateway token (only gateway knows this)
  if (gatewayToken !== GATEWAY_TOKEN) {
    return reply.code(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid gateway token',
        request_id: request.id,
      },
    });
  }

  if (!userId) {
    return reply.code(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'User ID not found',
        request_id: request.id,
      },
    });
  }
  request.userId = userId;
}

// Helper: Validate YouTube URL
function isValidYouTubeUrl(url: string): boolean {
  const patterns = [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
    /^https?:\/\/youtu\.be\/[\w-]+/,
  ];
  return patterns.some((pattern) => pattern.test(url));
}

// POST /import/youtube (protected)
fastify.post('/import/youtube', { preHandler: extractUserId }, async (request, reply) => {
  const userId = (request as any).userId;
  const { url } = request.body as { url?: string };

  if (!url || !isValidYouTubeUrl(url)) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Valid YouTube URL is required',
        request_id: request.id,
      },
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const jobId = uuidv4();

    // Create import job
    await client.query(
      `INSERT INTO recipe_import_jobs (id, owner_id, source_type, source_ref, status)
       VALUES ($1, $2, 'youtube', $3, 'QUEUED')`,
      [jobId, userId, url]
    );

    // Emit Kafka message (if this fails, rollback DB transaction)
    try {
      await producer.send({
        topic: KAFKA_TOPIC_JOBS,
        messages: [
          {
            key: jobId,
            value: JSON.stringify({
              job_id: jobId,
              owner_id: userId,
              source_type: 'youtube',
              url: url,
              requested_at: new Date().toISOString(),
            }),
          },
        ],
      });
    } catch (kafkaError) {
      await client.query('ROLLBACK');
      fastify.log.error({ kafkaError }, 'Kafka send failed, rolled back job creation');
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to queue import job',
          request_id: request.id,
        },
      });
    }

    await client.query('COMMIT');

    return reply.send({
      job_id: jobId,
      status: 'QUEUED',
    });
  } catch (error) {
    await client.query('ROLLBACK');
    fastify.log.error({ error }, 'Failed to create import job');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create import job',
        request_id: request.id,
      },
    });
  } finally {
    client.release();
  }
});

// GET /import-jobs/:job_id (protected)
fastify.get('/import-jobs/:job_id', { preHandler: extractUserId }, async (request, reply) => {
  const userId = (request as any).userId;
  const { job_id } = request.params as { job_id: string };

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, owner_id, source_type, source_ref, status, recipe_id, error_message, created_at, updated_at
       FROM recipe_import_jobs WHERE id = $1`,
      [job_id]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Import job not found',
          request_id: request.id,
        },
      });
    }

    const job = result.rows[0];

    // Ensure user owns this job
    if (job.owner_id !== userId) {
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied',
          request_id: request.id,
        },
      });
    }

    return reply.send({
      job_id: job.id,
      status: job.status,
      recipe_id: job.recipe_id,
      error_message: job.error_message,
      created_at: job.created_at,
      updated_at: job.updated_at,
    });
  } catch (error) {
    fastify.log.error({ error }, 'Failed to get import job');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get import job',
        request_id: request.id,
      },
    });
  } finally {
    client.release();
  }
});

// GET /:recipe_id (protected)
fastify.get('/:recipe_id', { preHandler: extractUserId }, async (request, reply) => {
  const userId = (request as any).userId;
  const { recipe_id } = request.params as { recipe_id: string };

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, owner_id, title, description, is_public, source_type, source_ref, status,
              ingredients, steps, created_at, updated_at
       FROM recipes WHERE id = $1`,
      [recipe_id]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Recipe not found',
          request_id: request.id,
        },
      });
    }

    const recipe = result.rows[0];

    // Ensure user owns this recipe
    if (recipe.owner_id !== userId) {
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied',
          request_id: request.id,
        },
      });
    }

    return reply.send({
      id: recipe.id,
      title: recipe.title,
      description: recipe.description,
      is_public: recipe.is_public,
      source_type: recipe.source_type,
      source_ref: recipe.source_ref,
      ingredients: recipe.ingredients,
      steps: recipe.steps,
      created_at: recipe.created_at,
      updated_at: recipe.updated_at,
    });
  } catch (error) {
    fastify.log.error({ error }, 'Failed to get recipe');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get recipe',
        request_id: request.id,
      },
    });
  } finally {
    client.release();
  }
});

// POST /internal/import-jobs/:job_id/status (internal)
fastify.post(
  '/internal/import-jobs/:job_id/status',
  { preHandler: verifyServiceToken },
  async (request, reply) => {
    const { job_id } = request.params as { job_id: string };
    const { status, error_message, recipe_id } = request.body as {
      status?: string;
      error_message?: string;
      recipe_id?: string;
    };

    if (!status || !['RUNNING', 'FAILED', 'READY'].includes(status)) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Valid status is required (RUNNING, FAILED, READY)',
          request_id: request.id,
        },
      });
    }

    const client = await pool.connect();
    try {
      const updates: string[] = ['status = $1', 'updated_at = NOW()'];
      const values: any[] = [status];
      let paramIndex = 2;

      if (error_message !== undefined) {
        updates.push(`error_message = $${paramIndex++}`);
        values.push(error_message);
      }
      if (recipe_id !== undefined) {
        updates.push(`recipe_id = $${paramIndex++}`);
        values.push(recipe_id);
      }

      values.push(job_id);

      const result = await client.query(
        `UPDATE recipe_import_jobs SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values
      );

      if (result.rowCount === 0) {
        return reply.code(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'Import job not found',
            request_id: request.id,
          },
        });
      }

      return reply.send({ success: true });
    } catch (error) {
      fastify.log.error({ error }, 'Failed to update job status');
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update job status',
          request_id: request.id,
        },
      });
    } finally {
      client.release();
    }
  }
);

// POST /internal/recipes/from-import-job (internal)
fastify.post(
  '/internal/recipes/from-import-job',
  { preHandler: verifyServiceToken },
  async (request, reply) => {
    const {
      job_id,
      owner_id,
      source_ref,
      title,
      description,
      ingredients,
      steps,
      raw_transcript,
    } = request.body as {
      job_id?: string;
      owner_id?: string;
      source_ref?: string;
      title?: string;
      description?: string;
      ingredients?: any;
      steps?: any;
      raw_transcript?: string;
    };

    if (!job_id || !owner_id || !source_ref || !title || !ingredients || !steps) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Missing required fields',
          request_id: request.id,
        },
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verify job exists, belongs to owner, and is in RUNNING state (idempotency check)
      const jobCheck = await client.query(
        `SELECT id, owner_id, status, recipe_id FROM recipe_import_jobs WHERE id = $1`,
        [job_id]
      );

      if (jobCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'Import job not found',
            request_id: request.id,
          },
        });
      }

      const job = jobCheck.rows[0];

      if (job.owner_id !== owner_id) {
        await client.query('ROLLBACK');
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'Job does not belong to specified owner',
            request_id: request.id,
          },
        });
      }

      // Idempotency: if job already has a recipe, return existing recipe_id
      if (job.status === 'READY' && job.recipe_id) {
        await client.query('ROLLBACK');
        return reply.send({
          success: true,
          recipe_id: job.recipe_id,
          already_exists: true,
        });
      }

      if (job.status !== 'RUNNING') {
        await client.query('ROLLBACK');
        return reply.code(400).send({
          error: {
            code: 'INVALID_STATE',
            message: `Job is in ${job.status} state, expected RUNNING`,
            request_id: request.id,
          },
        });
      }

      const recipeId = uuidv4();

      // Create recipe
      await client.query(
        `INSERT INTO recipes (id, owner_id, title, description, is_public, source_type, source_ref, status, ingredients, steps)
         VALUES ($1, $2, $3, $4, false, 'youtube', $5, 'READY', $6::jsonb, $7::jsonb)`,
        [recipeId, owner_id, title, description || null, source_ref, JSON.stringify(ingredients), JSON.stringify(steps)]
      );

      // Store raw transcript if provided
      if (raw_transcript) {
        await client.query(
          `INSERT INTO recipe_raw_source (recipe_id, source_text) VALUES ($1, $2)
           ON CONFLICT (recipe_id) DO UPDATE SET source_text = $2`,
          [recipeId, raw_transcript]
        );
      }

      // Update job status (recipe_id is UNIQUE, so duplicate calls will fail here)
      await client.query(
        `UPDATE recipe_import_jobs SET status = 'READY', recipe_id = $1, updated_at = NOW() WHERE id = $2`,
        [recipeId, job_id]
      );

      await client.query('COMMIT');

      return reply.send({
        success: true,
        recipe_id: recipeId,
      });
    } catch (error: any) {
      await client.query('ROLLBACK');
      // Handle unique constraint violation (idempotency)
      if (error.code === '23505' && error.constraint?.includes('recipe_id')) {
        // Recipe already exists for this job, fetch it
        const existing = await client.query(
          `SELECT recipe_id FROM recipe_import_jobs WHERE id = $1`,
          [job_id]
        );
        if (existing.rows.length > 0) {
          return reply.send({
            success: true,
            recipe_id: existing.rows[0].recipe_id,
            already_exists: true,
          });
        }
      }
      fastify.log.error({ error }, 'Failed to create recipe from import job');
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create recipe',
          request_id: request.id,
        },
      });
    } finally {
      client.release();
    }
  }
);

// Health check
fastify.get('/health', async () => {
  try {
    await pool.query('SELECT 1');
    return { status: 'healthy' };
  } catch (error) {
    return { status: 'unhealthy', error: String(error) };
  }
});

// Start server
const start = async () => {
  try {
    // Connect Kafka producer
    await producer.connect();
    fastify.log.info('Kafka producer connected');

    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info(`Recipe service listening on port ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async () => {
  await producer.disconnect();
  await pool.end();
  await fastify.close();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start();

