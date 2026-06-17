import { getAllMemories } from './db.js';
import { embed } from './embeddings.js';

function cosine(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// BM25 parameters
const BM25_K1 = 1.5;
const BM25_B  = 0.75;

function tokenize(text) {
  return (text ?? '').toLowerCase().match(/\w+/g) ?? [];
}

function bm25Score(queryTerms, docTokens, df, N, avgdl) {
  const dl = docTokens.length;
  const tf = {};
  for (const t of docTokens) tf[t] = (tf[t] ?? 0) + 1;

  let score = 0;
  for (const term of queryTerms) {
    const f = tf[term] ?? 0;
    if (!f) continue;
    const idf = Math.log((N - (df[term] ?? 0) + 0.5) / ((df[term] ?? 0) + 0.5) + 1);
    score += idf * (f * (BM25_K1 + 1)) / (f + BM25_K1 * (1 - BM25_B + BM25_B * dl / avgdl));
  }
  return score;
}

export async function search(query, { namespace, scope, type, limit = 5 } = {}) {
  const [queryVec, rows] = await Promise.all([
    embed(query),
    getAllMemories({ namespace, scope, type }),
  ]);

  if (!rows.length) return [];

  const queryTerms = tokenize(query);

  // Precompute BM25 corpus stats
  const tokenized = rows.map(row => tokenize(row.content ?? ''));
  const avgdl = tokenized.reduce((s, t) => s + t.length, 0) / rows.length;
  const df = {};
  for (const tokens of tokenized) {
    for (const t of new Set(tokens)) df[t] = (df[t] ?? 0) + 1;
  }
  const N = rows.length;

  // Compute raw BM25 scores + semantic scores
  const rawBm25 = tokenized.map(t => bm25Score(queryTerms, t, df, N, avgdl));
  const maxBm25 = Math.max(...rawBm25, 1e-9); // avoid /0

  const scored = rows.map((row, i) => {
    const vec = JSON.parse(row.embedding);
    const semantic = cosine(queryVec, vec);           // already 0–1
    const keyword  = rawBm25[i] / maxBm25;            // normalise to 0–1
    const score    = 0.7 * semantic + 0.3 * keyword;
    return { ...row, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ embedding: _e, ...rest }) => rest);
}
