import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Client } from '@opensearch-project/opensearch';
import { Kafka } from 'kafkajs';
import { v4 as uuidv4 } from 'uuid';

const PORT = parseInt(process.env.PORT || '8007', 10);
const OPENSEARCH_URL = process.env.OPENSEARCH_URL || 'http://localhost:9200';
const OPENSEARCH_INDEX_NAME = process.env.OPENSEARCH_INDEX_NAME || 'cookflow_search';
const KAFKA_BROKERS_STR = process.env.KAFKA_BROKERS || 'localhost:9092';
const KAFKA_BROKERS = KAFKA_BROKERS_STR.includes(',') 
  ? KAFKA_BROKERS_STR.split(',').map(b => b.trim())
  : [KAFKA_BROKERS_STR.trim()];
const KAFKA_TOPIC_USERS = process.env.KAFKA_TOPIC_USERS || 'user.events';
const KAFKA_TOPIC_RECIPES = process.env.KAFKA_TOPIC_RECIPES || 'recipe.events';
const SERVICE_TOKEN = process.env.SERVICE_TOKEN!;
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || SERVICE_TOKEN;
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:8002';
const RECIPE_SERVICE_URL = process.env.RECIPE_SERVICE_URL || 'http://localhost:8003';

// OpenSearch client
const opensearch = new Client({
  node: OPENSEARCH_URL,
  ssl: {
    rejectUnauthorized: false, // For local dev only
  },
});

// Kafka setup
const kafka = new Kafka({
  brokers: KAFKA_BROKERS,
  clientId: 'search-service',
});

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
// Security: Only trust identity from gateway (verified JWT), never from client
async function extractUserId(request: any, reply: any) {
  const gatewayToken = request.headers['x-gateway-token'];
  const userId = request.headers['x-user-id'];

  // Verify gateway token - ensures request came from gateway after JWT verification
  if (gatewayToken !== GATEWAY_TOKEN) {
    return reply.code(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid gateway token',
        request_id: request.id,
      },
    });
  }

  // User ID must come from gateway (from verified JWT), never from client
  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    return reply.code(401).send({
      error: {
        code: 'UNAUTHORIZED',
        message: 'User ID not found',
        request_id: request.id,
      },
    });
  }

  // Store userId from verified gateway headers only (trim to normalize)
  request.userId = userId.trim();
}

// Bootstrap OpenSearch index
async function bootstrapIndex() {
  try {
    const exists = await opensearch.indices.exists({
      index: OPENSEARCH_INDEX_NAME,
    });

    if (!exists) {
      fastify.log.info(`Creating OpenSearch index: ${OPENSEARCH_INDEX_NAME}`);
      await opensearch.indices.create({
        index: OPENSEARCH_INDEX_NAME,
        body: {
          settings: {
            analysis: {
              analyzer: {
                default: {
                  type: 'standard',
                },
              },
            },
            number_of_shards: 1,
            number_of_replicas: 0, // For local dev
          },
          mappings: {
            properties: {
              type: { type: 'keyword' }, // 'user' | 'recipe'
              id: { type: 'keyword' },
              title: {
                type: 'text',
                fields: {
                  keyword: { type: 'keyword' },
                },
              },
              subtitle: { type: 'text' }, // username for users, description for recipes
              content: { type: 'text' }, // bio for users, ingredients text for recipes
              ownerId: { type: 'keyword' }, // for recipes
              username: { type: 'keyword' }, // for users
              displayName: { type: 'text' }, // for users
              avatarUrl: { type: 'keyword' }, // for users
              thumbnailUrl: { type: 'keyword' }, // for recipes
              updatedAt: { type: 'date' },
            },
          },
        },
      });
      fastify.log.info('OpenSearch index created successfully');
    } else {
      fastify.log.info(`OpenSearch index ${OPENSEARCH_INDEX_NAME} already exists`);
    }
  } catch (error: any) {
    fastify.log.error({ error }, 'Failed to bootstrap OpenSearch index');
    throw error;
  }
}

