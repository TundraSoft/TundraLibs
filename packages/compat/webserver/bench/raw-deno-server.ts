// The floor: Deno.serve directly, no compat, no translation needed
// (Deno.serve already speaks Request/Response). Same two routes as
// compat-server.ts.
Deno.serve({ port: 4006 }, (req) => {
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
});
