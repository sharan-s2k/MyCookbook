import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import httpProxy from '@fastify/http-proxy';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const PORT = parseInt(process.env.PORT || '8080', 10);
const AUTH_URL = process.env.AUTH_URL!;
const USER_URL = process.env.USER_URL!;
const RECIPE_URL = process.env.RECIPE_URL!;
const COOKBOOK_URL = process.env.COOKBOOK_URL!;
const AI_ORCHESTRATOR_URL = process.env.AI_ORCHESTRATOR_URL!;
const SEARCH_URL = process.env.SEARCH_URL!;
const FEED_URL = process.env.FEED_URL!;
const JWT_SECRET = process.env.JWT_PUBLIC_OR_SHARED_SECRET!;
// SERVICE_TOKEN: Shared secret for service-to-service authentication (x-service-token header)
const SERVICE_TOKEN = process.env.SERVICE_TOKEN!;
// GATEWAY_TOKEN: Token for gateway authentication (x-gateway-token header to user/recipe services)
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || SERVICE_TOKEN;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:3000';
const GATEWAY_UPSTREAM_TIMEOUT_MS = parseInt(process.env.GATEWAY_UPSTREAM_TIMEOUT_MS || '5000', 10);
const CORS_MAX_AGE_SECONDS = parseInt(process.env.CORS_MAX_AGE_SECONDS || '600', 10);
const TRUST_PROXY = process.env.TRUST_PROXY === 'true'; // Enable trust proxy if behind LB/proxy

// Rate limiting configuration (configurable, disabled for local dev if needed)
const RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED !== 'false';
const RATE_LIMIT_AUTH_PER_MIN = parseInt(process.env.RATE_LIMIT_AUTH_PER_MIN || '10', 10);
const RATE_LIMIT_AUTH_BURST = parseInt(process.env.RATE_LIMIT_AUTH_BURST || '20', 10);
const RATE_LIMIT_AUTHENTICATED_PER_MIN = parseInt(process.env.RATE_LIMIT_AUTHENTICATED_PER_MIN || '60', 10);
const RATE_LIMIT_AUTHENTICATED_BURST = parseInt(process.env.RATE_LIMIT_AUTHENTICATED_BURST || '120', 10);

// Request body size limit (256KB default, configurable)
const BODY_LIMIT = parseInt(process.env.GATEWAY_BODY_LIMIT || '262144', 10); // 256KB default

// Fail fast if SERVICE_TOKEN is not configured (required for service-to-service auth)
if (!SERVICE_TOKEN) {
  throw new Error('SERVICE_TOKEN environment variable is required for service-to-service authentication');
}

// Note: @fastify/http-proxy manages upstream connections internally

// Simple "reject fast" concurrency counters (no queueing to avoid unbounded memory)
// Queueing removed: unbounded waitQueue can grow without limit under load
const MAX_CREATE = 10;
const MAX_STATUS = 50;
let activeCreate = 0;
let activeStatus = 0;

const fastify = Fastify({ 
  logger: true,
  // Use Fastify's built-in requestTimeout to safely abort upstream requests
  // This aborts the request/connection instead of racing with proxy response streaming
  requestTimeout: GATEWAY_UPSTREAM_TIMEOUT_MS,
  connectionTimeout: GATEWAY_UPSTREAM_TIMEOUT_MS,
  // Request body size limit (256KB default) - prevents abuse via large payloads
  bodyLimit: BODY_LIMIT,
  // Trust proxy: enable if behind a reverse proxy/load balancer for correct IP detection
  trustProxy: TRUST_PROXY,
});

fastify.register(cors, {
  origin: FRONTEND_ORIGIN,
  credentials: true,
  maxAge: CORS_MAX_AGE_SECONDS,
});

fastify.register(cookie);

// Timeout handler: send 504 if no response sent yet, otherwise destroy socket
fastify.addHook('onTimeout', (request, reply) => {
  if (reply.sent || reply.raw.headersSent) {
    reply.raw.destroy();
    return;
  }
  reply.code(504).send({
    error: {
      code: 'UPSTREAM_TIMEOUT',
      message: 'Upstream request timed out',
      request_id: (request as any).requestId || 'unknown',
    },
  });
});

// Middleware: Generate correlation ID
fastify.addHook('onRequest', async (request, reply) => {
  const requestId = request.headers['x-request-id'] || uuidv4();
  request.headers['x-request-id'] = requestId;
  (request as any).requestId = requestId;
});