// GET /search (protected)
fastify.get('/search', { preHandler: extractUserId }, async (request, reply) => {
  const userId = (request as any).userId;
  const { q = '', scope = 'all', limitUsers = 10, limitRecipes = 10 } = request.query as {
    q?: string;
    scope?: string;
    limitUsers?: string;
    limitRecipes?: string;
  };

  const query = String(q).trim();
  const scopeType = String(scope);
  const limitU = parseInt(String(limitUsers), 10) || 10;
  const limitR = parseInt(String(limitRecipes), 10) || 10;

  if (!query) {
    return reply.send({
      users: scopeType === 'all' || scopeType === 'users' ? [] : undefined,
      recipes: scopeType === 'all' || scopeType === 'recipes' ? [] : undefined,
    });
  }

  try {
    const queries: any[] = [];
    const responses: any = {};

    // Users query
    if (scopeType === 'all' || scopeType === 'users') {
      const userQuery: any = {
        index: OPENSEARCH_INDEX_NAME,
        body: {
          size: limitU,
          query: {
            bool: {
              must: [
                { term: { 'type.keyword': 'user' } },
                  {
                    multi_match: {
                      query,
                      fields: ['displayName^3', 'username^4', 'title^2', 'content^1'],
                      type: 'best_fields',
                      operator: 'or',
                    },
                  },
              ],
            },
          },
          highlight: {
            fields: {
              displayName: {},
              username: {},
              content: {},
            },
          },
        },
      };
      queries.push(
        opensearch.search(userQuery).then((resp: any) => {
          // OpenSearch client returns response in resp.body for newer versions
          const hits = resp?.body?.hits || resp?.hits;
          responses.users = (hits?.hits || []).map((hit: any) => ({
            id: hit._source.id,
            username: hit._source.username,
            displayName: hit._source.displayName || hit._source.title,
            bio: hit._source.content,
            avatarUrl: hit._source.avatarUrl,
            highlight: hit.highlight ? {
              displayName: hit.highlight.displayName?.[0],
              username: hit.highlight.username?.[0],
              bio: hit.highlight.content?.[0],
            } : undefined,
          }));
        }).catch((err: any) => {
          fastify.log.error({ 
            err: err?.message || String(err), 
            stack: err?.stack
          }, 'User search query failed');
          responses.users = [];
        })
      );
    }

    // Recipes query (filtered by owner - access control enforced)
    if (scopeType === 'all' || scopeType === 'recipes') {
      // Access control: userId comes only from gateway (verified JWT), never from client
      if (!userId) {
        fastify.log.warn({ requestId: request.id }, 'Recipe search attempted without userId');
        return reply.code(403).send({
          error: {
            code: 'FORBIDDEN',
            message: 'Authentication required',
            request_id: request.id,
          },
        });
      }

      const recipeQuery: any = {
        index: OPENSEARCH_INDEX_NAME,
        body: {
          size: limitR,
          query: {
            bool: {
              must: [
                { term: { 'type.keyword': 'recipe' } },
                {
                  match: {
                    title: query,
                  },
                },
              ],
              // Access control: Query-time enforcement - ALWAYS filter by ownerId
              // Use ownerId.keyword because ownerId is a text field with a keyword subfield
              filter: [
                { term: { 'ownerId.keyword': userId.trim() } }, // Only user's own recipes - enforced at query time
              ],
            },
          },
          highlight: {
            fields: {
              title: {},
            },
          },
        },
      };
      queries.push(
        opensearch.search(recipeQuery).then((resp: any) => {
          // OpenSearch client returns response in resp.body for newer versions
          const hits = resp?.body?.hits || resp?.hits;
          const rawHits = hits?.hits || [];

          // Defense-in-depth: Server-side verification after receiving results
          // This should never happen if query filter works correctly, but prevents regressions
          const validHits = rawHits.filter((hit: any) => {
            const hitOwnerId = String(hit._source?.ownerId || '').trim();
            const normalizedUserId = userId.trim();
            if (hitOwnerId !== normalizedUserId) {
              fastify.log.warn({ 
                userId: normalizedUserId,
                hitOwnerId,
                hitId: hit._source?.id,
                hitTitle: hit._source?.title,
                requestId: request.id
              }, 'SECURITY: Recipe hit with mismatched ownerId - dropping (should never happen)');
              return false;
            }
            return true;
          });

          // Log if any hits were dropped (should never happen in production)
          if (validHits.length < rawHits.length) {
            fastify.log.warn({ 
              userId,
              dropped: rawHits.length - validHits.length,
              total: rawHits.length,
              requestId: request.id
            }, 'SECURITY: Dropped recipe hits due to ownerId mismatch');
          }

          responses.recipes = validHits.map((hit: any) => ({
            id: hit._source.id,
            title: hit._source.title,
            description: hit._source.subtitle,
            thumbnailUrl: hit._source.thumbnailUrl,
            highlight: hit.highlight ? {
              title: hit.highlight.title?.[0],
            } : undefined,
          }));
        }).catch((err: any) => {
          fastify.log.error({ 
            err: err?.message || String(err), 
            stack: err?.stack
          }, 'Recipe search query failed');
          responses.recipes = [];
        })
      );
    }

    // Execute queries if any
    if (queries.length > 0) {
      await Promise.all(queries);
    } else {
      // No queries to execute (shouldn't happen, but handle gracefully)
      if (scopeType === 'all') {
        return reply.send({ users: [], recipes: [] });
      } else if (scopeType === 'users') {
        return reply.send({ users: [] });
      } else if (scopeType === 'recipes') {
        return reply.send({ recipes: [] });
      }
    }

    // Format response based on scope
    if (scopeType === 'all') {
      return reply.send({
        users: responses.users || [],
        recipes: responses.recipes || [],
      });
    } else if (scopeType === 'users') {
      return reply.send({ users: responses.users || [] });
    } else if (scopeType === 'recipes') {
      return reply.send({ recipes: responses.recipes || [] });
    } else {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid scope. Must be "all", "users", or "recipes"',
          request_id: request.id,
        },
      });
    }
  } catch (error: any) {
    fastify.log.error({ 
      error: error?.message || String(error), 
      stack: error?.stack
    }, 'Search failed');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Search failed',
        request_id: request.id,
      },
    });
  }
});

