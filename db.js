import { createClient } from '@libsql/client';
import { join } from 'path';

const url  = process.env.TURSO_URL        ?? `file:${join(import.meta.dirname, 'memories.db')}`;
const authToken = process.env.TURSO_AUTH_TOKEN ?? undefined;

let _db;

export function getDb() {
  if (_db) return _db;
  _db = createClient({ url, authToken });
  return _db;
}

export async function initDb() {
  const db = getDb();
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS memories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      content     TEXT    NOT NULL,
      embedding   TEXT    NOT NULL,
      namespace   TEXT    NOT NULL DEFAULT 'default',
      scope       TEXT    NOT NULL DEFAULT 'private',
      type        TEXT    NOT NULL DEFAULT 'general',
      source_file TEXT,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_namespace ON memories(namespace);
    CREATE INDEX IF NOT EXISTS idx_scope     ON memories(scope);
    CREATE INDEX IF NOT EXISTS idx_type      ON memories(type);
  `);
}

export async function insertMemory({ content, embedding, namespace, scope, type, source_file }) {
  const db = getDb();
  const json = JSON.stringify(Array.from(embedding));
  const result = await db.execute({
    sql: `INSERT INTO memories (content, embedding, namespace, scope, type, source_file)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [content, json, namespace, scope, type, source_file ?? null],
  });
  return result.lastInsertRowid;
}

export async function getAllMemories({ namespace, scope, type } = {}) {
  const db = getDb();
  const conditions = [];
  const args = [];

  if (namespace) {
    conditions.push(`(namespace = ? OR scope = 'shared')`);
    args.push(namespace);
  }
  if (scope) { conditions.push('scope = ?'); args.push(scope); }
  if (type)  { conditions.push('type = ?');  args.push(type); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const result = await db.execute({ sql: `SELECT * FROM memories ${where} ORDER BY created_at DESC`, args });
  return result.rows;
}

export async function deleteMemory(id) {
  return getDb().execute({ sql: 'DELETE FROM memories WHERE id = ?', args: [id] });
}

export async function memoryExists(source_file, content) {
  const result = await getDb().execute({
    sql: 'SELECT id FROM memories WHERE source_file = ? AND content = ?',
    args: [source_file, content],
  });
  return result.rows.length > 0;
}