// Middleware: JWT verification for protected routes
async function verifyJWT(request: any, reply: any) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.code(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid authorization header',
        request_id: request.requestId,
      },
    });
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
    }) as { sub: string; type?: string; iss?: string; aud?: string };
    
    if (decoded.type !== 'access') {
      return reply.code(401).send({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid token type',
          request_id: request.requestId,
        },
      });
    }
    
    // Optional: Verify issuer/audience if set
    // For MVP, we skip this, but can add later:
    // if (decoded.iss && decoded.iss !== 'mycookbook-auth') { ... }
    // if (decoded.aud && decoded.aud !== 'mycookbook-api') { ... }
    
    request.userId = decoded.sub;
    request.headers['x-user-id'] = decoded.sub;
  } catch (error) {
    return reply.code(401).send({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired token',
        request_id: request.requestId,
      },
    });
  }
}

// Token bucket rate limiting: O(1) per request, supports burst
// For production multi-instance, consider Redis-backed rate limiting
interface TokenBucket {
  tokens: number;
  lastRefillMs: number;
}

const authRateLimitStore = new Map<string, TokenBucket>();
const userRateLimitStore = new Map<string, TokenBucket>();

// Cleanup unused entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  const fiveMinutesAgo = now - 5 * 60 * 1000;
  
  for (const [key, bucket] of authRateLimitStore.entries()) {
    if (bucket.lastRefillMs < fiveMinutesAgo) {
      authRateLimitStore.delete(key);
    }
  }
  
  for (const [key, bucket] of userRateLimitStore.entries()) {
    if (bucket.lastRefillMs < fiveMinutesAgo) {
      userRateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Token bucket rate limiting: refills tokens at sustained rate, allows burst up to burst limit
function checkTokenBucket(
  store: Map<string, TokenBucket>,
  key: string,
  sustainedRate: number, // tokens per minute (refill rate)
  burstLimit: number     // maximum tokens allowed (burst capacity)
): boolean {
  if (!RATE_LIMIT_ENABLED) return true;
  
  const now = Date.now();
  let bucket = store.get(key);
  
  if (!bucket) {
    // Initialize with full burst capacity
    bucket = { tokens: burstLimit, lastRefillMs: now };
    store.set(key, bucket);
    return true; // First request always allowed
  }
  
  // Refill tokens based on elapsed time (sustained rate per minute)
  const elapsedMs = now - bucket.lastRefillMs;
  const tokensToAdd = (sustainedRate * elapsedMs) / 60000; // tokens per ms * elapsed ms
  bucket.tokens = Math.min(burstLimit, bucket.tokens + tokensToAdd);
  bucket.lastRefillMs = now;
  
  // Check if we have tokens available
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }
  
  return false; // Rate limit exceeded
}

// Shared rate limiting hook for authenticated endpoints (after JWT verification)
// Used by global preHandler hook for all authenticated /api/* routes
async function rateLimitAuthenticated(request: any, reply: any) {
  if (RATE_LIMIT_ENABLED) {
    const userId = request.userId;
    const key = userId ? `user:${userId}` : `ip:${request.ip || 'unknown'}`;
    
    if (!checkTokenBucket(userRateLimitStore, key, RATE_LIMIT_AUTHENTICATED_PER_MIN, RATE_LIMIT_AUTHENTICATED_BURST)) {
      return reply.code(429).send({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many requests. Limit: ${RATE_LIMIT_AUTHENTICATED_PER_MIN} requests per minute (burst: ${RATE_LIMIT_AUTHENTICATED_BURST})`,
          request_id: request.requestId || 'unknown',
        },
      });
    }
  }
}

// Health check
fastify.get('/health', async (request) => {
  return { status: 'healthy', service: 'gateway' };
});

// Global hook: JWT verification + rate limiting for all authenticated /api/* routes (except /api/auth/*)
// This centralizes auth + rate limiting for /api/* to avoid forgetting it on new routes
fastify.addHook('preHandler', async (request, reply) => {
  const url = request.url;
  
  // Skip public routes (health check, etc.)
  if (url === '/health' || !url.startsWith('/api/')) {
    return;
  }
  
  // Skip auth routes (they have their own rate limiting per-IP)
  if (url.startsWith('/api/auth/')) {
    return;
  }
  
  // All other /api/* routes require JWT verification and rate limiting
  // Step 1: Verify JWT (sets request.userId)
  await verifyJWT(request, reply);
  
  // If JWT verification failed, verifyJWT already sent response, so return early
  if (reply.sent) {
    return;
  }
  
  // Step 2: Apply rate limiting (uses request.userId from JWT verification)
  await rateLimitAuthenticated(request, reply);
});

// Auth routes (no JWT required)
fastify.register(
  async function (fastify) {
    // Rate limiting for auth endpoints (login/signup) - per IP with burst support
    fastify.addHook('onRequest', async (request, reply) => {
      if (RATE_LIMIT_ENABLED && (request.url === '/api/auth/login' || request.url === '/api/auth/signup')) {
        const ip = request.ip || 'unknown';
        const key = `auth:${ip}`;
        
        if (!checkTokenBucket(authRateLimitStore, key, RATE_LIMIT_AUTH_PER_MIN, RATE_LIMIT_AUTH_BURST)) {
          return reply.code(429).send({
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              message: `Too many requests. Limit: ${RATE_LIMIT_AUTH_PER_MIN} requests per minute (burst: ${RATE_LIMIT_AUTH_BURST})`,
              request_id: (request as any).requestId || 'unknown',
            },
          });
        }
      }
    });
    // Note: Upstream timeout is handled by Fastify's requestTimeout + onTimeout handler
    // This is safe because Fastify ensures timeout handler only runs if proxy hasn't sent response
fastify.register(httpProxy, {
  upstream: AUTH_URL,
  prefix: '/api/auth',
  rewritePrefix: '',
  http2: false,
  replyOptions: {
    rewriteRequestHeaders: (originalReq, headers) => {
      // Remove any user-supplied headers that we control
      const cleanHeaders: any = { ...headers };
      delete cleanHeaders['x-user-id'];
      delete cleanHeaders['x-gateway-token'];
      
      return {
        ...cleanHeaders,
        'x-request-id': (originalReq as any).requestId || uuidv4(),
      };
    },
    // Note: @fastify/http-proxy automatically forwards all response headers including Set-Cookie
    // We don't need onResponse callback - it was interfering with response forwarding
  },
});
  }
);

// User routes (protected)
fastify.register(
  async function (fastify) {
    // Note: JWT verification and rate limiting handled by global hook above
    // Note: Upstream timeout is handled by Fastify's requestTimeout + onTimeout handler
    fastify.register(httpProxy, {
      upstream: USER_URL,
      prefix: '/api/users',
      rewritePrefix: '',
      http2: false,
      replyOptions: {
        rewriteRequestHeaders: (originalReq, headers) => {
          // Remove any user-supplied x-user-id and x-gateway-token
          const cleanHeaders: any = { ...headers };
          delete cleanHeaders['x-user-id'];
          delete cleanHeaders['x-gateway-token'];
          
          return {
            ...cleanHeaders,
            'x-request-id': (originalReq as any).requestId || uuidv4(),
            'x-user-id': (originalReq as any).userId,
            'x-gateway-token': GATEWAY_TOKEN,
          };
        },
      },
    });
  }
);

// Cookbook routes (protected)
fastify.register(
  async function (fastify) {
    // Note: JWT verification and rate limiting handled by global hook above
    fastify.register(httpProxy, {
      upstream: COOKBOOK_URL,
      prefix: '/api/cookbooks',
      rewritePrefix: '',
      http2: false,
      replyOptions: {
        rewriteRequestHeaders: (originalReq, headers) => {
          const cleanHeaders: any = { ...headers };
          delete cleanHeaders['x-user-id'];
          delete cleanHeaders['x-gateway-token'];
          
          return {
            ...cleanHeaders,
            'x-request-id': (originalReq as any).requestId || uuidv4(),
            'x-user-id': (originalReq as any).userId,
            'x-gateway-token': GATEWAY_TOKEN,
          };
        },
      },
    });
  }
);

// Recipe routes (protected)
fastify.register(
  async function (fastify) {
    // Note: JWT verification and rate limiting handled by global hook above
    
    // Concurrency limit for import job creation (reject fast, no queueing)
    fastify.addHook('preHandler', async (request, reply) => {
      if (request.url.includes('/import/youtube') && request.method === 'POST') {
        if (activeCreate >= MAX_CREATE) {
          return reply.code(503).send({
            error: {
              code: 'OVERLOADED',
              message: 'Too many concurrent requests',
              request_id: (request as any).requestId || 'unknown',
            },
          });
        }
        activeCreate++;
        let released = false;
        const release = () => {
          if (!released) {
            released = true;
            activeCreate--;
          }
        };
        reply.raw.once('finish', release);
        reply.raw.once('close', release);
        reply.raw.once('error', release);
        request.raw.once('aborted', release);
        request.raw.socket?.once('close', release);
      }
    });

    // Concurrency limit for import job status checks (reject fast, no queueing)
    fastify.addHook('preHandler', async (request, reply) => {
      if (request.url.match(/\/import-jobs\/[^\/]+$/) && request.method === 'GET') {
        if (activeStatus >= MAX_STATUS) {
          return reply.code(503).send({
            error: {
              code: 'OVERLOADED',
              message: 'Too many concurrent requests',
              request_id: (request as any).requestId || 'unknown',
            },
          });
        }
        activeStatus++;
        let released = false;
        const release = () => {
          if (!released) {
            released = true;
            activeStatus--;
          }
        };
        reply.raw.once('finish', release);
        reply.raw.once('close', release);
        reply.raw.once('error', release);
        request.raw.once('aborted', release);
        request.raw.socket?.once('close', release);
      }
    });

    // Note: Upstream timeout is handled by Fastify's requestTimeout + onTimeout handler
    fastify.register(httpProxy, {
      upstream: RECIPE_URL,
      prefix: '/api/recipes',
      rewritePrefix: '',
      http2: false,
      replyOptions: {
        rewriteRequestHeaders: (originalReq, headers) => {
          // Remove any user-supplied x-user-id and x-gateway-token
          const cleanHeaders: any = { ...headers };
          delete cleanHeaders['x-user-id'];
          delete cleanHeaders['x-gateway-token'];
          
          // Forward If-None-Match for ETag support
          const ifNoneMatch = (originalReq as any).headers['if-none-match'];
          if (ifNoneMatch) {
            cleanHeaders['if-none-match'] = ifNoneMatch;
          }
          
          return {
            ...cleanHeaders,
            'x-request-id': (originalReq as any).requestId || uuidv4(),
            'x-user-id': (originalReq as any).userId,
            'x-gateway-token': GATEWAY_TOKEN,
          };
        },
        // @fastify/http-proxy automatically forwards all response headers including ETag, Retry-After, Cache-Control
      },
    });
  }
);

// AI routes (protected)
fastify.register(
  async function (fastify) {
    // Note: JWT verification and rate limiting handled by global hook above
    // Note: Upstream timeout is handled by Fastify's requestTimeout + onTimeout handler
    fastify.register(httpProxy, {
      upstream: AI_ORCHESTRATOR_URL,
      prefix: '/api/ai',
      rewritePrefix: '',
      http2: false,
      replyOptions: {
        rewriteRequestHeaders: (originalReq, headers) => {
          // Remove any user-supplied headers that we control
          const cleanHeaders: any = { ...headers };
          delete cleanHeaders['x-service-token'];
          
          return {
            ...cleanHeaders,
            'x-request-id': (originalReq as any).requestId || uuidv4(),
            'x-service-token': SERVICE_TOKEN, // Use SERVICE_TOKEN for service-to-service auth
          };
        },
      },
    });
  }
);

// Search routes (protected)
fastify.register(
  async function (fastify) {
    // Note: JWT verification and rate limiting handled by global hook above
    fastify.register(httpProxy, {
      upstream: SEARCH_URL,
      prefix: '/api/search',
      rewritePrefix: '/search',
      http2: false,
      replyOptions: {
        rewriteRequestHeaders: (originalReq, headers) => {
          const cleanHeaders: any = { ...headers };
          delete cleanHeaders['x-user-id'];
          delete cleanHeaders['x-gateway-token'];
          
          return {
            ...cleanHeaders,
            'x-request-id': (originalReq as any).requestId || uuidv4(),
            'x-user-id': (originalReq as any).userId,
            'x-gateway-token': GATEWAY_TOKEN,
          };
        },
      },
    });
  }
);

// Feed routes (protected)
fastify.register(
  async function (fastify) {
    // Note: JWT verification and rate limiting handled by global hook above
    fastify.register(httpProxy, {
      upstream: FEED_URL,
      prefix: '/api/feed',
      rewritePrefix: '/feed',
      http2: false,
      replyOptions: {
        rewriteRequestHeaders: (originalReq, headers) => {
          const cleanHeaders: any = { ...headers };
          delete cleanHeaders['x-user-id'];
          delete cleanHeaders['x-gateway-token'];
          
          return {
            ...cleanHeaders,
            'x-request-id': (originalReq as any).requestId || uuidv4(),
            'x-user-id': (originalReq as any).userId,
            'x-gateway-token': GATEWAY_TOKEN,
          };
        },
      },
    });
  }
);

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info(`Gateway listening on port ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async () => {
  let forceExitTimer: NodeJS.Timeout | null = null;
  try {
    fastify.log.info('Shutting down gateway...');
    // Set forced exit timer (unref so it doesn't keep process alive)
    forceExitTimer = setTimeout(() => {
      fastify.log.warn('Forcing exit after shutdown timeout');
      process.exit(1);
    }, 10000);
    forceExitTimer.unref();
    
    await fastify.close();
    fastify.log.info('Gateway closed');
    
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

