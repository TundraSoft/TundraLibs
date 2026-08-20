// Minimal fastify server for benchmarking — same two routes as rapid-server.ts.
import Fastify from "fastify";

const app = Fastify({ logger: false });
app.get("/", () => ({ ok: true }));
app.get("/users/:id", (req) => ({ id: req.params.id }));
app.listen({ port: 4004 }, () => {
  console.log("fastify listening on 4004");
});
