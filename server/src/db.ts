import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 12,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  console.error('[db] idle client error', err.message);
});

export async function q<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await pool.query<T>(text, params as never[]);
  return result.rows;
}

export async function one<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

/** Runs `fn` inside a single database transaction, rolling back on any error. */
export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* connection already broken */
    }
    throw error;
  } finally {
    client.release();
  }
}

const here = path.dirname(fileURLToPath(import.meta.url));

export async function migrate(): Promise<void> {
  const schema = fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');
  await pool.query(schema);

  // Admin credentials come from the platform secret store, never from source.
  // Once the password is changed in the admin panel (password_source = 'custom'),
  // the stored hash wins and a boot no longer overwrites it.
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminPassword) {
    const hash = await bcrypt.hash(adminPassword, 10);
    await pool.query(
      `INSERT INTO admin_users (username, password_hash, display_name)
       VALUES ('admin', $1, 'Administrator')
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash
       WHERE admin_users.password_source = 'secret'`,
      [hash]
    );
  }
  console.log('[db] schema ready');
}

export async function waitForDatabase(attempts = 40): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (error) {
      if (i === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}
