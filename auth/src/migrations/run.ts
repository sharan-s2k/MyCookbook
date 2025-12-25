import { Pool } from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DATABASE_URL = process.env.DATABASE_URL!;
const ADVISORY_LOCK_ID = 123456; // Unique per service

const pool = new Pool({ connectionString: DATABASE_URL });

async function runMigrations() {
  const client = await pool.connect();
  try {
    // Acquire advisory lock to prevent concurrent migrations
    const lockResult = await client.query('SELECT pg_try_advisory_lock($1)', [ADVISORY_LOCK_ID]);
    if (!lockResult.rows[0].pg_try_advisory_lock) {
      console.log('Another migration is running, waiting...');
      await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_ID]);
    }

    try {
      await client.query('BEGIN');

      // Create migrations table if it doesn't exist
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);

      // Get applied migrations
      const applied = await client.query('SELECT version FROM schema_migrations ORDER BY version');
      const appliedVersions = new Set(applied.rows.map((r) => r.version));

      // Auto-discover migration files
      const migrationDir = __dirname;
      const files = readdirSync(migrationDir)
        .filter((f) => f.endsWith('.sql') && /^\d+_/.test(f))
        .sort();

      for (const file of files) {
        const match = file.match(/^(\d+)_/);
        if (!match) continue;

        const version = parseInt(match[1], 10);
        if (appliedVersions.has(version)) {
          console.log(`Migration ${version} already applied, skipping`);
          continue;
        }

        console.log(`Applying migration ${version}: ${file}`);
        const migration = readFileSync(join(migrationDir, file), 'utf-8');
        await client.query(migration);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
        console.log(`Applied migration ${version}`);
      }

      await client.query('COMMIT');
      console.log('Migrations completed');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Migration failed:', error);
      throw error;
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((error) => {
  console.error(error);
  process.exit(1);
});

