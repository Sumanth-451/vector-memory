/**
 * Dry-run migration: SM container dump → vector-memory (Turso)
 * Usage: node migrate.js <path-to-memories.json>
 *
 * memories.json schema: [{ content, namespace, scope, type, source }]
 * Exits 0 on success, 1 on any failure.
 */

import { readFileSync } from 'fs';
import { initDb, insertMemory, memoryExists } from './db.js';
import { embed } from './embeddings.js';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node migrate.js <memories.json>');
  process.exit(1);
}

const memories = JSON.parse(readFileSync(file, 'utf8'));
console.log(`[migrate] input: ${memories.length} records`);

await initDb();

let inserted = 0, skipped = 0, failed = 0;

for (const mem of memories) {
  const { content, namespace = 'AI_SUMANTH', scope = 'private', type = 'general', source_file = 'sm-migration' } = mem;
  try {
    const exists = await memoryExists(source_file, content);
    if (exists) { skipped++; continue; }
    const embedding = await embed(content);
    await insertMemory({ content, embedding, namespace, scope, type, source_file });
    inserted++;
    console.log(`  [+] ${type} — ${content.slice(0, 80)}…`);
  } catch (err) {
    failed++;
    console.error(`  [!] FAILED — ${content.slice(0, 60)}… — ${err.message}`);
  }
}

console.log(`\n[migrate] done — inserted: ${inserted}, skipped (dup): ${skipped}, failed: ${failed}`);
if (failed > 0) process.exit(1);
