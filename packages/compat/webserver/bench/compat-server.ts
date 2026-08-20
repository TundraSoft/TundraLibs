// Bare `WebServer` — two hand-routed routes, no framework on top —
// isolates WebServer's OWN per-request cost (Fetch-API translation on
// Node, bookkeeping everywhere) from any consumer's. Runs unmodified
// under `deno run`, `bun run`, and `node --import tsx`.
import { WebServer } from '../mod.ts';

const server = new WebServer('compat-bench', {
  mode: 'TCP',
  port: 4004,
  hostname: 'localhost',
  handler: (request) => {
    const url = new URL(request.url);
    if (url.pathname === '/') {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    const match = url.pathname.match(/^\/users\/([^/]+)$/);
    if (match) {
      return new Response(JSON.stringify({ id: match[1] }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('Not Found', { status: 404 });
  },
});
await server.start();
console.log('compat WebServer listening on 4004');
