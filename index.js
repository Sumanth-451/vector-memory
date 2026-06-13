import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readdir, readFile } from 'fs/promises';
import { join, basename } from 'path';
import { initDb, insertMemory, deleteMemory, getAllMemories, memoryExists } from './db.js';
import { embed } from './embeddings.js';
import { search } from './search.js';
import { TOOLS, handleTool } from './tools.js';

const MEMORY_DIR = join(import.meta.dirname, '..', 'projects', 'C--Users-suman--claude', 'memory');
const DEFAULT_NAMESPACE = process.env.AGENT_ID ?? 'sumanth';

export async function indexMemoryFiles() {
  let files;
  try { files = await readdir(MEMORY_DIR); } catch { return; }

  const mdFiles = files.filter(f => f.endsWith('.md') && f !== 'MEMORY.md');
  let indexed = 0;

  for (const file of mdFiles) {
    const content = (await readFile(join(MEMORY_DIR, file), 'utf8')).trim();
    const body = content.replace(/^---[\s\S]*?---\n?/, '').trim();
    if (!body) continue;
    if (await memoryExists(file, body)) continue;

    const name = basename(file, '.md');
    let type = 'general';
    if (name.startsWith('feedback_'))       type = 'feedback';
    else if (name.startsWith('session_'))   type = 'project';
    else if (name.startsWith('user_'))      type = 'user';
    else if (name.startsWith('reference_')) type = 'reference';

    const embedding = await embed(body);
    await insertMemory({ content: body, embedding, namespace: DEFAULT_NAMESPACE, scope: 'private', type, source_file: file });
    indexed++;
  }

  if (indexed > 0) process.stderr.write(`[vector-memory] indexed ${indexed} memory file(s)\n`);
}

const server = new Server(
  { name: 'vector-memory', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  return handleTool(req.params.name, req.params.arguments, DEFAULT_NAMESPACE);
});

await initDb();
await indexMemoryFiles();
const transport = new StdioServerTransport();
await server.connect(transport);
