import { Options } from '../options/mod.ts';
import { Context } from '../dependencies.ts'
import { EndPointManager } from './EndPointManager.ts';
// import type { HTTPMethods } from '../dependencies.ts'

export type EndPointOptions = {
  // Name of the endpoint - For quick reference
  name: string;
  // The route path, example /users
  route: string;
  // The route group - Useful for deployment. Has no use case in app execution
  routeGroup: string;
  // Any "Params" found in the route. This will be used to switch from bulk to single endpoint (passed on as filter)
  routeParams: string[];
  // Permission settings
  permissions: {
    GET: boolean, 
    POST: boolean,
    PUT: boolean,
    PATCH: boolean,
    DELETE: boolean,
    HEAD: boolean,
  }
}

export class BaseEndPoint extends Options<EndPointOptions> {
  constructor(options: Partial<EndPointOptions>) {
    const defOptions: Partial<EndPointOptions> = {
      permissions: {
        GET: true,
        POST: true, 
        PUT: true,
        PATCH: true, 
        DELETE: true,
        HEAD: true,
      }
    };
    // If norm model is defined, then the permissions will be basis norm model permissions

    // Set PK's as route params

    super(options, defOptions);
    // Register the endpoint
    EndPointManager.register(this);
  }

  public get route() {
    return this._getOption('route');
  }

  public get group() {
    return this._getOption('routeGroup');
  }

  public get name() {
    return this._getOption('name');
  }

  public get allowedMethods(): string[] {
    const permissions = this._getOption('permissions');
    return Object.keys(permissions).filter((method) => {
      return permissions[method as keyof typeof permissions]? method: null;
    });
  }

  public handle(ctx: Context) {
    const { request, response } = ctx;
    // Check if the method is allowed
    if(!this.allowedMethods.includes(request.method)) {
      response.status = 405;
      response.body = 'Method not allowed';
      return;
    }
    // Parse body and any params in url
    console.log('sdf')
    switch(request.method) {
      case 'GET':
        break;
      case 'POST':
        break;
      case 'PUT':
        break;
      case 'PATCH':
        break;
      case 'DELETE':
        break;
      case 'HEAD':
        break;
      case 'OPTIONS':
        response.headers.set('Allow', this.allowedMethods.join(', '));
        response.status = 204;
        break;
      default:
        response.headers.set('Allow', this.allowedMethods.join(', '));
        response.status = 405;
        // throw createHttpError(405, 'Method not allowed');
    }
  }

  protected _GET(params: {[key: string]: string}, paging:) {}
  protected _POST() {}
  protected _PUT() {}
  protected _PATCH() {}
  protected _DELETE() {}

  protected _checkPermissions(method: string) {
    // This actually checks if the "user" has permissions to the endpoint
  }
}

const endPoint = new BaseEndPoint({
  permissions: {
    GET: true,
    POST: false, 
    PATCH: false, 
    PUT: false,
    DELETE: false,
    HEAD: false, 
  }
});
import { Application, Router } from 'http://deno.land/x/oak@v11.1.0/mod.ts'

const App = new Application(), 
  router = new Router();
router.all('/', endPoint.handle.bind(endPoint));
router.options('/', endPoint.handle);

App.use(router.routes());
// App.use(router.allowedMethods());

App.listen({ port: 8000 });