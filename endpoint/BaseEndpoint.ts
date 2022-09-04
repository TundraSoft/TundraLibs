import { Options } from "../options/mod.ts";
import { Context, oakHelpers } from "../dependencies.ts";
import type { EndpointOptions, PagingParam, SortingParam, ParsedBody, ParsedRequest } from "./types/mod.ts";
import { EndpointManager } from "./EndpointManager.ts";
// import type { HTTPMethods } from '../dependencies.ts'

export abstract class BaseEndpoint<T extends EndpointOptions> extends Options<T> {
  
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
    super(options, defOptions);
    // Register the endpoint
    EndpointManager.register(this);
  }

  public get route() {
    // Final route is - routePath + routeGroup + routeName
    return this._getOption("routePath");
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

  public async handle(ctx: Context) {
    const { request, response } = ctx;
    // Check if the method is allowed
    if (!this.allowedMethods.includes(request.method)) {
      response.status = 405;
      response.body = "Method not allowed";
      return;
    }
    const req = await this._parseRequest(ctx);
    // Parse body and any params in url
    // const routeParams = ctx.params, //oakHelpers.getQuery(ctx),
    //   searchParams = request.url.searchParams,
    //   abc = oakHelpers.getQuery(ctx, { mergeParams: true });
    // console.log(routeParams, searchParams);
    // console.log(abc);

    /* Setup basic response headers */

    switch (request.method) {
      case "GET":
        this._GET(req, ctx);
        break;
      case "POST":
        this._POST(req, ctx);
        break;
      case "PUT":
        this._PUT(req, ctx);
        break;
      case "PATCH":
        this._PATCH(req, ctx);
        break;
      case "DELETE":
        this._DELETE(req, ctx);
        break;
      case "HEAD":
        // We run head, get then remove body and send that
        this._GET(req, ctx);
        response.body = undefined;
        break;
      case "OPTIONS":
        response.headers.set("Allow", this.allowedMethods.join(", "));
        response.status = 204;
        break;
      default:
        response.headers.set("Allow", this.allowedMethods.join(", "));
        response.status = 405;
        break;
    }
    // Set few response headers
  }

  protected abstract _GET(req: ParsedRequest, ctx: Context): void;
  protected abstract _POST(req: ParsedRequest, ctx: Context): void;
  protected abstract _PUT(req: ParsedRequest, ctx: Context): void;
  protected abstract _PATCH(req: ParsedRequest, ctx: Context): void;
  protected abstract _DELETE(req: ParsedRequest, ctx: Context): void;

  protected _checkPermissions(method: string): boolean {
    // This actually checks if the "user" has permissions to the endpoint
    return true;
  }

  protected async _parseRequest(ctx: Context): Promise<ParsedRequest> {
    const params = oakHelpers.getQuery(ctx, { mergeParams: true }),
      paging: PagingParam = {},
      sorting: SortingParam = {};
    //#region Handle param details
    if (params["page"]) {
      paging.page = Number(params["page"]) || undefined;
      delete params["page"];
    }
    if (params["pagesize"]) {
      paging.size = Number(params["pagesize"]) || undefined;
      delete params["pagesize"];
    }
    // Sorting
    if (params["sort"]) {
      const sort = params["sort"].split(",");
      sort.forEach((s) => {
        const [key, value] = s.split(":");
        sorting[key.trim()] = (value.trim().toUpperCase() as "ASC" | "DESC") ||
          "ASC";
      });
      delete params["sort"];
    } else if (params["sortasc"]) {
      const sort = params["sortasc"].split(",");
      sort.forEach((s) => {
        sorting[s] = "ASC";
      });
      delete params["sortasc"];
    } else if (params["sortdesc"]) {
      const sort = params["sortdesc"].split(",");
      sort.forEach((s) => {
        sorting[s] = "DESC";
      });
      delete params["sortdesc"];
    }
    //#endregion Handle param details
    const body = await ctx.request.body();
    let bodyContent: ParsedBody = {
      type: "JSON",
      value: undefined,
    };
    switch (body.type) {
      case "form":
        bodyContent = { type: "FORM", value: await body.value as unknown as {[key: string]: unknown} };
        console.log(bodyContent);
        break;
      // deno-lint-ignore no-case-declarations
      case "form-data":
        const formData = await body.value.read({
            maxFileSize: ctx.app.state.maxFileSize || 10485760,
            outPath: ctx.app.state.uploadPath || undefined,
          }),
          fields: Record<string, unknown> = formData.fields,
          files: Record<string, string> = {};
        if (formData.files) {
          formData.files.forEach((file) => {
            files[file.originalName] = String(file.filename);
            if (!fields[file.name]) {
              fields[file.name] = [];
            }
            fields[file.name].push(file.name);
          });
          fields["_files"] = files;
        }
        bodyContent = { type: "FORM", value: fields };
        // const op = await body.value.read();
        // console.log(op);
        break;
      case "json":
        bodyContent = { type: "JSON", value: await body.value as unknown as {[key: string]: unknown} };
        console.log(bodyContent);
        break;
      case "bytes":
        bodyContent = { type: "BYTES", value: new TextDecoder().decode(await body.value) as unknown as string} ;
        console.log(bodyContent);
        break;
      default:
      case "text":
        bodyContent = { type: "TEXT", value: await body.value as unknown as string };
        console.log(bodyContent);
        break;
    }
    return {
      params: params, 
      paging: paging,
      sorting: sorting,
      body: bodyContent,
    }
    // if (body.type === "form-data") {
    //   const formatData = await body.value.read({
    //     customContentTypes: {
    //       "text/vnd.custom": "txt"
    //     },
    //     outPath: 'path to write file',
    //     maxFileSize: 'max size of file',
    //   });
    // }
  }
}