// POST /internal/index/upsert (internal)
fastify.post('/internal/index/upsert', { preHandler: verifyServiceToken }, async (request, reply) => {
  const documents = (request.body as any).documents || [request.body];

  if (!Array.isArray(documents) || documents.length === 0) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'documents array is required',
        request_id: request.id,
      },
    });
  }

  try {
    const body: any[] = [];
    for (const doc of documents) {
      body.push({ index: { _index: OPENSEARCH_INDEX_NAME, _id: `${doc.type}_${doc.id}` } });
      body.push({
        type: doc.type,
        id: doc.id,
        title: doc.title || '',
        subtitle: doc.subtitle || '',
        content: doc.content || '',
        ownerId: doc.ownerId,
        username: doc.username,
        displayName: doc.displayName,
        avatarUrl: doc.avatarUrl,
        thumbnailUrl: doc.thumbnailUrl,
        updatedAt: doc.updatedAt || new Date().toISOString(),
      });
    }

    const response = await opensearch.bulk({ body });
    if (response.errors) {
      fastify.log.warn({ errors: response.items }, 'Some documents failed to index');
    }

    return reply.send({
      success: true,
      indexed: response.items.length / 2,
    });
  } catch (error: any) {
    fastify.log.error({ error }, 'Failed to index documents');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to index documents',
        request_id: request.id,
      },
    });
  }
});

// POST /internal/index/delete (internal)
fastify.post('/internal/index/delete', { preHandler: verifyServiceToken }, async (request, reply) => {
  const { type, id } = request.body as { type?: string; id?: string };

  if (!type || !id) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'type and id are required',
        request_id: request.id,
      },
    });
  }

  try {
    await opensearch.delete({
      index: OPENSEARCH_INDEX_NAME,
      id: `${type}_${id}`,
      refresh: true,
    });

    return reply.send({ success: true });
  } catch (error: any) {
    if (error.statusCode === 404) {
      return reply.send({ success: true, message: 'Document not found (already deleted)' });
    }
    fastify.log.error({ error, type, id }, 'Failed to delete document');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to delete document',
        request_id: request.id,
      },
    });
  }
});

