// DePaul Library — A2A demo server.
//
// This is the smallest thing that can credibly be called an A2A agent:
//
//  - It serves an Agent Card at /.well-known/agent-card.json
//  - It implements the A2A JSON-RPC binding at POST / with two methods:
//      message/send   — accepts a "build me a reading list on X" request
//      tasks/get      — returns the previously created task
//
// It deliberately uses the same fake data as the MCP server, so the two
// demos tell one story: the same domain, exposed two ways.
//
// Run with: node a2a-server.js   (default port 7042)

import express from 'express';
import { randomUUID } from 'node:crypto';
import { buildReadingList } from './data/library.js';

const PORT = Number(process.env.A2A_PORT || 7042);
const PUBLIC_URL = process.env.A2A_PUBLIC_URL || `http://localhost:${PORT}`;

const app = express();
app.use(express.json({ limit: '128kb' }));

// ---------------------------------------------------------------------------
// Agent Card — the "menu" other agents read.
// Path is the A2A standard: /.well-known/agent-card.json
// ---------------------------------------------------------------------------
const agentCard = {
  protocolVersion: '0.3',
  name: 'depaul-library-research-helper',
  description:
    'A small agent that builds short, opinionated reading lists from the DePaul library catalog. ' +
    'Demo agent for CSC 394.',
  url: `${PUBLIC_URL}/`, // JSON-RPC endpoint
  version: '0.1.0',
  provider: { organization: 'DePaul University (CSC 394 demo)' },
  capabilities: { streaming: false, pushNotifications: false },
  defaultInputModes: ['text/plain'],
  defaultOutputModes: ['text/plain', 'application/json'],
  skills: [
    {
      id: 'build_reading_list',
      name: 'Build a reading list',
      description:
        'Given a topic and a level (undergrad | graduate), return a short ordered reading list ' +
        'drawn from the DePaul library catalog with a one-line note explaining each pick.',
      tags: ['research', 'library', 'reading-list'],
      examples: [
        'Build me a reading list on distributed systems for an undergrad student.',
        'I need three books on language implementation for a grad seminar.',
      ],
      inputModes: ['text/plain'],
      outputModes: ['application/json', 'text/plain'],
    },
  ],
  // securitySchemes intentionally omitted — this demo is unauthenticated.
};

app.get('/.well-known/agent-card.json', (_req, res) => res.json(agentCard));

// ---------------------------------------------------------------------------
// Task store — in memory. Real agents would persist this.
// ---------------------------------------------------------------------------
const tasks = new Map();

function newTask(initialMessage, readingList) {
  const id = randomUUID();
  const now = new Date().toISOString();
  const task = {
    id,
    contextId: randomUUID(),
    kind: 'task',
    status: { state: 'completed', timestamp: now },
    history: [initialMessage],
    artifacts: [
      {
        artifactId: randomUUID(),
        name: 'reading-list',
        parts: [
          { kind: 'data', data: readingList },
          {
            kind: 'text',
            text:
              `Reading list on "${readingList.topic}" (${readingList.level}):\n` +
              readingList.items
                .map((it) => `  ${it.order}. ${it.title} — ${it.author}\n     ${it.why}`)
                .join('\n') +
              `\n\n${readingList.note}`,
          },
        ],
      },
    ],
    metadata: { generatedBy: 'depaul-library-research-helper' },
  };
  tasks.set(id, task);
  return task;
}

// ---------------------------------------------------------------------------
// Naïve parsing of a free-text request into (topic, level).
// In a real agent the LLM would do this; we keep it dumb on purpose.
// ---------------------------------------------------------------------------
function parseRequest(text) {
  const lower = (text || '').toLowerCase();
  const level = /\b(grad|graduate|master|phd|doctora)/i.test(lower) ? 'graduate' : 'undergrad';
  // Strip filler.
  const cleaned = lower
    .replace(/build (me )?(a )?(short )?(reading|book)\s*list( on| about| for)?/g, '')
    .replace(/^i need.*?on/g, '')
    .replace(/for (an? )?(undergrad|graduate|grad|student|seminar).*$/g, '')
    .replace(/[.?!]/g, '')
    .trim();
  return { topic: cleaned || text || '', level };
}

// ---------------------------------------------------------------------------
// JSON-RPC endpoint
// ---------------------------------------------------------------------------
function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}
function rpcError(id, code, message, data) {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } };
}

app.post('/', (req, res) => {
  const body = req.body || {};
  const { id = null, method, params = {} } = body;

  try {
    if (method === 'message/send') {
      const message = params.message;
      if (!message || !Array.isArray(message.parts)) {
        return res.json(rpcError(id, -32602, 'Invalid params: missing message.parts'));
      }
      const text = message.parts
        .filter((p) => p.kind === 'text' || p.type === 'text')
        .map((p) => p.text || '')
        .join(' ')
        .trim();
      if (!text) {
        return res.json(rpcError(id, -32602, 'Invalid params: no text parts in message'));
      }
      const { topic, level } = parseRequest(text);
      const readingList = buildReadingList(topic, level);
      const incoming = {
        ...message,
        messageId: message.messageId || randomUUID(),
        role: 'user',
        kind: 'message',
      };
      const task = newTask(incoming, readingList);
      return res.json(rpcResult(id, task));
    }

    if (method === 'tasks/get') {
      const taskId = params.id || params.taskId;
      const task = tasks.get(taskId);
      if (!task) return res.json(rpcError(id, -32001, `Unknown task id: ${taskId}`));
      return res.json(rpcResult(id, task));
    }

    return res.json(rpcError(id, -32601, `Method not found: ${method}`));
  } catch (err) {
    return res.json(rpcError(id, -32000, 'Internal error', { stack: String(err?.message || err) }));
  }
});

// ---------------------------------------------------------------------------
// Friendly index page so people can sanity-check the server in a browser.
// ---------------------------------------------------------------------------
app.get('/', (_req, res) => {
  res.set('content-type', 'text/html').send(`
    <html><body style="font-family: system-ui; max-width: 720px; margin: 40px auto; padding: 0 16px;">
      <h1>DePaul Library — A2A Demo Agent</h1>
      <p>This is the JSON-RPC endpoint. Browsers see this page; agents POST JSON-RPC here.</p>
      <ul>
        <li><a href="/.well-known/agent-card.json">/.well-known/agent-card.json</a> — Agent Card</li>
      </ul>
      <p>Try it from the terminal:</p>
      <pre style="background:#0b1220;color:#e5e7eb;padding:12px;border-radius:8px;overflow-x:auto">curl -s ${PUBLIC_URL}/ -H "content-type: application/json" -d '{
  "jsonrpc":"2.0","id":1,"method":"message/send",
  "params":{"message":{"role":"user","parts":[{"kind":"text","text":"reading list on distributed systems for grad"}]}}
}' | jq .</pre>
    </body></html>
  `);
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[depaul-library-a2a] listening on ${PUBLIC_URL}`);
  console.log(`  agent card: ${PUBLIC_URL}/.well-known/agent-card.json`);
  console.log(`  JSON-RPC:   POST ${PUBLIC_URL}/`);
});
