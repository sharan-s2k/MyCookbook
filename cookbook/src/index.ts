import Fastify from 'fastify';
import cors from '@fastify/cors';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

const PORT = parseInt(process.env.PORT || '8006', 10);
const DATABASE_URL = process.env.DATABASE_URL!;
const SERVICE_TOKEN = process.env.SERVICE_TOKEN!;
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || SERVICE_TOKEN;
const RECIPE_SERVICE_URL = process.env.RECIPE_SERVICE_URL || 'http://recipe:8003';
const DB_POOL_MAX = parseInt(process.env.DB_POOL_MAX || '10', 10);

const pool = new Pool({ 
  connectionString: DATABASE_URL,
  max: DB_POOL_MAX,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
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

// Helper: Validate UUID format
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// GET /cookbooks (protected) - List user's cookbooks (owned and saved)
// Query params: ?owner_id=UUID to get public cookbooks for a specific user
fastify.get('/', { preHandler: extractUserId }, async (request, reply) => {
  const userId = (request as any).userId;
  const { owner_id } = request.query as { owner_id?: string };

  // If owner_id is provided, return only public cookbooks for that user
  if (owner_id && owner_id !== userId) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT 
          c.id,
          c.owner_id,
          c.title,
          c.description,
          c.visibility,
          c.created_at,
          c.updated_at,
          COUNT(DISTINCT cr.recipe_id) as recipe_count
         FROM cookbooks c
         LEFT JOIN cookbook_recipes cr ON c.id = cr.cookbook_id
         WHERE c.owner_id = $1 AND c.visibility = 'PUBLIC'
         GROUP BY c.id
         ORDER BY c.updated_at DESC`,
        [owner_id]
      );

      const publicCookbooks = result.rows.map((row) => ({
        id: row.id,
        owner_id: row.owner_id,
        title: row.title,
        description: row.description,
        visibility: row.visibility,
        recipe_count: parseInt(row.recipe_count, 10),
        created_at: row.created_at,
        updated_at: row.updated_at,
        is_owner: false,
        saved_at: null,
      }));

      return reply.send({ owned: publicCookbooks, saved: [] });
    } catch (error) {
      fastify.log.error({ error }, 'Failed to get public cookbooks');
      return reply.code(500).send({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get public cookbooks',
          request_id: request.id,
        },
      });
    } finally {
      client.release();
    }
  }

  // Default: return current user's cookbooks (owned and saved)

  const client = await pool.connect();
  try {
    // Get owned cookbooks with recipe counts
    const ownedResult = await client.query(
      `SELECT 
        c.id,
        c.owner_id,
        c.title,
        c.description,
        c.visibility,
        c.created_at,
        c.updated_at,
        COUNT(DISTINCT cr.recipe_id) as recipe_count
       FROM cookbooks c
       LEFT JOIN cookbook_recipes cr ON c.id = cr.cookbook_id
       WHERE c.owner_id = $1
       GROUP BY c.id
       ORDER BY c.updated_at DESC`,
      [userId]
    );

    // Get saved cookbooks (public cookbooks saved by user) with recipe counts
    const savedResult = await client.query(
      `SELECT 
        c.id,
        c.owner_id,
        c.title,
        c.description,
        c.visibility,
        c.created_at,
        c.updated_at,
        COUNT(DISTINCT cr.recipe_id) as recipe_count,
        cs.saved_at
       FROM cookbook_saves cs
       JOIN cookbooks c ON cs.cookbook_id = c.id
       LEFT JOIN cookbook_recipes cr ON c.id = cr.cookbook_id
       WHERE cs.user_id = $1
       GROUP BY c.id, cs.saved_at
       ORDER BY cs.saved_at DESC`,
      [userId]
    );

    const owned = ownedResult.rows.map((row) => ({
      id: row.id,
      owner_id: row.owner_id,
      title: row.title,
      description: row.description,
      visibility: row.visibility,
      recipe_count: parseInt(row.recipe_count, 10),
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_owner: true,
      saved_at: null,
    }));

    const saved = savedResult.rows.map((row) => ({
      id: row.id,
      owner_id: row.owner_id,
      title: row.title,
      description: row.description,
      visibility: row.visibility,
      recipe_count: parseInt(row.recipe_count, 10),
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_owner: false,
      saved_at: row.saved_at,
    }));

    return reply.send({ owned, saved });
  } catch (error) {
    fastify.log.error({ error }, 'Failed to list cookbooks');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to list cookbooks',
        request_id: request.id,
      },
    });
  } finally {
    client.release();
  }
});

// POST /cookbooks (protected) - Create cookbook
fastify.post('/', { preHandler: extractUserId }, async (request, reply) => {
  const userId = (request as any).userId;
  const { title, description, visibility } = request.body as {
    title?: string;
    description?: string;
    visibility?: 'PRIVATE' | 'PUBLIC';
  };

  if (!title || title.trim().length === 0) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Title is required',
        request_id: request.id,
      },
    });
  }

  const vis = visibility === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE';

  const client = await pool.connect();
  try {
    const cookbookId = uuidv4();
    const result = await client.query(
      `INSERT INTO cookbooks (id, owner_id, title, description, visibility)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, owner_id, title, description, visibility, created_at, updated_at`,
      [cookbookId, userId, title.trim(), description?.trim() || null, vis]
    );

    const cookbook = result.rows[0];
    return reply.code(201).send({
      ...cookbook,
      recipe_count: 0,
      is_owner: true,
    });
  } catch (error) {
    fastify.log.error({ error }, 'Failed to create cookbook');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create cookbook',
        request_id: request.id,
      },
    });
  } finally {
    client.release();
  }
});

// GET /cookbooks/:cookbook_id (protected) - Get cookbook details
fastify.get('/:cookbook_id', { preHandler: extractUserId }, async (request, reply) => {
  const userId = (request as any).userId;
  const { cookbook_id } = request.params as { cookbook_id: string };

  if (!isValidUUID(cookbook_id)) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid cookbook id format',
        request_id: request.id,
      },
    });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT 
        c.id,
        c.owner_id,
        c.title,
        c.description,
        c.visibility,
        c.created_at,
        c.updated_at,
        COUNT(DISTINCT cr.recipe_id) as recipe_count
       FROM cookbooks c
       LEFT JOIN cookbook_recipes cr ON c.id = cr.cookbook_id
       WHERE c.id = $1
       GROUP BY c.id`,
      [cookbook_id]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Cookbook not found',
          request_id: request.id,
        },
      });
    }

    const cookbook = result.rows[0];

    // Check access: owner or public cookbook
    if (cookbook.owner_id !== userId && cookbook.visibility !== 'PUBLIC') {
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied',
          request_id: request.id,
        },
      });
    }

    // Get recipes in this cookbook (need to verify recipe exists and user has access)
    // For MVP, we'll fetch recipe IDs and let frontend fetch details
    const recipesResult = await client.query(
      `SELECT recipe_id, added_at
       FROM cookbook_recipes
       WHERE cookbook_id = $1
       ORDER BY added_at DESC`,
      [cookbook_id]
    );

    return reply.send({
      id: cookbook.id,
      owner_id: cookbook.owner_id,
      title: cookbook.title,
      description: cookbook.description,
      visibility: cookbook.visibility,
      recipe_count: parseInt(cookbook.recipe_count, 10),
      recipe_ids: recipesResult.rows.map((r) => r.recipe_id),
      created_at: cookbook.created_at,
      updated_at: cookbook.updated_at,
      is_owner: cookbook.owner_id === userId,
    });
  } catch (error) {
    fastify.log.error({ error }, 'Failed to get cookbook');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get cookbook',
        request_id: request.id,
      },
    });
  } finally {
    client.release();
  }
});

