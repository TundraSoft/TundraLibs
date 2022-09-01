import { Options } from "../options/mod.ts";
import { Context } from "../dependencies.ts";
import { EndpointOptions } from "./types/mod.ts";
import { EndpointManager } from "./EndpointManager.ts";
// import type { HTTPMethods } from '../dependencies.ts'

export class BaseEndpoint extends Options<EndpointOptions> {
  constructor(options: Partial<EndpointOptions>) {
    const defOptions: Partial<EndpointOptions> = {
      permissions: {
        GET: true,
        POST: true,
        PUT: true,
        PATCH: true,
        DELETE: true,
        HEAD: true,
      },
    };
    // If norm model is defined, then the permissions will be basis norm model permissions

    // Set PK's as route params

    super(options, defOptions);
    // Register the endpoint
    EndpointManager.register(this);
  }

  public get route() {
    return this._getOption("route");
  }

  public get group() {
    return this._getOption("routeGroup");
  }

  public get name() {
    return this._getOption("name");
  }

  public get allowedMethods(): string[] {
    const permissions = this._getOption("permissions");
    return Object.keys(permissions).filter((method) => {
      return permissions[method as keyof typeof permissions] ? method : null;
    });
  }

  public handle(ctx: Context) {
    const { request, response } = ctx;
    // Check if the method is allowed
    if (!this.allowedMethods.includes(request.method)) {
      response.status = 405;
      response.body = "Method not allowed";
      return;
    }
    // Parse body and any params in url
    console.log("sdf");
    switch (request.method) {
      case "GET":
        break;
      case "POST":
        break;
      case "PUT":
        break;
      case "PATCH":
        break;
      case "DELETE":
        break;
      case "HEAD":
        break;
      case "OPTIONS":
        response.headers.set("Allow", this.allowedMethods.join(", "));
        response.status = 204;
        break;
      default:
        response.headers.set("Allow", this.allowedMethods.join(", "));
        response.status = 405;
        // throw createHttpError(405, 'Method not allowed');
    }
  }

  protected _GET() {}
  protected _POST() {}
  protected _PUT() {}
  protected _PATCH() {}
  protected _DELETE() {}

  protected _checkPermissions(method: string) {
    // This actually checks if the "user" has permissions to the endpoint
  }
}

const endPoint = new BaseEndpoint({
  permissions: {
    GET: true,
    POST: false,
    PATCH: false,
    PUT: false,
    DELETE: false,
    HEAD: false,
  },
});
import { Application, Router } from "http://deno.land/x/oak@v11.1.0/mod.ts";

const App = new Application(),
  router = new Router();
router.all("/", endPoint.handle.bind(endPoint));
router.options("/", endPoint.handle);

App.use(router.routes());
// App.use(router.allowedMethods());

App.listen({ port: 8000 });
