// Isolates compat's WebServer (Fetch-API translation layer) from
// rapid's OWN overhead (routing, context construction, middleware).
// Same two routes as rapid-server.ts, hand-routed with a plain
// if/else — no radrouter, no Application, no Context — so this
// measures ONLY what compat's WebServer costs on top of the runtime's
// native HTTP server. Runs identically under `deno run` and
// `node --import tsx`.
import { WebServer } from "../../compat/webserver/mod.ts";

const server = new WebServer("compat-bench", {
  mode: "TCP",
  port: 4004,
  hostname: "localhost",
  handler: (request) => {
    const url = new URL(request.url);
    if (url.pathname === "/") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      });
    }
    const match = url.pathname.match(/^\/users\/([^/]+)$/);
    if (match) {
      return new Response(JSON.stringify({ id: match[1] }), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("Not Found", { status: 404 });
  },
});
await server.start();
console.log(`compat WebServer listening on 4004`);
