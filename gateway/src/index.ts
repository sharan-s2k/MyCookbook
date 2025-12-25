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
const JWT_SECRET = process.env.JWT_PUBLIC_OR_SHARED_SECRET!;
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || process.env.SERVICE_TOKEN || JWT_SECRET; // Gateway token for internal services
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

const fastify = Fastify({ logger: true });

fastify.register(cors, {
  origin: FRONTEND_ORIGIN,
  credentials: true,
});

fastify.register(cookie);

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

// Health check
fastify.get('/health', async (request) => {
  return { status: 'healthy', service: 'gateway' };
});

// Auth routes (no JWT required)
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

// User routes (protected)
fastify.register(
  async function (fastify) {
    fastify.addHook('preHandler', verifyJWT);
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

// Recipe routes (protected)
fastify.register(
  async function (fastify) {
    fastify.addHook('preHandler', verifyJWT);
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

start();

