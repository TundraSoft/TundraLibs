// The floor: Bun.serve directly, no compat, no translation needed
// (Bun.serve already speaks Request/Response). Same two routes as
// compat-server.ts.
Bun.serve({
  port: 4007,
  fetch(req) {
    const url = new URL(req.url);
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
console.log('raw Bun.serve listening on 4007');
