import { createServer, request } from 'node:http';
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';

// Test-only network fault injection. The supplied kit and release app stay unchanged.
// Logs contain hashes/counts/protocol state, never document bytes or filenames.
const [portArg, upstreamArg, traceFile] = process.argv.slice(2);
const port = Number(portArg);
const upstreamPort = Number(upstreamArg);
const modes = new Set(['pass', 'progress', 'error', 'drop-first-post', 'malformed-create']);
if (![port, upstreamPort].every(value => Number.isInteger(value) && value >= 1024 && value <= 65535) || !traceFile) {
  throw new Error('Usage: qa-contract-proxy.mjs PORT UPSTREAM_PORT NEW_TRACE.jsonl');
}
appendFileSync(traceFile, '', { flag: 'wx' });
let mode = 'pass';
let dropped = false;
const reads = new Map();
const events = [];
const digest = value => createHash('sha256').update(value).digest('hex');
function json(response, code, value) {
  response.writeHead(code, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(value));
}
function record(value) {
  events.push(value);
  appendFileSync(traceFile, JSON.stringify(value) + '\n');
}

createServer(async (incoming, outgoing) => {
  if (incoming.url === '/__qa/state') return json(outgoing, 200, { mode, events });
  if (incoming.url === '/__qa/mode' && incoming.method === 'POST') {
    let text = '';
    for await (const chunk of incoming) {
      text += chunk;
      if (text.length > 256) return json(outgoing, 413, {});
    }
    try {
      const next = JSON.parse(text).mode;
      if (!modes.has(next)) return json(outgoing, 400, {});
      mode = next;
      dropped = false;
      reads.clear();
      // Keep each native scenario repeatable; the append-only trace retains prior runs.
      events.length = 0;
      return json(outgoing, 200, { mode });
    } catch {
      return json(outgoing, 400, {});
    }
  }
  const currentMode = mode;
  const event = {
    mode: currentMode,
    method: incoming.method,
    route: incoming.url.replace(/\/by-key\/[^/?]+/, '/by-key/:key'),
    keyHash: incoming.headers['idempotency-key'] ? digest(incoming.headers['idempotency-key']) : null,
    filenameHeaderPresent: typeof incoming.headers['x-file-name'] === 'string',
    contentType: incoming.headers['content-type'] ?? null,
    bytes: 0,
  };
  const hash = createHash('sha256');
  incoming.on('data', chunk => { event.bytes += chunk.length; hash.update(chunk); });
  incoming.on('end', () => { event.sha256 = hash.digest('hex'); });
  if (currentMode === 'drop-first-post' && !dropped && incoming.method === 'POST' && incoming.url === '/imports') {
    dropped = true;
    incoming.resume();
    incoming.on('end', () => {
      record({ ...event, forwarded: false });
      outgoing.destroy();
    });
    return;
  }
  const upstream = request({ hostname: '127.0.0.1', port: upstreamPort, path: incoming.url,
    method: incoming.method, headers: { ...incoming.headers, host: `127.0.0.1:${upstreamPort}` } }, response => {
    let text = '';
    response.on('data', chunk => { text += chunk; });
    response.on('end', () => {
      let body;
      try { body = JSON.parse(text); } catch { body = { error: 'invalid upstream JSON' }; }
      const originalStatus = body.status ?? null;
      let delay = 0;
      const jobGet = incoming.method === 'GET' && /^\/imports\/job-demo-/.test(incoming.url);
      if (jobGet && body.jobId && !['deleting', 'deleted'].includes(body.status)) {
        if (currentMode === 'error') body = { jobId: body.jobId, status: 'error', revision: 3 };
        if (currentMode === 'progress') {
          const count = (reads.get(body.jobId) ?? 0) + 1;
          reads.set(body.jobId, count);
          if (count <= 2) body = { jobId: body.jobId, status: count === 1 ? 'queued' : 'processing', revision: count };
          delay = 1800;
        }
      }
      if (currentMode === 'progress' && jobGet && body.status === 'deleted' && !reads.has(body.jobId + ':deletion')) {
        reads.set(body.jobId + ':deletion', 1);
        body = { jobId: body.jobId, status: 'deleting', revision: 4 };
        delay = 1800;
      }
      if (currentMode === 'malformed-create' && incoming.method === 'POST' && incoming.url === '/imports' && response.statusCode === 202) {
        body = { ...body, status: ['queued'] };
      }
      record({ ...event, forwarded: true, httpStatus: response.statusCode, originalStatus,
        deliveredStatus: body.status ?? null, revision: body.revision ?? null });
      setTimeout(() => { if (!outgoing.destroyed) json(outgoing, response.statusCode ?? 502, body); }, delay);
    });
  });
  upstream.on('error', () => {
    record({ ...event, forwarded: true, transportError: true });
    if (!outgoing.destroyed) outgoing.destroy();
  });
  incoming.on('error', () => upstream.destroy());
  outgoing.on('close', () => upstream.destroy());
  incoming.pipe(upstream);
}).listen(port, '127.0.0.1', () => process.stdout.write(`QA contract proxy on ${port}, upstream ${upstreamPort}.\n`));