// PATCH /cookbooks/:cookbook_id (protected) - Update cookbook (owner only)
fastify.patch('/:cookbook_id', { preHandler: extractUserId }, async (request, reply) => {
  const userId = (request as any).userId;
  const { cookbook_id } = request.params as { cookbook_id: string };
  const { title, description, visibility } = request.body as {
    title?: string;
    description?: string;
    visibility?: 'PRIVATE' | 'PUBLIC';
  };

  if (!isValidUUID(cookbook_id)) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid cookbook id format',
        request_id: request.id,
      },
    });
  }

  const client = await pool.connect();
  try {
    // Verify ownership
    const checkResult = await client.query(
      `SELECT owner_id FROM cookbooks WHERE id = $1`,
      [cookbook_id]
    );

    if (checkResult.rows.length === 0) {
      return reply.code(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Cookbook not found',
          request_id: request.id,
        },
      });
    }

    if (checkResult.rows[0].owner_id !== userId) {
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Only owner can update cookbook',
          request_id: request.id,
        },
      });
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (title !== undefined) {
      if (!title || title.trim().length === 0) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Title cannot be empty',
            request_id: request.id,
          },
        });
      }
      updates.push(`title = $${paramIndex++}`);
      values.push(title.trim());
    }

    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(description?.trim() || null);
    }

    if (visibility !== undefined) {
      if (visibility !== 'PRIVATE' && visibility !== 'PUBLIC') {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Visibility must be PRIVATE or PUBLIC',
            request_id: request.id,
          },
        });
      }
      updates.push(`visibility = $${paramIndex++}`);
      values.push(visibility);
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
    values.push(cookbook_id);

    const result = await client.query(
      `UPDATE cookbooks SET ${updates.join(', ')} WHERE id = $${paramIndex}
       RETURNING id, owner_id, title, description, visibility, created_at, updated_at`,
      values
    );

    // Get recipe count
    const countResult = await client.query(
      `SELECT COUNT(*) as recipe_count FROM cookbook_recipes WHERE cookbook_id = $1`,
      [cookbook_id]
    );

    return reply.send({
      ...result.rows[0],
      recipe_count: parseInt(countResult.rows[0].recipe_count, 10),
      is_owner: true,
    });
  } catch (error) {
    fastify.log.error({ error }, 'Failed to update cookbook');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update cookbook',
        request_id: request.id,
      },
    });
  } finally {
    client.release();
  }
});

