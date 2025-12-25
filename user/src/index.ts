import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

const PORT = parseInt(process.env.PORT || '8002', 10);
const DATABASE_URL = process.env.DATABASE_URL!;
const SERVICE_TOKEN = process.env.SERVICE_TOKEN!;
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || SERVICE_TOKEN; // Gateway token (same as SERVICE_TOKEN for MVP)

const pool = new Pool({ connectionString: DATABASE_URL });

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

// POST /internal/users (internal only)
fastify.post('/internal/users', { preHandler: verifyServiceToken }, async (request, reply) => {
  const { id, email } = request.body as { id?: string; email?: string };

  if (!id || !email) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'id and email are required',
        request_id: request.id,
      },
    });
  }

  const client = await pool.connect();
  try {
    // Extract display name from email
    const displayName = email.split('@')[0];

    await client.query(
      `INSERT INTO users_profile (id, username, display_name, bio, avatar_url, preferences)
       VALUES ($1, $2, $3, NULL, NULL, '{}'::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [id, null, displayName]
    );

    return reply.send({ success: true, id });
  } catch (error) {
    fastify.log.error({ error }, 'Failed to create user profile');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create user profile',
        request_id: request.id,
      },
    });
  } finally {
    client.release();
  }
});

// GET /me (protected)
fastify.get('/me', { preHandler: extractUserId }, async (request, reply) => {
  const userId = (request as any).userId;

  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT id, username, display_name, bio, avatar_url, preferences, created_at, updated_at FROM users_profile WHERE id = $1',
      [userId]
    );

    // Note: email is stored in auth service, not user service
    // For MVP, we don't expose it. If needed, add email field to users_profile or join with auth service

    if (result.rows.length === 0) {
      return reply.code(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'User profile not found',
          request_id: request.id,
        },
      });
    }

    return reply.send(result.rows[0]);
  } catch (error) {
    fastify.log.error({ error }, 'Failed to get user profile');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get user profile',
        request_id: request.id,
      },
    });
  } finally {
    client.release();
  }
});

// PATCH /me (protected)
fastify.patch('/me', { preHandler: extractUserId }, async (request, reply) => {
  const userId = (request as any).userId;
  const { display_name, bio, avatar_url, preferences } = request.body as {
    display_name?: string;
    bio?: string;
    avatar_url?: string;
    preferences?: any;
  };

  const client = await pool.connect();
  try {
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (display_name !== undefined) {
      updates.push(`display_name = $${paramIndex++}`);
      values.push(display_name);
    }
    if (bio !== undefined) {
      updates.push(`bio = $${paramIndex++}`);
      values.push(bio);
    }
    if (avatar_url !== undefined) {
      updates.push(`avatar_url = $${paramIndex++}`);
      values.push(avatar_url);
    }
    if (preferences !== undefined) {
      updates.push(`preferences = $${paramIndex++}::jsonb`);
      values.push(JSON.stringify(preferences));
    }

    if (updates.length === 0) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'No fields to update',
          request_id: request.id,
        },
      });
    }

    updates.push(`updated_at = NOW()`);
    values.push(userId);

    const query = `UPDATE users_profile SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
    const result = await client.query(query, values);

    if (result.rows.length === 0) {
      return reply.code(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'User profile not found',
          request_id: request.id,
        },
      });
    }

    return reply.send(result.rows[0]);
  } catch (error) {
    fastify.log.error({ error }, 'Failed to update user profile');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update user profile',
        request_id: request.id,
      },
    });
  } finally {
    client.release();
  }
});

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
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info(`User service listening on port ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

