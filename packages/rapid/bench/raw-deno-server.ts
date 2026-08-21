// The absolute floor on Deno: Deno.serve directly, no compat, no
// Fetch-API translation needed (Deno.serve already speaks Request/Response).
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