// POST /internal/reindex/users (internal)
fastify.post('/internal/reindex/users', { preHandler: verifyServiceToken }, async (request, reply) => {
  try {
    // Fetch all users from user service
    const response = await fetch(`${USER_SERVICE_URL}/internal/users/all`, {
      headers: {
        'x-service-token': SERVICE_TOKEN,
        'x-request-id': (request as any).requestId || uuidv4(),
      },
    });

    if (!response.ok) {
      return reply.code(502).send({
        error: {
          code: 'SERVICE_ERROR',
          message: 'Failed to fetch users from user service',
          request_id: request.id,
        },
      });
    }

    const users = await response.json();
    const documents = users.map((user: any) => ({
      type: 'user',
      id: user.id,
      title: user.display_name || user.username || '',
      subtitle: user.username || '',
      content: user.bio || '',
      username: user.username,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      updatedAt: user.updated_at || user.created_at || new Date().toISOString(),
    }));

    // Bulk index
    const body: any[] = [];
    for (const doc of documents) {
      body.push({ index: { _index: OPENSEARCH_INDEX_NAME, _id: `${doc.type}_${doc.id}` } });
      body.push({
        type: doc.type,
        id: doc.id,
        title: doc.title,
        subtitle: doc.subtitle,
        content: doc.content,
        username: doc.username,
        displayName: doc.displayName,
        avatarUrl: doc.avatarUrl,
        updatedAt: doc.updatedAt,
      });
    }

    if (body.length > 0) {
      await opensearch.bulk({ body });
    }

    return reply.send({
      success: true,
      indexed: documents.length,
    });
  } catch (error: any) {
    fastify.log.error({ error }, 'Failed to reindex users');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to reindex users',
        request_id: request.id,
      },
    });
  }
});

// POST /internal/reindex/recipes (internal)
fastify.post('/internal/reindex/recipes', { preHandler: verifyServiceToken }, async (request, reply) => {
  try {
    // Fetch all recipes from recipe service
    const response = await fetch(`${RECIPE_SERVICE_URL}/internal/recipes/all`, {
      headers: {
        'x-service-token': SERVICE_TOKEN,
        'x-request-id': (request as any).requestId || uuidv4(),
      },
    });

    if (!response.ok) {
      return reply.code(502).send({
        error: {
          code: 'SERVICE_ERROR',
          message: 'Failed to fetch recipes from recipe service',
          request_id: request.id,
        },
      });
    }

    const recipes = await response.json();
    const documents = recipes.map((recipe: any) => {
      // Build ingredients text from ingredients array
      const ingredientsText = Array.isArray(recipe.ingredients)
        ? recipe.ingredients.map((ing: any) => `${ing.qty} ${ing.unit} ${ing.item}`).join(', ')
        : '';

      return {
        type: 'recipe',
        id: recipe.id,
        title: recipe.title || '',
        subtitle: recipe.description || '',
        content: ingredientsText,
        // Ensure ownerId is stored as a string (trimmed) to match JWT sub claim format
        ownerId: String(recipe.owner_id || '').trim(),
        thumbnailUrl: recipe.source_type === 'youtube' ? `https://img.youtube.com/vi/${extractVideoId(recipe.source_ref)}/mqdefault.jpg` : undefined,
        updatedAt: recipe.updated_at || recipe.created_at || new Date().toISOString(),
      };
    });

    // Bulk index
    const body: any[] = [];
    for (const doc of documents) {
      body.push({ index: { _index: OPENSEARCH_INDEX_NAME, _id: `${doc.type}_${doc.id}` } });
      body.push({
        type: doc.type,
        id: doc.id,
        title: doc.title,
        subtitle: doc.subtitle,
        content: doc.content,
        ownerId: doc.ownerId,
        thumbnailUrl: doc.thumbnailUrl,
        updatedAt: doc.updatedAt,
      });
    }

    if (body.length > 0) {
      await opensearch.bulk({ body });
    }

    return reply.send({
      success: true,
      indexed: documents.length,
    });
  } catch (error: any) {
    fastify.log.error({ error }, 'Failed to reindex recipes');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to reindex recipes',
        request_id: request.id,
      },
    });
  }
});

