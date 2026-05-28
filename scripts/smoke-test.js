import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, '..', 'mcp-server.js');

const child = spawn(process.execPath, [serverPath], {
  stdio: ['pipe', 'pipe', 'inherit'],
});

let buf = '';
const pending = new Map();
let nextId = 1;

child.stdout.on('data', (chunk) => {
  buf += chunk.toString('utf8');
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    } catch (err) {
      console.error('[smoke] could not parse line:', line);
    }
  }
});

function call(method, params) {
  const id = nextId++;
  const req = { jsonrpc: '2.0', id, method, params };
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify(req) + '\n');
  });
}

function notify(method, params) {
  const req = { jsonrpc: '2.0', method, params };
  child.stdin.write(JSON.stringify(req) + '\n');
}

async function main() {
  console.log('--- initialize ---');
  const init = await call('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'smoke-test', version: '0.0.1' },
  });
  console.log(JSON.stringify(init, null, 2));
  notify('notifications/initialized', {});

  console.log('\n--- tools/list ---');
  const tools = await call('tools/list', {});
  for (const t of tools.tools) {
    console.log(`  - ${t.name} - ${(t.description || '').split('\n')[0]}`);
  }

  console.log('\n--- resources/list ---');
  const resources = await call('resources/list', {});
  for (const r of resources.resources) {
    console.log(`  - ${r.uri} (${r.mimeType}) - ${r.name}`);
  }

  console.log('\n--- tools/call search_books ---');
  const search = await call('tools/call', {
    name: 'search_books',
    arguments: { query: 'distributed', limit: 3 },
  });
  console.log(search.content[0].text);

  console.log('\n--- tools/call get_student_account ---');
  const account = await call('tools/call', {
    name: 'get_student_account',
    arguments: { student_id: 'S-1002' },
  });
  console.log(account.content[0].text);
  console.log('  _meta:', JSON.stringify(account._meta));

  console.log('\n--- tools/call list_overdue ---');
  const overdue = await call('tools/call', { name: 'list_overdue', arguments: {} });
  console.log(overdue.content[0].text);

  console.log('\n--- resources/read featured shelf ---');
  const featured = await call('resources/read', { uri: 'library://catalog/featured' });
  console.log(featured.contents[0].text);

  console.log('\nAll smoke checks passed.');
  child.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error('Smoke test FAILED:', err);
  child.kill();
  process.exit(1);
});
