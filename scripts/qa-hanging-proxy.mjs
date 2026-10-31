import { createServer, request } from 'node:http';

// Dedicated Simulator QA only: forward synthetic bytes to the loopback mock,
// keep the accepted POST response pending, and allow GET/DELETE recovery.
const [portArg, stage] = process.argv.slice(2);
const port = Number(portArg);
const upstreamPort = Number(process.env.QA_MOCK_PORT ?? 8787);
if (!(Number.isInteger(port) && port >= 1024 && port <= 65535 && Number.isInteger(upstreamPort) && upstreamPort >= 1024 && upstreamPort <= 65535 && ['headers', 'body'].includes(stage))) {
  throw new Error('Usage: qa-hanging-proxy.mjs PORT headers|body; own loopback mock port: QA_MOCK_PORT (default 8787)');
}
const server = createServer((incoming, outgoing) => {
  const upstream = request({ hostname: '127.0.0.1', port: upstreamPort, path: incoming.url, method: incoming.method,
    headers: { ...incoming.headers, host: `127.0.0.1:${upstreamPort}` } }, response => {
    if (incoming.method === 'POST' && incoming.url === '/imports' && response.statusCode === 202) {
      response.resume();
      response.once('end', () => {
        if (outgoing.destroyed) return;
        if (stage === 'body') {
          outgoing.writeHead(202, { 'Content-Type': 'application/json' });
          outgoing.write('{');
        }
        // Intentionally no end(): the client deadline must release its UI.
      });
    } else {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    }
  });
  upstream.on('error', () => {
    if (!outgoing.headersSent) outgoing.writeHead(502);
    outgoing.end();
  });
  incoming.on('error', () => upstream.destroy());
  outgoing.on('close', () => upstream.destroy());
  incoming.pipe(upstream);
});
server.listen(port, '127.0.0.1', () => process.stdout.write(`QA proxy on loopback port ${port}; pending ${stage}.\n`));
