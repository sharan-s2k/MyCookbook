import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Pool } from 'pg';
import { Kafka, Partitioners } from 'kafkajs';
import { v4 as uuidv4 } from 'uuid';

const PORT = parseInt(process.env.PORT || '8002', 10);
const DATABASE_URL = process.env.DATABASE_URL!;
const SERVICE_TOKEN = process.env.SERVICE_TOKEN!;
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || SERVICE_TOKEN; // Gateway token (same as SERVICE_TOKEN for MVP)
// Handle both comma-separated and single broker strings
const KAFKA_BROKERS_STR = process.env.KAFKA_BROKERS || 'localhost:9092';
const KAFKA_BROKERS = KAFKA_BROKERS_STR.includes(',') 
  ? KAFKA_BROKERS_STR.split(',').map(b => b.trim())
  : [KAFKA_BROKERS_STR.trim()];
const KAFKA_TOPIC_USERS = process.env.KAFKA_TOPIC_USERS || 'user.events';
const DB_POOL_MAX = parseInt(process.env.DB_POOL_MAX || '10', 10);

const pool = new Pool({ 
  connectionString: DATABASE_URL,
  max: DB_POOL_MAX,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const fastify = Fastify({ logger: true });

// Kafka setup (optional - only if KAFKA_BROKERS is provided)
let producer: any = null;
if (KAFKA_BROKERS_STR && KAFKA_BROKERS_STR !== '') {
  const kafka = new Kafka({
    brokers: KAFKA_BROKERS,
    clientId: 'user-service',
  });
  producer = kafka.producer({
    createPartitioner: Partitioners.LegacyPartitioner,
  });
}

// Helper: Emit user event to Kafka
async function emitUserEvent(event: string, user: any) {
  if (!producer) {
    // Kafka producer not initialized, skipping event emission (non-fatal)
    return;
  }
  try {
    await producer.send({
      topic: KAFKA_TOPIC_USERS,
      messages: [
        {
          key: user.id,
          value: JSON.stringify({
            event,
            id: user.id,
            username: user.username,
            display_name: user.display_name || user.displayName,
            bio: user.bio,
            avatar_url: user.avatar_url || user.avatarUrl,
            created_at: user.created_at || user.createdAt || new Date().toISOString(),
            updated_at: user.updated_at || user.updatedAt || new Date().toISOString(),
          }),
        },
      ],
    });
  } catch (error) {
    fastify.log.warn({ error, event, userId: user.id }, 'Failed to emit user event (non-fatal)');
  }
}

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

// Helper: Validate UUID format
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
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

    // Check if user already exists
    const existingCheck = await client.query('SELECT id, created_at FROM users_profile WHERE id = $1', [id]);
    const wasNew = existingCheck.rows.length === 0;

    await client.query(
      `INSERT INTO users_profile (id, username, display_name, bio, avatar_url, preferences)
       VALUES ($1, $2, $3, NULL, NULL, '{}'::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [id, null, displayName]
    );

    // If this was a new user, emit user.created event
    if (wasNew) {
      const result = await client.query('SELECT * FROM users_profile WHERE id = $1', [id]);
      if (result.rows.length > 0) {
        await emitUserEvent('user.created', result.rows[0]);
      }
    }

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

    const updatedUser = result.rows[0];
    
    // Emit user.updated event
    await emitUserEvent('user.updated', updatedUser);

    return reply.send(updatedUser);
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

// POST /:id/follow (protected) - Follow a user
// Must be registered before GET /:id to avoid route conflicts
fastify.post('/:id/follow', { preHandler: extractUserId }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const currentUserId = (request as any).userId;

  // Prevent self-follow
  if (id === currentUserId) {
    return reply.code(400).send({
      error: {
        code: 'BAD_REQUEST',
        message: 'Cannot follow yourself',
        request_id: request.id,
      },
    });
  }

  const client = await pool.connect();
  try {
    // Check if user exists
    const userCheck = await client.query('SELECT id FROM users_profile WHERE id = $1', [id]);
    if (userCheck.rows.length === 0) {
      return reply.code(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'User not found',
          request_id: request.id,
        },
      });
    }

    // Insert follow relationship (ignore if already exists)
    await client.query(
      'INSERT INTO user_follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT (follower_id, following_id) DO NOTHING',
      [currentUserId, id]
    );

    return reply.send({ success: true });
  } catch (error: any) {
    fastify.log.error({ error }, 'Failed to follow user');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to follow user',
        request_id: request.id,
      },
    });
  } finally {
    client.release();
  }
});

// DELETE /:id/follow (protected) - Unfollow a user
fastify.delete('/:id/follow', { preHandler: extractUserId }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const currentUserId = (request as any).userId;

  const client = await pool.connect();
  try {
    const result = await client.query(
      'DELETE FROM user_follows WHERE follower_id = $1 AND following_id = $2',
      [currentUserId, id]
    );

    return reply.send({ success: true });
  } catch (error: any) {
    fastify.log.error({ error }, 'Failed to unfollow user');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to unfollow user',
        request_id: request.id,
      },
    });
  } finally {
    client.release();
  }
});

// GET /:id/followers (protected) - Get user's followers
fastify.get('/:id/followers', { preHandler: extractUserId }, async (request, reply) => {
  const { id } = request.params as { id: string };

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT u.id, u.username, u.display_name, u.avatar_url
       FROM user_follows uf
       JOIN users_profile u ON uf.follower_id = u.id
       WHERE uf.following_id = $1
       ORDER BY uf.created_at DESC`,
      [id]
    );

    return reply.send(result.rows);
  } catch (error: any) {
    fastify.log.error({ error }, 'Failed to get followers');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get followers',
        request_id: request.id,
      },
    });
  } finally {
    client.release();
  }
});

