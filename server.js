import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { initDb } from './db.js';
import { TOOLS, handleTool } from './tools.js';

const PORT = process.env.PORT ?? 3456;
const DEFAULT_NAMESPACE = process.env.AGENT_ID ?? 'fleet';

await initDb();

const app = express();

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'vector-memory' }));

// MCP SSE endpoint — one Server instance per connection
app.get('/sse', async (req, res) => {
  const agentId = req.query.agent_id ?? DEFAULT_NAMESPACE;

  const server = new Server(
    { name: 'vector-memory', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (mReq) => {
    return handleTool(mReq.params.name, mReq.params.arguments, agentId);
  });

  const transport = new SSEServerTransport('/message', res);
  await server.connect(transport);

  req.on('close', () => server.close());
});

// MCP message endpoint (SSE transport posts back here)
app.post('/message', express.json(), async (req, res) => {
  // SSEServerTransport handles this internally via the transport instance
  // This route is required by the MCP SSE spec
  res.status(200).end();
});

app.listen(PORT, () => {
  process.stderr.write(`[vector-memory] HTTP MCP server listening on port ${PORT}\n`);
});