// DELETE /cookbooks/:cookbook_id (protected) - Delete cookbook (owner only)
fastify.delete('/:cookbook_id', { preHandler: extractUserId }, async (request, reply) => {
  const userId = (request as any).userId;
  const { cookbook_id } = request.params as { cookbook_id: string };

  if (!isValidUUID(cookbook_id)) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid cookbook id format',
        request_id: request.id,
      },
    });
  }

  const client = await pool.connect();
  try {
    // Verify ownership
    const checkResult = await client.query(
      `SELECT owner_id FROM cookbooks WHERE id = $1`,
      [cookbook_id]
    );

    if (checkResult.rows.length === 0) {
      return reply.code(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Cookbook not found',
          request_id: request.id,
        },
      });
    }

    if (checkResult.rows[0].owner_id !== userId) {
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Only owner can delete cookbook',
          request_id: request.id,
        },
      });
    }

    await client.query(`DELETE FROM cookbooks WHERE id = $1`, [cookbook_id]);

    return reply.send({ success: true });
  } catch (error) {
    fastify.log.error({ error }, 'Failed to delete cookbook');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to delete cookbook',
        request_id: request.id,
      },
    });
  } finally {
    client.release();
  }
});

// POST /cookbooks/:cookbook_id/save (protected) - Save public cookbook
fastify.post('/:cookbook_id/save', { preHandler: extractUserId }, async (request, reply) => {
  const userId = (request as any).userId;
  const { cookbook_id } = request.params as { cookbook_id: string };

  if (!isValidUUID(cookbook_id)) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid cookbook id format',
        request_id: request.id,
      },
    });
  }

  const client = await pool.connect();
  try {
    // Verify cookbook exists and is public
    const cookbookResult = await client.query(
      `SELECT owner_id, visibility FROM cookbooks WHERE id = $1`,
      [cookbook_id]
    );

    if (cookbookResult.rows.length === 0) {
      return reply.code(404).send({
        error: {
          code: 'NOT_FOUND',
          message: 'Cookbook not found',
          request_id: request.id,
        },
      });
    }

    const cookbook = cookbookResult.rows[0];

    if (cookbook.visibility !== 'PUBLIC') {
      return reply.code(403).send({
        error: {
          code: 'FORBIDDEN',
          message: 'Only public cookbooks can be saved',
          request_id: request.id,
        },
      });
    }

    if (cookbook.owner_id === userId) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Cannot save your own cookbook',
          request_id: request.id,
        },
      });
    }

    // Insert save (ON CONFLICT DO NOTHING for idempotency)
    await client.query(
      `INSERT INTO cookbook_saves (user_id, cookbook_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, cookbook_id) DO NOTHING`,
      [userId, cookbook_id]
    );

    return reply.send({ success: true });
  } catch (error) {
    fastify.log.error({ error }, 'Failed to save cookbook');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to save cookbook',
        request_id: request.id,
      },
    });
  } finally {
    client.release();
  }
});