// GET /:id/following (protected) - Get users that this user is following
fastify.get('/:id/following', { preHandler: extractUserId }, async (request, reply) => {
  const { id } = request.params as { id: string };

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT u.id, u.username, u.display_name, u.avatar_url
       FROM user_follows uf
       JOIN users_profile u ON uf.following_id = u.id
       WHERE uf.follower_id = $1
       ORDER BY uf.created_at DESC`,
      [id]
    );

    return reply.send(result.rows);
  } catch (error: any) {
    fastify.log.error({ error }, 'Failed to get following');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get following',
        request_id: request.id,
      },
    });
  } finally {
    client.release();
  }
});

// GET /:id (protected) - Get user profile by ID
// Note: This handles /api/users/:id from gateway (which strips /api/users prefix)
// /me is handled by the route above, so this won't match /me
// Follow endpoints are registered before this to avoid route conflicts
fastify.get('/:id', { preHandler: extractUserId }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const currentUserId = (request as any).userId; // Current authenticated user

  // Safety check: don't allow accessing /me via this route
  if (id === 'me') {
    return reply.code(400).send({
      error: {
        code: 'BAD_REQUEST',
        message: 'Use /me endpoint to get your own profile',
        request_id: request.id,
      },
    });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT id, username, display_name, bio, avatar_url, preferences, created_at, updated_at FROM users_profile WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'User profile not found',
          request_id: request.id,
        },
      });
    }

    const user = result.rows[0];

    // Get followers and following counts
    const [followersResult, followingResult, isFollowingResult] = await Promise.all([
      client.query('SELECT COUNT(*) as count FROM user_follows WHERE following_id = $1', [id]),
      client.query('SELECT COUNT(*) as count FROM user_follows WHERE follower_id = $1', [id]),
      currentUserId !== id
        ? client.query('SELECT 1 FROM user_follows WHERE follower_id = $1 AND following_id = $2', [currentUserId, id])
        : Promise.resolve({ rows: [] }),
    ]);

    const followersCount = parseInt(followersResult.rows[0]?.count || '0', 10);
    const followingCount = parseInt(followingResult.rows[0]?.count || '0', 10);
    const isFollowing = isFollowingResult.rows.length > 0;

    return reply.send({
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      bio: user.bio,
      avatar_url: user.avatar_url,
      followers_count: followersCount,
      following_count: followingCount,
      is_following: isFollowing,
    });
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

// GET /internal/users/all (internal) - For reindexing
fastify.get('/internal/users/all', { preHandler: verifyServiceToken }, async (request, reply) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, username, display_name, bio, avatar_url, created_at, updated_at
       FROM users_profile
       ORDER BY created_at DESC`
    );

    return reply.send(result.rows);
  } catch (error) {
    fastify.log.error({ error }, 'Failed to get all users');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get all users',
        request_id: request.id,
      },
    });
  } finally {
    client.release();
  }
});

// GET /internal/users/:userId/following-ids (internal) - Get list of following IDs for a user
fastify.get('/internal/users/:userId/following-ids', { preHandler: verifyServiceToken }, async (request, reply) => {
  const { userId } = request.params as { userId: string };

  if (!isValidUUID(userId)) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid user ID format',
        request_id: request.id,
      },
    });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT following_id
       FROM user_follows
       WHERE follower_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    const followingIds = result.rows.map((row) => row.following_id);
    return reply.send(followingIds);
  } catch (error) {
    fastify.log.error({ error, userId }, 'Failed to get following IDs');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get following IDs',
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
    // Connect Kafka producer if available
    if (producer) {
      await producer.connect();
      fastify.log.info('Kafka producer connected');
    }

    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info(`User service listening on port ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async () => {
  let forceExitTimer: NodeJS.Timeout | null = null;
  try {
    fastify.log.info('Shutting down user service...');
    // Set forced exit timer (unref so it doesn't keep process alive)
    forceExitTimer = setTimeout(() => {
      fastify.log.warn('Forcing exit after shutdown timeout');
      process.exit(1);
    }, 10000);
    forceExitTimer.unref();
    
    // Close server first, then disconnect producer, then close DB pool
    await fastify.close();
    if (producer) {
      await producer.disconnect();
    }
    await pool.end();
    fastify.log.info('User service closed');
    
    // Clear timer if shutdown completed successfully
    if (forceExitTimer) clearTimeout(forceExitTimer);
    process.exit(0);
  } catch (err) {
    fastify.log.error({ err }, 'Error during shutdown');
    if (forceExitTimer) clearTimeout(forceExitTimer);
    process.exit(1);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start();

