// Run during Docker build to pre-download the embedding model into the image
import { pipeline } from '@xenova/transformers';
process.stdout.write('Downloading all-MiniLM-L6-v2...\n');
await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });
process.stdout.write('Model ready.\n');