// const endPoint = new BaseEndpoint({
//   permissions: {
//     GET: true,
//     POST: false,
//     PATCH: false,
//     PUT: false,
//     DELETE: false,
//     HEAD: false,
//   },
// });

import { Application, Router } from "http://deno.land/x/oak@v11.1.0/mod.ts";

const App = new Application(),
  router = new Router();

// router.use("/api", (ctx) => {
//   console.log('In Use')
// });

router.get("/api", (ctx) => {
  console.log("In Get");
  const a = oakHelpers.getQuery(ctx, { mergeParams: true });
  console.log(a);
  if (a["pagesize"]) {
    const ad = Number(a["pagesize"]) || undefined;
    console.log(ad);
  }
  ctx.response.body = "df";
});

router.post("/api", async (ctx) => {
  const { request } = ctx,
    body = await request.body();
  let bodyContent: { type: string; value: unknown } = {
    type: "none",
    value: undefined,
  };
  switch (body.type) {
    case "text":
    case "json":
      console.log(await body.value);
      break;
    // deno-lint-ignore no-case-declarations
    case "form":
      const formDatas = await body.value;
      formDatas.forEach((value, key) => {
        console.log(value, key);
      });
      break;
    // deno-lint-ignore no-case-declarations
    case "form-data":
      const formData = await body.value.read({
          maxFileSize: ctx.app.state.maxFileSize || 10485760,
          outPath: ctx.app.state.uploadPath || undefined,
        }),
        fields: Record<string, unknown> = formData.fields,
        files: Record<string, string> = {};
      if (formData.files) {
        formData.files.forEach((file) => {
          files[file.originalName] = String(file.filename);
          if (!fields[file.name]) {
            fields[file.name] = [];
          }
          fields[file.name].push(file.originalName);
        });
        fields["_files"] = files;
      }
      bodyContent = { type: "FORM-DATA", value: fields };
      console.log(fields, files);
      console.log(bodyContent);
      break;
    case "bytes":
      console.log(new TextDecoder().decode(await body.value));
      break;
  }
});

App.use(router.routes());
// router.all("/v:version/:id?", endPoint.handle.bind(endPoint));
// router.options("/:id?", endPoint.handle);
// App.use((ctx, next) => {
//   console.log('asdf');
//   next();
// })
// App.use(router.routes());
// App.use(router.allowedMethods());

App.listen({ port: 8000 });
