import { Application, Router } from "http://deno.land/x/oak@v11.1.0/mod.ts";
import { path } from '../../dependencies.ts'
import { EndpointManager } from "../EndpointManager.ts";

const App = new Application(),
  router = new Router();

const epath = path.join(Deno.cwd(), 'endpoint', 'tests', 'endpoints');

await EndpointManager.loadEndpoints(Deno.realPathSync(epath));

const endpoints = EndpointManager.getEndpoints();
endpoints.forEach((endpoint) => {
  console.log(endpoint.route);
  router.options(endpoint.route, endpoint.handle.bind(endpoint));
  router.all(endpoint.route, endpoint.handle.bind(endpoint));
});

App.use(router.routes());
App.listen({ port: 8000 });