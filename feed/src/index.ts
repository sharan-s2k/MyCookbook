import Fastify from 'fastify';
import cors from '@fastify/cors';
import { v4 as uuidv4 } from 'uuid';

const PORT = parseInt(process.env.PORT || '8008', 10);
const SERVICE_TOKEN = process.env.SERVICE_TOKEN!;
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || SERVICE_TOKEN;
const USER_INTERNAL_URL = process.env.USER_INTERNAL_URL || 'http://user:8002';
const COOKBOOK_INTERNAL_URL = process.env.COOKBOOK_INTERNAL_URL || 'http://cookbook:8006';
const HTTP_TIMEOUT_MS = parseInt(process.env.HTTP_TIMEOUT_MS || '3000', 10);
const MAX_OWNER_IDS = parseInt(process.env.MAX_OWNER_IDS || '500', 10);

const fastify = Fastify({ logger: true });

fastify.register(cors, {
  origin: true,
  credentials: true,
});

// Helper: Validate UUID format
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// Helper: Make internal HTTP call with timeout and retries
async function makeInternalCall(url: string, options: RequestInit = {}, retries = 1): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-service-token': SERVICE_TOKEN,
        ...options.headers,
      },
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (retries > 0 && (error.name === 'AbortError' || error.code === 'ECONNREFUSED')) {
      fastify.log.warn({ url, retries }, 'Retrying internal call');
      await new Promise(resolve => setTimeout(resolve, 100));
      return makeInternalCall(url, options, retries - 1);
    }
    throw error;
  }
}

// Middleware: Verify gateway token and extract user ID
async function extractUserId(request: any, reply: any) {
  const gatewayToken = request.headers['x-gateway-token'];
  const userId = request.headers['x-user-id'];

  if (gatewayToken !== GATEWAY_TOKEN) {
    return reply.code(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid gateway token',
        request_id: request.id,
      },
    });
  }

  if (!userId || !isValidUUID(userId)) {
    return reply.code(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'User ID not found or invalid',
        request_id: request.id,
      },
    });
  }

  request.userId = userId;
}

// Helper: Decode cursor for keyset pagination
function decodeCursor(cursor: string | undefined): { published_at: string; id: string } | null {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
    const [published_at, id] = decoded.split('|');
    if (!published_at || !id || !isValidUUID(id)) return null;
    return { published_at, id };
  } catch {
    return null;
  }
}

// Helper: Encode cursor for keyset pagination
function encodeCursor(published_at: string, id: string): string {
  return Buffer.from(`${published_at}|${id}`).toString('base64');
}

// GET /feed/home (protected) - Note: Gateway routes /api/feed/* with rewritePrefix /feed, so /api/feed/home becomes /feed/home
fastify.get('/feed/home', { preHandler: extractUserId }, async (request, reply) => {
  const userId = (request as any).userId;
  const { cursor, limit: limitParam } = request.query as { cursor?: string; limit?: string };

  // Validate and parse limit
  const limit = Math.min(Math.max(parseInt(limitParam || '20', 10), 1), 50);
  const cursorData = decodeCursor(cursor);

  const requestId = request.id || uuidv4();
  fastify.log.info({ requestId, userId, limit, hasCursor: !!cursor }, 'Fetching feed');

  try {
    // Step 1: Fetch following IDs from User Service
    const followingUrl = `${USER_INTERNAL_URL}/internal/users/${userId}/following-ids`;
    fastify.log.debug({ requestId, url: followingUrl }, 'Calling user service');
    
    const followingResponse = await makeInternalCall(followingUrl, { method: 'GET' });
    
    if (!followingResponse.ok) {
      fastify.log.error({ requestId, status: followingResponse.status }, 'Failed to fetch following IDs');
      return reply.code(502).send({
        error: {
          code: 'UPSTREAM_ERROR',
          message: 'Failed to fetch following users',
          request_id: requestId,
        },
      });
    }

    const followingIds: string[] = await followingResponse.json();
    fastify.log.debug({ requestId, followingCount: followingIds.length }, 'Fetched following IDs');

    // If no following, return empty feed
    if (!followingIds || followingIds.length === 0) {
      return reply.send({
        items: [],
        next_cursor: null,
      });
    }

    // Validate owner IDs list length to prevent abuse
    if (followingIds.length > MAX_OWNER_IDS) {
      fastify.log.warn({ requestId, count: followingIds.length, max: MAX_OWNER_IDS }, 'Too many following IDs');
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Too many following users (max: ${MAX_OWNER_IDS})`,
          request_id: requestId,
        },
      });
    }

    // Step 2: Fetch public cookbooks from Cookbook Service
    const cookbookUrl = `${COOKBOOK_INTERNAL_URL}/internal/cookbooks/public`;
    const cookbookParams = new URLSearchParams();
    cookbookParams.append('owner_ids', followingIds.join(','));
    cookbookParams.append('limit', String(limit + 1)); // Fetch one extra for pagination
    if (cursorData) {
      cookbookParams.append('cursor_published_at', cursorData.published_at);
      cookbookParams.append('cursor_id', cursorData.id);
    }

    fastify.log.debug({ requestId, url: `${cookbookUrl}?${cookbookParams.toString()}` }, 'Calling cookbook service');
    
    const cookbookResponse = await makeInternalCall(`${cookbookUrl}?${cookbookParams.toString()}`, { method: 'GET' });

    if (!cookbookResponse.ok) {
      fastify.log.error({ requestId, status: cookbookResponse.status }, 'Failed to fetch cookbooks');
      return reply.code(502).send({
        error: {
          code: 'UPSTREAM_ERROR',
          message: 'Failed to fetch cookbooks',
          request_id: requestId,
        },
      });
    }

    const cookbooks: any[] = await cookbookResponse.json();
    fastify.log.debug({ requestId, cookbookCount: cookbooks.length }, 'Fetched cookbooks');

    // Determine if there's a next page
    const hasMore = cookbooks.length > limit;
    const items = hasMore ? cookbooks.slice(0, limit) : cookbooks;

    // Generate next cursor from last item
    let next_cursor: string | null = null;
    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1];
      // Use updated_at as published_at (as per MVP requirement)
      const published_at = lastItem.updated_at || lastItem.created_at;
      if (published_at && lastItem.id) {
        next_cursor = encodeCursor(published_at, lastItem.id);
      }
    }

    // Transform cookbooks to feed items
    const feedItems = items.map((cb: any) => ({
      id: cb.id,
      owner_id: cb.owner_id,
      title: cb.title,
      description: cb.description || null,
      visibility: cb.visibility,
      recipe_count: cb.recipe_count || 0,
      created_at: cb.created_at,
      updated_at: cb.updated_at,
      published_at: cb.updated_at || cb.created_at, // Use updated_at as published_at for MVP
    }));

    return reply.send({
      items: feedItems,
      next_cursor,
    });
  } catch (error: any) {
    fastify.log.error({ error, requestId, userId }, 'Failed to fetch feed');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch feed',
        request_id: requestId,
      },
    });
  }
});

// Health check
fastify.get('/health', async () => {
  return { status: 'healthy', service: 'feed' };
});

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info(`Feed service listening on port ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async () => {
  let forceExitTimer: NodeJS.Timeout | null = null;
  try {
    fastify.log.info('Shutting down feed service...');
    // Set forced exit timer (unref so it doesn't keep process alive)
    forceExitTimer = setTimeout(() => {
      fastify.log.warn('Forcing exit after shutdown timeout');
      process.exit(1);
    }, 10000);
    forceExitTimer.unref();
    
    await fastify.close();
    fastify.log.info('Feed service closed');
    
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