// Helper: Extract YouTube video ID
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Kafka consumer for indexing
async function startKafkaConsumer() {
  const consumer = kafka.consumer({ groupId: 'search-service-indexer' });

  await consumer.connect();
  fastify.log.info('Kafka consumer connected');

  await consumer.subscribe({
    topics: [KAFKA_TOPIC_USERS, KAFKA_TOPIC_RECIPES],
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      try {
        if (!message.value) return;

        const event = JSON.parse(message.value.toString());
        fastify.log.info({ topic, event }, 'Received Kafka event');

        if (topic === KAFKA_TOPIC_USERS) {
          if (event.event === 'user.created' || event.event === 'user.updated') {
            const doc = {
              type: 'user',
              id: event.id,
              title: event.display_name || event.username || '',
              subtitle: event.username || '',
              content: event.bio || '',
              username: event.username,
              displayName: event.display_name,
              avatarUrl: event.avatar_url,
              updatedAt: event.updated_at || new Date().toISOString(),
            };
            await opensearch.index({
              index: OPENSEARCH_INDEX_NAME,
              id: `user_${event.id}`,
              body: doc,
              refresh: true,
            });
            fastify.log.info({ userId: event.id }, 'Indexed user');
          } else if (event.event === 'user.deleted') {
            await opensearch.delete({
              index: OPENSEARCH_INDEX_NAME,
              id: `user_${event.id}`,
              refresh: true,
            });
            fastify.log.info({ userId: event.id }, 'Deleted user from index');
          }
        } else if (topic === KAFKA_TOPIC_RECIPES) {
          if (event.event === 'recipe.created' || event.event === 'recipe.updated') {
            const ingredientsText = Array.isArray(event.ingredients)
              ? event.ingredients.map((ing: any) => `${ing.qty} ${ing.unit} ${ing.item}`).join(', ')
              : '';

            const doc = {
              type: 'recipe',
              id: event.id,
              title: event.title || '',
              subtitle: event.description || '',
              content: ingredientsText,
              // Ensure ownerId is stored as a string (trimmed) to match JWT sub claim format
              ownerId: String(event.owner_id || '').trim(),
              thumbnailUrl: event.source_type === 'youtube' && event.source_ref
                ? `https://img.youtube.com/vi/${extractVideoId(event.source_ref)}/mqdefault.jpg`
                : undefined,
              updatedAt: event.updated_at || event.created_at || new Date().toISOString(),
            };
            await opensearch.index({
              index: OPENSEARCH_INDEX_NAME,
              id: `recipe_${event.id}`,
              body: doc,
              refresh: true,
            });
            fastify.log.info({ recipeId: event.id }, 'Indexed recipe');
          } else if (event.event === 'recipe.deleted') {
            await opensearch.delete({
              index: OPENSEARCH_INDEX_NAME,
              id: `recipe_${event.id}`,
              refresh: true,
            });
            fastify.log.info({ recipeId: event.id }, 'Deleted recipe from index');
          }
        }
      } catch (error: any) {
        fastify.log.error({ error, topic, message }, 'Failed to process Kafka message');
      }
    },
  });
}

// Health check
fastify.get('/health', async () => {
  try {
    const health = await opensearch.cluster.health();
    return {
      status: 'healthy',
      opensearch: health.status === 'green' || health.status === 'yellow' ? 'healthy' : 'unhealthy',
    };
  } catch (error) {
    return { status: 'unhealthy', error: String(error) };
  }
});

// Start server
const start = async () => {
  try {
    // Bootstrap index
    await bootstrapIndex();
    fastify.log.info('OpenSearch index ready');

    // Start Kafka consumer
    await startKafkaConsumer();

    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    fastify.log.info(`Search service listening on port ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async () => {
  const consumer = kafka.consumer({ groupId: 'search-service-indexer' });
  await consumer.disconnect();
  await fastify.close();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start();

