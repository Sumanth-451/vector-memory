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

export async function search(query, { namespace, scope, type, limit = 5 } = {}) {
  const queryVec = await embed(query);
  const rows = await getAllMemories({ namespace, scope, type });

  const scored = rows.map(row => {
    const vec = JSON.parse(row.embedding);
    return { ...row, score: cosine(queryVec, vec) };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ embedding: _e, ...rest }) => rest);
}
