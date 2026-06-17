/**
 * vector-memory full test suite
 * Tests: HTTP layer, auth, DB ops, BM25 hybrid search, edge cases
 * Usage: node test.js
 */

import { initDb, insertMemory, getAllMemories, deleteMemory, memoryExists } from './db.js';
import { embed } from './embeddings.js';
import { search } from './search.js';

const BASE_URL = process.env.VM_URL ?? 'https://vector-memory.onrender.com';
const FLEET_SECRET = process.env.FLEET_SECRET;
const NS = 'test-suite';

let passed = 0, failed = 0;

function ok(label, val) {
  if (val) { console.log(`  ✓ ${label}`); passed++; }
  else      { console.error(`  ✗ ${label}`); failed++; }
}

async function httpGet(path, headers = {}) {
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  return res;
}

// ── 1. HTTP LAYER ────────────────────────────────────────────────────────────
console.log('\n── 1. HTTP layer ──');

const health = await httpGet('/health');
ok('/health returns 200', health.status === 200);
const healthBody = await health.json();
ok('/health body has status:ok', healthBody.status === 'ok');
ok('/health body has service:vector-memory', healthBody.service === 'vector-memory');

// ── 2. BEARER AUTH ───────────────────────────────────────────────────────────
console.log('\n── 2. Bearer auth ──');

const sseNoToken = await httpGet('/sse');
ok('/sse without token → 401', sseNoToken.status === 401);

const sseBadToken = await httpGet('/sse', { Authorization: 'Bearer wrong-token' });
ok('/sse with bad token → 401', sseBadToken.status === 401);

const msgNoToken = await fetch(`${BASE_URL}/message`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
ok('/message without token → 401', msgNoToken.status === 401);

const msgBadToken = await fetch(`${BASE_URL}/message`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer bad' } });
ok('/message with bad token → 401', msgBadToken.status === 401);

if (FLEET_SECRET) {
  const sseGood = await httpGet('/sse', { Authorization: `Bearer ${FLEET_SECRET}` });
  ok('/sse with valid token → not 401', sseGood.status !== 401);
} else {
  console.log('  ~ /sse valid-token test skipped (FLEET_SECRET not set locally)');
}

// ── 3. DB LAYER ──────────────────────────────────────────────────────────────
console.log('\n── 3. DB layer ──');

await initDb();

// Insert
const vec = await embed('fleet bus polling cadence');
const id = await insertMemory({ content: 'fleet bus polling cadence test record', embedding: vec, namespace: NS, scope: 'private', type: 'general', source_file: 'test-suite' });
ok('insertMemory returns id (number or bigint)', (typeof id === 'number' || typeof id === 'bigint') && id > 0);

// Duplicate detection
const dup = await memoryExists('test-suite', 'fleet bus polling cadence test record');
ok('memoryExists detects duplicate', dup === true);

// getAllMemories with namespace filter
const rows = await getAllMemories({ namespace: NS });
ok('getAllMemories returns inserted record', rows.some(r => r.content.includes('fleet bus polling')));

// Delete
await deleteMemory(id);
const afterDelete = await getAllMemories({ namespace: NS });
ok('deleteMemory removes record', !afterDelete.some(r => r.id === id));

// ── 4. SEARCH — SEMANTIC ─────────────────────────────────────────────────────
console.log('\n── 4. Semantic search ──');

// Seed test records
const v1 = await embed('CORE1 bus poll cadence ladder SYNC HOLD LOW-POWER');
const v2 = await embed('bearer token authentication FLEET_SECRET security');
const v3 = await embed('BM25 keyword ranking TF-IDF term frequency');
const id1 = await insertMemory({ content: 'CORE1 bus poll cadence ladder SYNC HOLD LOW-POWER', embedding: v1, namespace: NS, scope: 'private', type: 'feedback', source_file: 'test-suite' });
const id2 = await insertMemory({ content: 'bearer token authentication FLEET_SECRET security', embedding: v2, namespace: NS, scope: 'private', type: 'feedback', source_file: 'test-suite' });
const id3 = await insertMemory({ content: 'BM25 keyword ranking TF-IDF term frequency', embedding: v3, namespace: NS, scope: 'private', type: 'feedback', source_file: 'test-suite' });

const semResults = await search('bus cadence polling', { namespace: NS, limit: 3 });
ok('semantic search returns results', semResults.length > 0);
ok('top result is cadence record', semResults[0].content.includes('cadence'));
ok('results have score field', typeof semResults[0].score === 'number');
ok('score is between 0 and 1', semResults[0].score >= 0 && semResults[0].score <= 1);
ok('embedding stripped from results', semResults[0].embedding === undefined);

// ── 5. SEARCH — BM25 HYBRID ──────────────────────────────────────────────────
console.log('\n── 5. BM25 hybrid search ──');

const hybridResults = await search('FLEET_SECRET bearer authentication', { namespace: NS, limit: 3 });
ok('hybrid search returns results', hybridResults.length > 0);
ok('keyword-heavy query finds auth record', hybridResults[0].content.includes('bearer') || hybridResults[0].content.includes('FLEET_SECRET'));

// Exact-keyword boost: BM25 should pull "BM25" record to top for BM25 query
const bm25Results = await search('BM25 keyword TF-IDF', { namespace: NS, limit: 3 });
ok('BM25 query ranks keyword record highly', bm25Results[0].content.includes('BM25'));

// ── 6. EDGE CASES ────────────────────────────────────────────────────────────
console.log('\n── 6. Edge cases ──');

// Empty result set for unknown namespace
const emptyNs = await search('anything', { namespace: 'nonexistent-ns-xyz', limit: 5 });
ok('unknown namespace returns empty array', Array.isArray(emptyNs) && emptyNs.length === 0);

// Very short query
const shortQ = await search('x', { namespace: NS, limit: 3 });
ok('single-char query does not throw', Array.isArray(shortQ));

// Special characters in content
const vecSpl = await embed('special chars: <>&"\' SQL injection test -- DROP TABLE');
const idSpl = await insertMemory({ content: 'special chars: <>&"\' SQL injection test -- DROP TABLE', embedding: vecSpl, namespace: NS, scope: 'private', type: 'general', source_file: 'test-suite' });
ok('special chars insert without error', typeof idSpl === 'number' || typeof idSpl === 'bigint');
const splSearch = await search('SQL injection DROP TABLE', { namespace: NS, limit: 5 });
ok('special chars record is searchable', splSearch.some(r => r.content.includes('SQL injection')));

// Type filter
const typeResults = await getAllMemories({ namespace: NS, type: 'feedback' });
ok('type filter works', typeResults.every(r => r.type === 'feedback'));

// Limit respected
const limitResults = await search('cadence bearer BM25', { namespace: NS, limit: 2 });
ok('limit is respected', limitResults.length <= 2);

// Zero-memory corpus (isolated namespace)
const zeroResults = await search('anything', { namespace: 'empty-ns-test-abc', limit: 5 });
ok('empty corpus returns []', Array.isArray(zeroResults) && zeroResults.length === 0);

// ── 7. CLEANUP ───────────────────────────────────────────────────────────────
console.log('\n── 7. Cleanup ──');
for (const r of await getAllMemories({ namespace: NS })) {
  await deleteMemory(r.id);
}
const afterCleanup = await getAllMemories({ namespace: NS });
ok('all test records cleaned up', afterCleanup.length === 0);

// ── SUMMARY ──────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(40)}`);
console.log(`PASSED: ${passed}  FAILED: ${failed}  TOTAL: ${passed + failed}`);
if (failed > 0) process.exit(1);
