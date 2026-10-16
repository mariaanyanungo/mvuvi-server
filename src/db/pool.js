const { Pool } = require('pg');
const { config } = require('../config');

let pool = null;

if (config.db.url) {
  pool = new Pool({
    connectionString: config.db.url,
    ssl: config.db.ssl ? { rejectUnauthorized: false } : undefined,
    max: 10
  });
  pool.on('error', (err) => console.error('[DB] Pool error:', err.message));
}

function enabled() {
  return pool !== null;
}

function disabledError() {
  const err = new Error('Database is not configured (DATABASE_URL is empty).');
  err.code = 'DB_DISABLED';
  return err;
}

async function query(text, params) {
  if (!pool) throw disabledError();
  return pool.query(text, params);
}

async function withTransaction(fn) {
  if (!pool) throw disabledError();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function ping() {
  if (!pool) return false;
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    return false;
  }
}

async function close() {
  if (pool) await pool.end();
}

module.exports = { enabled, query, withTransaction, ping, close };
