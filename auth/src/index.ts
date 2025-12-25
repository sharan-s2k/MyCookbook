import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';

const PORT = parseInt(process.env.PORT || '8001', 10);
const DATABASE_URL = process.env.DATABASE_URL!;
const JWT_SECRET = process.env.JWT_SECRET!;
const ACCESS_TOKEN_TTL_MIN = parseInt(process.env.ACCESS_TOKEN_TTL_MIN || '15', 10);
const REFRESH_TOKEN_TTL_DAYS = parseInt(process.env.REFRESH_TOKEN_TTL_DAYS || '30', 10);
const USER_SERVICE_INTERNAL_URL = process.env.USER_SERVICE_INTERNAL_URL!;
const SERVICE_TOKEN = process.env.SERVICE_TOKEN!;
const BCRYPT_COST = parseInt(process.env.BCRYPT_COST || '12', 10);

const pool = new Pool({ connectionString: DATABASE_URL });

const fastify = Fastify({ logger: true });

fastify.register(cors, {
  origin: process.env.FRONTEND_ORIGIN || true,
  credentials: true,
});

fastify.register(cookie);

// Helper: Hash refresh token
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Helper: Generate tokens
function generateTokens(userId: string) {
  const accessToken = jwt.sign(
    { sub: userId, type: 'access' },
    JWT_SECRET,
    { expiresIn: `${ACCESS_TOKEN_TTL_MIN}m` }
  );

  const refreshToken = uuidv4();
  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

  return { accessToken, refreshToken, refreshTokenHash, expiresAt };
}

// Helper: Create user profile in user service
async function createUserProfile(userId: string, email: string) {
  try {
    const response = await fetch(`${USER_SERVICE_INTERNAL_URL}/internal/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-service-token': SERVICE_TOKEN,
      },
      body: JSON.stringify({ id: userId, email }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`User service error: ${error}`);
    }
  } catch (error) {
    fastify.log.error({ error }, 'Failed to create user profile');
    throw error;
  }
}

// POST /signup
fastify.post('/signup', async (request, reply) => {
  const { email, password } = request.body as { email?: string; password?: string };

  if (!email || !password) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Email and password are required',
        request_id: request.id,
      },
    });
  }

  if (password.length < 8) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Password must be at least 8 characters',
        request_id: request.id,
      },
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Check if user exists
    const existing = await client.query(
      'SELECT id FROM users_auth WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      return reply.code(409).send({
        error: {
          code: 'USER_EXISTS',
          message: 'User with this email already exists',
          request_id: request.id,
        },
      });
    }

    // Create auth record (email normalized to lowercase)
    const userId = uuidv4();
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const normalizedEmail = email.toLowerCase().trim();

    await client.query(
      `INSERT INTO users_auth (id, email, password_hash, provider, email_verified)
       VALUES ($1, $2, $3, 'local', false)`,
      [userId, normalizedEmail, passwordHash]
    );

    // Generate tokens
    const { accessToken, refreshToken, refreshTokenHash, expiresAt } = generateTokens(userId);

    // Store refresh token
    await client.query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [uuidv4(), userId, refreshTokenHash, expiresAt]
    );

    await client.query('COMMIT');

    // Create user profile (await to ensure it exists before returning)
    // Note: This is outside transaction because it's a cross-service call
    // In production, consider using a saga pattern or event-driven approach
    try {
      await createUserProfile(userId, normalizedEmail);
    } catch (err) {
      // Log error but don't fail signup - auth record is already created
      // User can retry profile creation later if needed
      fastify.log.error({ err, userId }, 'Failed to create user profile after signup - user auth created but profile missing');
    }

    // Set refresh token cookie
    reply.setCookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
      path: '/',
    });

    return reply.send({
      access_token: accessToken,
      user_id: userId,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    fastify.log.error({ error }, 'Signup error');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create account',
        request_id: request.id,
      },
    });
  } finally {
    client.release();
  }
});

// POST /login
fastify.post('/login', async (request, reply) => {
  const { email, password } = request.body as { email?: string; password?: string };

  if (!email || !password) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Email and password are required',
        request_id: request.id,
      },
    });
  }

  const client = await pool.connect();
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const result = await client.query(
      'SELECT id, password_hash FROM users_auth WHERE email = $1',
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      return reply.code(401).send({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
          request_id: request.id,
        },
      });
    }

    const { id: userId, password_hash } = result.rows[0];
    const isValid = await bcrypt.compare(password, password_hash);

    if (!isValid) {
      return reply.code(401).send({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
          request_id: request.id,
        },
      });
    }

    // Generate tokens
    const { accessToken, refreshToken, refreshTokenHash, expiresAt } = generateTokens(userId);

    // Store refresh token
    await client.query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [uuidv4(), userId, refreshTokenHash, expiresAt]
    );

    // Set refresh token cookie
    reply.setCookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
      path: '/',
    });

    return reply.send({
      access_token: accessToken,
      user_id: userId,
    });
  } catch (error) {
    fastify.log.error({ error }, 'Login error');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to login',
        request_id: request.id,
      },
    });
  } finally {
    client.release();
  }
});

// POST /refresh
fastify.post('/refresh', async (request, reply) => {
  const refreshToken = request.cookies.refresh_token;

  if (!refreshToken) {
    return reply.code(401).send({
      error: {
        code: 'NO_REFRESH_TOKEN',
        message: 'Refresh token not provided',
        request_id: request.id,
      },
    });
  }

  const refreshTokenHash = hashToken(refreshToken);
  const client = await pool.connect();

  try {
    // Find and validate refresh token
    const result = await client.query(
      `SELECT user_id, expires_at FROM refresh_tokens
       WHERE token_hash = $1 AND expires_at > NOW()`,
      [refreshTokenHash]
    );

    if (result.rows.length === 0) {
      return reply.code(401).send({
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Invalid or expired refresh token',
          request_id: request.id,
        },
      });
    }

    const { user_id: userId } = result.rows[0];

    // Delete old refresh token
    await client.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [refreshTokenHash]);

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken, refreshTokenHash: newHash, expiresAt } =
      generateTokens(userId);

    // Store new refresh token
    await client.query(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [uuidv4(), userId, newHash, expiresAt]
    );

    // Set new refresh token cookie
    reply.setCookie('refresh_token', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
      path: '/',
    });

    return reply.send({
      access_token: accessToken,
    });
  } catch (error) {
    fastify.log.error({ error }, 'Refresh error');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to refresh token',
        request_id: request.id,
      },
    });
  } finally {
    client.release();
  }
});

// POST /logout
fastify.post('/logout', async (request, reply) => {
  const refreshToken = request.cookies.refresh_token;

  if (refreshToken) {
    const refreshTokenHash = hashToken(refreshToken);
    await pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [refreshTokenHash]);
  }

  reply.clearCookie('refresh_token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });

  return reply.send({ success: true });
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
    fastify.log.info(`Auth service listening on port ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