// DELETE /cookbooks/:cookbook_id/save (protected) - Unsave cookbook
fastify.delete('/:cookbook_id/save', { preHandler: extractUserId }, async (request, reply) => {
  const userId = (request as any).userId;
  const { cookbook_id } = request.params as { cookbook_id: string };

  if (!isValidUUID(cookbook_id)) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid cookbook id format',
        request_id: request.id,
      },
    });
  }

  const client = await pool.connect();
  try {
    await client.query(
      `DELETE FROM cookbook_saves WHERE user_id = $1 AND cookbook_id = $2`,
      [userId, cookbook_id]
    );

    return reply.send({ success: true });
  } catch (error) {
    fastify.log.error({ error }, 'Failed to unsave cookbook');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to unsave cookbook',
        request_id: request.id,
      },
    });
  } finally {
    client.release();
  }
});

// POST /recipes/:recipe_id/cookbooks (protected) - Set recipe membership across cookbooks
fastify.post('/recipes/:recipe_id/cookbooks', { preHandler: extractUserId }, async (request, reply) => {
  const userId = (request as any).userId;
  const { recipe_id } = request.params as { recipe_id: string };
  const { cookbook_ids } = request.body as { cookbook_ids?: string[] };

  if (!isValidUUID(recipe_id)) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid recipe id format',
        request_id: request.id,
      },
    });
  }

  if (!Array.isArray(cookbook_ids)) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'cookbook_ids must be an array',
        request_id: request.id,
      },
    });
  }

  // Validate all cookbook IDs are UUIDs
  for (const id of cookbook_ids) {
    if (!isValidUUID(id)) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'All cookbook IDs must be valid UUIDs',
          request_id: request.id,
        },
      });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify recipe exists and user owns it
    // Note: In a real system, we'd call recipe service, but for MVP we'll trust the recipe_id
    // For now, we'll just ensure user owns all cookbooks they're trying to add to

    // Verify user owns all cookbooks
    if (cookbook_ids.length > 0) {
      const cookbooksResult = await client.query(
        `SELECT id, owner_id FROM cookbooks WHERE id = ANY($1::uuid[])`,
        [cookbook_ids]
      );

      for (const cookbook of cookbooksResult.rows) {
        if (cookbook.owner_id !== userId) {
          await client.query('ROLLBACK');
          return reply.code(403).send({
            error: {
              code: 'FORBIDDEN',
              message: 'You can only add recipes to your own cookbooks',
              request_id: request.id,
            },
          });
        }
      }

      // Check if all requested cookbooks exist
      if (cookbooksResult.rows.length !== cookbook_ids.length) {
        await client.query('ROLLBACK');
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'One or more cookbooks not found',
            request_id: request.id,
          },
        });
      }
    }

    // Remove all existing memberships for this recipe
    await client.query(
      `DELETE FROM cookbook_recipes WHERE recipe_id = $1`,
      [recipe_id]
    );

    // Add new memberships
    if (cookbook_ids.length > 0) {
      const values: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      for (const cookbookId of cookbook_ids) {
        values.push(`($${paramIndex++}, $${paramIndex++}, NOW())`);
        params.push(cookbookId, recipe_id);
      }

      await client.query(
        `INSERT INTO cookbook_recipes (cookbook_id, recipe_id, added_at) VALUES ${values.join(', ')}`,
        params
      );
    }

    // Update cookbooks' updated_at
    if (cookbook_ids.length > 0) {
      await client.query(
        `UPDATE cookbooks SET updated_at = NOW() WHERE id = ANY($1::uuid[])`,
        [cookbook_ids]
      );
    }

    await client.query('COMMIT');

    return reply.send({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    fastify.log.error({ error }, 'Failed to update recipe cookbook membership');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update recipe cookbook membership',
        request_id: request.id,
      },
    });
  } finally {
    client.release();
  }
});

