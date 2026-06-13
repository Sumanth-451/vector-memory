import { pipeline } from '@xenova/transformers';

let _extractor = null;

async function getExtractor() {
  if (_extractor) return _extractor;
  _extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    quantized: true,
  });
  return _extractor;
}

export async function embed(text) {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}
