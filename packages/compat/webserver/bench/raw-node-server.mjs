// The floor: raw Node `http` module, no Fetch API involved at all (no
// Request/Response, no compat). Same two routes as compat-server.ts.
import http from 'node:http';

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  const match = req.url.match(/^\/users\/([^/]+)$/);
  if (match) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: match[1] }));
    return;
  }
  res.writeHead(404);
  res.end('Not Found');
});
server.listen(4005, () => {
  console.log('raw node http listening on 4005');
});