// GET /recipes/:recipe_id/cookbooks (protected) - Get cookbooks a recipe belongs to
fastify.get('/recipes/:recipe_id/cookbooks', { preHandler: extractUserId }, async (request, reply) => {
  const userId = (request as any).userId;
  const { recipe_id } = request.params as { recipe_id: string };

  if (!isValidUUID(recipe_id)) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid recipe id format',
        request_id: request.id,
      },
    });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT c.id, c.title
       FROM cookbook_recipes cr
       JOIN cookbooks c ON cr.cookbook_id = c.id
       WHERE cr.recipe_id = $1 AND c.owner_id = $2
       ORDER BY cr.added_at DESC`,
      [recipe_id, userId]
    );

    return reply.send(result.rows.map((row) => row.id));
  } catch (error) {
    fastify.log.error({ error }, 'Failed to get recipe cookbooks');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get recipe cookbooks',
        request_id: request.id,
      },
    });
  } finally {
    client.release();
  }
});

// GET /internal/recipes/:recipe_id/public-check (internal) - Check if recipe is in a public cookbook
fastify.get('/internal/recipes/:recipe_id/public-check', { preHandler: verifyServiceToken }, async (request, reply) => {
  const { recipe_id } = request.params as { recipe_id: string };

  if (!isValidUUID(recipe_id)) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid recipe id format',
        request_id: request.id,
      },
    });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT COUNT(*) as count
       FROM cookbook_recipes cr
       JOIN cookbooks c ON cr.cookbook_id = c.id
       WHERE cr.recipe_id = $1 AND c.visibility = 'PUBLIC'`,
      [recipe_id]
    );

    const count = parseInt(result.rows[0]?.count || '0', 10);
    return reply.send({
      is_in_public_cookbook: count > 0,
    });
  } catch (error) {
    fastify.log.error({ error }, 'Failed to check if recipe is in public cookbook');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to check if recipe is in public cookbook',
        request_id: request.id,
      },
    });
  } finally {
    client.release();
  }
});

// POST /internal/recipes/:recipe_id/delete (internal) - Cleanup recipe from all cookbooks on deletion
fastify.post('/internal/recipes/:recipe_id/delete', { preHandler: verifyServiceToken }, async (request, reply) => {
  const { recipe_id } = request.params as { recipe_id: string };

  if (!isValidUUID(recipe_id)) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid recipe id format',
        request_id: request.id,
      },
    });
  }

  const client = await pool.connect();
  try {
    // Delete all cookbook_recipes entries (CASCADE should handle this, but explicit delete is safer)
    await client.query(
      `DELETE FROM cookbook_recipes WHERE recipe_id = $1`,
      [recipe_id]
    );

    return reply.send({ success: true });
  } catch (error) {
    fastify.log.error({ error }, 'Failed to cleanup recipe from cookbooks');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to cleanup recipe from cookbooks',
        request_id: request.id,
      },
    });
  } finally {
    client.release();
  }
});

