// Precedent MCP server — exposes the team decision registry to any MCP client
// (Claude, Cursor, other agents). Run: npm run mcp
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { searchDecisions, getDecision, listDecisions, listOutstandingCommitments, insertDecision } from '../src/db.js';

const server = new McpServer({ name: 'precedent', version: '0.1.0' });

server.tool(
  'search_decisions',
  'Search the team decision registry by topic. Returns decisions with title, rationale, alternatives, and a permalink to the original Slack thread.',
  { query: z.string().describe('Topic or question, e.g. "database choice"') },
  async ({ query }) => ({
    content: [{ type: 'text', text: JSON.stringify(searchDecisions(query, 5), null, 2) }],
  })
);

server.tool(
  'get_decision',
  'Fetch a single decision by its id.',
  { id: z.number().int() },
  async ({ id }) => ({
    content: [{ type: 'text', text: JSON.stringify(getDecision(id) || { error: 'not found' }, null, 2) }],
  })
);

server.tool(
  'list_recent_decisions',
  'List the most recently logged team decisions.',
  { limit: z.number().int().min(1).max(50).default(10) },
  async ({ limit }) => ({
    content: [{ type: 'text', text: JSON.stringify(listDecisions(limit), null, 2) }],
  })
);

server.tool(
  'list_open_commitments',
  'List outstanding commitments (who promised what, and when it is due).',
  {},
  async () => ({
    content: [{ type: 'text', text: JSON.stringify(listOutstandingCommitments(25), null, 2) }],
  })
);

server.tool(
  'log_decision',
  'Record a new decision in the registry (e.g. one made outside Slack).',
  {
    title: z.string(),
    summary: z.string().optional(),
    rationale: z.string().optional(),
    alternatives: z.string().optional(),
  },
  async (d) => {
    const id = insertDecision(d);
    return { content: [{ type: 'text', text: `Logged decision #${id}: ${d.title}` }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error('Precedent MCP server ready (stdio).');
