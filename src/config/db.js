const path = require('path');
const Database = require('better-sqlite3');
const env = require('./env');

const dbPath = path.resolve(env.db.file);
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

/**
 * Compatibility layer so controllers written against mysql2/promise's
 * `pool.query(sql, params)` -> `[rows]` shape don't need to change at all.
 * better-sqlite3 is synchronous under the hood; we just wrap results in a
 * resolved Promise so every `await pool.query(...)` call still works.
 */
function query(sql, params = []) {
  const trimmed = sql.trim().toUpperCase();
  const stmt = db.prepare(sql);

  if (trimmed.startsWith('SELECT') || trimmed.startsWith('PRAGMA')) {
    return Promise.resolve([stmt.all(params)]);
  }
  const result = stmt.run(params);
  return Promise.resolve([{ insertId: result.lastInsertRowid, affectedRows: result.changes }]);
}

/**
 * Mimics mysql2's pool.getConnection() -> conn.beginTransaction()/commit()/
 * rollback()/release(), which staff.controller.js uses. SQLite's own
 * transaction API is different (db.transaction(fn)), but controllers were
 * written against the mysql2 shape, so we shim it here instead of rewriting
 * every controller.
 */
async function getConnection() {
  return {
    query,
    beginTransaction: async () => db.exec('BEGIN'),
    commit: async () => db.exec('COMMIT'),
    rollback: async () => {
      try { db.exec('ROLLBACK'); } catch { /* no-op if nothing to roll back */ }
    },
    release: () => {},
  };
}

const pool = { query, getConnection };

async function verifyConnection() {
  db.prepare('SELECT 1').get();
}

module.exports = { pool, verifyConnection };