// GET /internal/cookbooks/public (internal) - Get public cookbooks by owner IDs with pagination
fastify.get('/internal/cookbooks/public', { preHandler: verifyServiceToken }, async (request, reply) => {
  const { owner_ids: ownerIdsParam, limit: limitParam, cursor_published_at, cursor_id } = request.query as {
    owner_ids?: string;
    limit?: string;
    cursor_published_at?: string;
    cursor_id?: string;
  };

  if (!ownerIdsParam) {
    return reply.code(400).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'owner_ids is required',
        request_id: request.id,
      },
    });
  }

  const ownerIds = ownerIdsParam.split(',').filter(id => id.trim().length > 0);
  
  // Validate all owner IDs are valid UUIDs
  for (const id of ownerIds) {
    if (!isValidUUID(id.trim())) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid owner_id format: ${id}`,
          request_id: request.id,
        },
      });
    }
  }

  if (ownerIds.length === 0) {
    return reply.send([]);
  }

  const limit = Math.min(Math.max(parseInt(limitParam || '20', 10), 1), 50);

  const client = await pool.connect();
  try {
    let query = `
      SELECT 
        c.id,
        c.owner_id,
        c.title,
        c.description,
        c.visibility,
        c.created_at,
        c.updated_at,
        COUNT(DISTINCT cr.recipe_id) as recipe_count
      FROM cookbooks c
      LEFT JOIN cookbook_recipes cr ON c.id = cr.cookbook_id
      WHERE c.owner_id = ANY($1::uuid[]) 
        AND c.visibility = 'PUBLIC'
    `;
    
    const params: any[] = [ownerIds];
    let paramIndex = 2;

    // Add cursor-based pagination (keyset pagination)
    if (cursor_published_at && cursor_id) {
      if (!isValidUUID(cursor_id)) {
        return reply.code(400).send({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid cursor_id format',
            request_id: request.id,
          },
        });
      }
      // Sort by updated_at DESC, id DESC (newest first)
      // Cursor condition: (updated_at < cursor_published_at) OR (updated_at = cursor_published_at AND id < cursor_id)
      query += ` AND (
        c.updated_at < $${paramIndex}::timestamptz 
        OR (c.updated_at = $${paramIndex}::timestamptz AND c.id < $${paramIndex + 1}::uuid)
      )`;
      params.push(cursor_published_at, cursor_id);
      paramIndex += 2;
    }

    query += `
      GROUP BY c.id
      ORDER BY c.updated_at DESC, c.id DESC
      LIMIT $${paramIndex}
    `;
    params.push(limit);

    const result = await client.query(query, params);

    const cookbooks = result.rows.map((row) => ({
      id: row.id,
      owner_id: row.owner_id,
      title: row.title,
      description: row.description,
      visibility: row.visibility,
      recipe_count: parseInt(row.recipe_count, 10),
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    return reply.send(cookbooks);
  } catch (error) {
    fastify.log.error({ error, ownerIds }, 'Failed to get public cookbooks');
    return reply.code(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get public cookbooks',
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
    fastify.log.info(`Cookbook service listening on port ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Graceful shutdown
const shutdown = async () => {
  let forceExitTimer: NodeJS.Timeout | null = null;
  try {
    fastify.log.info('Shutting down cookbook service...');
    // Set forced exit timer (unref so it doesn't keep process alive)
    forceExitTimer = setTimeout(() => {
      fastify.log.warn('Forcing exit after shutdown timeout');
      process.exit(1);
    }, 10000);
    forceExitTimer.unref();
    
    // Close server first, then close DB pool
    await fastify.close();
    await pool.end();
    fastify.log.info('Cookbook service closed');
    
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
