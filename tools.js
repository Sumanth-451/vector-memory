import { insertMemory, deleteMemory, getAllMemories } from './db.js';
import { embed } from './embeddings.js';
import { search } from './search.js';

export const TOOLS = [
  {
    name: 'memory_save',
    description: 'Save a memory with namespace, scope (private|shared), and type',
    inputSchema: {
      type: 'object',
      properties: {
        content:   { type: 'string' },
        namespace: { type: 'string', description: 'Agent/project namespace (default: caller agent)' },
        scope:     { type: 'string', enum: ['private', 'shared'] },
        type:      { type: 'string', enum: ['feedback', 'project', 'user', 'reference', 'general'] },
      },
      required: ['content'],
    },
  },
  {
    name: 'memory_search',
    description: 'Semantic search — finds relevant memories even without exact keyword matches',
    inputSchema: {
      type: 'object',
      properties: {
        query:     { type: 'string' },
        namespace: { type: 'string', description: 'Also always includes shared memories' },
        type:      { type: 'string', enum: ['feedback', 'project', 'user', 'reference', 'general'] },
        limit:     { type: 'number' },
      },
      required: ['query'],
    },
  },
  {
    name: 'memory_list',
    description: 'List stored memories, optionally filtered by namespace or type',
    inputSchema: {
      type: 'object',
      properties: {
        namespace: { type: 'string' },
        type:      { type: 'string', enum: ['feedback', 'project', 'user', 'reference', 'general'] },
      },
    },
  },
  {
    name: 'memory_delete',
    description: 'Delete a memory by ID',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number' } },
      required: ['id'],
    },
  },
];

export async function handleTool(name, args = {}, defaultNamespace = 'default') {
  try {
    if (name === 'memory_save') {
      const { content, namespace = defaultNamespace, scope = 'private', type = 'general' } = args;
      const embedding = await embed(content);
      const id = await insertMemory({ content, embedding, namespace, scope, type, source_file: null });
      return { content: [{ type: 'text', text: `Saved memory #${id} (namespace:${namespace} scope:${scope} type:${type})` }] };
    }

    if (name === 'memory_search') {
      const { query, namespace = defaultNamespace, type, limit = 5 } = args;
      const results = await search(query, { namespace, type, limit });
      if (!results.length) return { content: [{ type: 'text', text: 'No matching memories found.' }] };
      const text = results.map(r =>
        `[#${r.id} | ${r.type} | ${r.namespace} | score:${r.score.toFixed(3)}]\n${r.content}`
      ).join('\n\n---\n\n');
      return { content: [{ type: 'text', text }] };
    }

    if (name === 'memory_list') {
      const { namespace = defaultNamespace, type } = args;
      const rows = await getAllMemories({ namespace, type });
      if (!rows.length) return { content: [{ type: 'text', text: 'No memories found.' }] };
      const text = rows.map(r =>
        `#${r.id} | ${r.type} | ${r.scope} | ${r.namespace} | ${r.source_file ?? 'manual'}\n${String(r.content).slice(0, 120)}${String(r.content).length > 120 ? '…' : ''}`
      ).join('\n\n');
      return { content: [{ type: 'text', text }] };
    }

    if (name === 'memory_delete') {
      await deleteMemory(args.id);
      return { content: [{ type: 'text', text: `Deleted memory #${args.id}` }] };
    }

    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
  } catch (err) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
}
