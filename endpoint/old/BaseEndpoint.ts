import { Options } from "../options/mod.ts";
import { Context, oakHelpers, path } from "../dependencies.ts";
import type {
  EndpointOptions,
  FileUploadInfo,
  PagingParam,
  ParsedRequest,
  SortingParam,
} from "./types/mod.ts";
import { EndpointManager } from "./EndpointManager.ts";
import type { HTTPMethods } from "../dependencies.ts";

import {
  MissingNameError,
  MissingRoutePathError,
} from "./Errors.ts";
import { Value } from "https://deno.land/std@0.150.0/encoding/_toml/parser.ts";

export type EndpointEvents = {
  error: (error: Error, ctx: Context) => void;
  handle: (method: HTTPMethods, request: ParsedRequest) => void;
};

export abstract class BaseEndpoint<T extends EndpointOptions = EndpointOptions>
  extends Options<T> {

  constructor(options: Partial<EndpointOptions>) {
    const defOptions: Partial<EndpointOptions> = {
      allowedMethods: {
        GET: true,
        POST: true,
        PUT: true,
        PATCH: true,
        DELETE: true,
        HEAD: true,
      },
    };
    // Check if mandatory options are provided
    if (!options.name) {
      throw new MissingNameError();
    }
    if (!options.routePath) {
      throw new MissingRoutePathError(options.name);
    }
    options.name = options.name.trim().toLowerCase();

    super(options as T, defOptions as Partial<T>);
    // Register the endpoint
    EndpointManager.register(this);
  }

  public get route() {
    // Final route is - routePath + routeGroup + routeName
    return path.join(
      this._getOption("routePath"),
      this._getOption("name"),
      this._buildIdentifiers(), 
      // (this._getOption("routeParams") || "") + "?",
    );
  }

  public get group() {
    return this._getOption("routeGroup");
  }

  public get name() {
    return this._getOption("name");
  }

  public get allowedMethods(): string[] {
    const permissions = this._getOption("allowedMethods");
    return Object.keys(permissions).filter((method) => {
      return permissions[method as keyof typeof permissions] ? method : null;
    });
  }

  public async handle(ctx: Context): Promise<void> {
    const method = ctx.request.method;
    if (method === "GET") {
      await this.GET(ctx);
    } else if (method === "POST") {
      await this.POST(ctx);
    } else if (method === "PUT") {
      await this.PUT(ctx);
    } else if (method === "PATCH") {
      await this.PATCH(ctx);
    } else if (method === "DELETE") {
      await this.DELETE(ctx);
    } else if (method === "HEAD") {
      await this.HEAD(ctx);
    } else if (method === "OPTIONS") {
      await this.OPTIONS(ctx);
    } else {
      ctx.response.status = 405;
      ctx.response.body = { message: `Method ${method} not supported` };
    }
  }

  /**
   * GET
   *
   * Handle GET request.
   *
   * @param ctx Context The Context from OAK
   * @returns void
   */
  public async GET(ctx: Context): Promise<void> {
    this._setDefaultHeaders(ctx);

    // First check if method is even allowed
    if (this.allowedMethods.indexOf("GET") === -1) {
      ctx.response.status = 405;
      ctx.response.body = {
        message: `GET Method not supported by this endpoint`,
      };
      return;
    }
    const req = await this._parseRequest(ctx);
    // Call postBodyParse hook
    // We can handle things like HMAC signature check, User access check etc
    this._postBodyParse(req, ctx);
    // Call the actual handler
    await this._GET(req, ctx);
    // Call post response hook
    this._postHandle(ctx);
    // All done
  }

  /**
   * POST
   *
   * Handles POST request.
   *
   * @param ctx Context The Context from OAK
   * @returns void
   */
  public async POST(ctx: Context): Promise<void> {
    this._setDefaultHeaders(ctx);

    if (this.allowedMethods.indexOf("POST") === -1) {
      ctx.response.status = 405;
      ctx.response.body = {
        message: `This endpoint does not support the POST method`,
      };
      return;
    }
    const req = await this._parseRequest(ctx);
    // Call postBodyParse hook
    // We can handle things like HMAC signature check, User access check etc
    this._postBodyParse(req, ctx);
    await this._POST(req, ctx);
    // Call post response hook
    this._postHandle(ctx);
  }

  /**
   * PUT
   *
   * Handles PUT request.
   *
   * @param ctx Context The Context from OAK
   * @returns void
   */
  public async PUT(ctx: Context): Promise<void> {
    this._setDefaultHeaders(ctx);

    if (this.allowedMethods.indexOf("PUT") === -1) {
      ctx.response.status = 405;
      ctx.response.body = {
        message: `This endpoint does not support the PUT method`,
      };
      return;
    }
    const req = await this._parseRequest(ctx);
    // Call postBodyParse hook
    // We can handle things like HMAC signature check, User access check etc
    this._postBodyParse(req, ctx);
    await this._PUT(req, ctx);
    // Call post response hook
    this._postHandle(ctx);
  }

  /**
   * PATCH
   *
   * Handles PATCH request.
   *
   * @param ctx Context The Context from OAK
   * @returns void
   */
  public async PATCH(ctx: Context): Promise<void> {
    this._setDefaultHeaders(ctx);

    if (this.allowedMethods.indexOf("PATCH") === -1) {
      ctx.response.status = 405;
      ctx.response.body = {
        message: `This endpoint does not support the PATCH method`,
      };
      return;
    }
    const req = await this._parseRequest(ctx);
    // Call postBodyParse hook
    // We can handle things like HMAC signature check, User access check etc
    this._postBodyParse(req, ctx);
    await this._PATCH(req, ctx);
    // Call post response hook
    this._postHandle(ctx);
  }

  /**
   * DELETE
   *
   * Handles DELETE request.
   *
   * @param ctx Context The Context from OAK
   * @returns void
   */
  public async DELETE(ctx: Context): Promise<void> {
    this._setDefaultHeaders(ctx);

    if (this.allowedMethods.indexOf("DELETE") === -1) {
      ctx.response.status = 405;
      ctx.response.body = {
        message: `This endpoint does not support the DELETE method`,
      };
      return;
    }
    const req = await this._parseRequest(ctx);
    // Call postBodyParse hook
    // We can handle things like HMAC signature check, User access check etc
    this._postBodyParse(req, ctx);
    await this._DELETE(req, ctx);
    // Call post response hook
    this._postHandle(ctx);
  }

  /**
   * HEAD
   *
   * Handles HEAD request.
   *
   * @param ctx Context The Context from OAK
   * @returns void
   */
  public async HEAD(ctx: Context): Promise<void> {
    this._setDefaultHeaders(ctx);

    if (this.allowedMethods.indexOf("HEAD") === -1) {
      ctx.response.status = 405;
      ctx.response.body = {
        message: `This endpoint does not support the HEAD method`,
      };
      return;
    }
    const req = await this._parseRequest(ctx);
    // Call postBodyParse hook
    // We can handle things like HMAC signature check, User access check etc
    this._postBodyParse(req, ctx);
    await this._GET(req, ctx);
    ctx.response.body = null;
    // Call post response hook
    this._postHandle(ctx);
  }

  /**
   * OPTIONS
   *
   * Handles OPTIONS request.
   *
   * @param ctx Context The Context from OAK
   * @returns void
   */
  public async OPTIONS(ctx: Context): Promise<void> {
    this._setDefaultHeaders(ctx);
    // Options are alwats allowed
    ctx.response.headers.set("Allow", this.allowedMethods.join(", "));
    ctx.response.status = 200;

    // Process the request
    const req = await this._parseRequest(ctx, false); // Do not parse body for options
  }

  // Protected methods
  /**
   * _setDefaultHeaders
   *
   * Set default headers in the response
   *
   * @protected
   * @param ctx Context Set default headers
   */
  protected _setDefaultHeaders(ctx: Context): void {
    ctx.response.headers.set("X-ROUTE-NAME", this.name);
    ctx.response.headers.set("X-ROUTE-GROUP", this.group);
    ctx.response.headers.set("X-ROUTE-PATH", this.route);
    ctx.response.headers.set("Allow", this.allowedMethods.join(", "));
  }

  /**
   * _parseRequest
   *
   * Parse the request information and split any URL search params into:
   * Params - Regular filter params
   * Paging - Paging Options
   * Sorting - Sorting Options
   * Payload - The body information as a Record<string, unknown> or Array<Record<string, unknown>>
   * Files - Any files uploaded as Record<string, string> - Key is the actual file name, value is the uploaded file name (with path)
   *
   * @protected
   * @param ctx Context The context passed by OAK
   * @param parseBody Boolean Should the body be parsed
   * @returns ParsedRequest The parsed request
   */
  protected async _parseRequest(
    ctx: Context,
    parseBody = true,
  ): Promise<ParsedRequest> {

    const params = oakHelpers.getQuery(ctx, { mergeParams: true }),
      body = await ctx.request.body(),
      paging: PagingParam = {},
      sorting: SortingParam = {};
    let payload:
      | Record<string, unknown>
      | Array<Record<string, unknown>>
      | undefined = undefined;
    let files: { [key: string]: Array<FileUploadInfo> } | undefined = undefined;
    
    //#region Split paging and sorting params
    if (params["page"]) {
      paging.page = Number(params["page"]) || undefined;
      delete params["page"];
    }
    if (params["pagesize"]) {
      paging.size = Number(params["pagesize"]) || undefined;
      delete params["pagesize"];
    }
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
    //#endregion Split paging and sorting params
    
    //#region Parse Body
    // Ok lets parse it
    if (parseBody) {
      if (body.type === "bytes") {
        payload = {
          data: new TextDecoder().decode(await body.value),
        };
      } else if (body.type === "text") {
        payload = {
          data: await body.value,
        };
      } else if (body.type === "json") {
        payload = await body.value;
      } else if (body.type === "form") {
        payload = {};
        const formData = await body.value;
        for (const [key, value] of formData.entries()) {
          payload[key] = value;
        }
      } else if (body.type === "form-data") {
        // Ok this gets a little complicated as there will be both fields and files
        // @TODO - Figure out a better way to do this?
        const formData = await body.value.read({
          maxFileSize: ctx.app.state.maxFileSize || 10485760, // default of 10MiB
          outPath: ctx.app.state.uploadPath || undefined, // default of undefined
        });
        payload = formData.fields;
        // Add files
        if (formData.files) {
          const uploadedFiles: Record<string, Array<FileUploadInfo>> = {};
          formData.files.forEach((file) => {
            const fileDetails: FileUploadInfo = {
              path: String(file.filename),
              originalName: file.originalName,
            };
            if (!uploadedFiles[file.name]) {
              uploadedFiles[file.name] = [];
            }
            uploadedFiles[file.name].push(fileDetails);
          });
          files = uploadedFiles;
        }
      }
    }
    //#endregion Parse Body

    return {
      method: ctx.request.method,
      params: params,
      paging: paging,
      sorting: sorting,
      payload: payload,
      files: files,
    };
  }

  /**
   * _postBodyParse
   *
   * This hook is called just after the body is parsed. It can be overridden to do any additional processing either the
   * params or the body. This is called before the request is passed to the specific handler.
   * A good example would be parsing HMAC signature of the body for authentication
   *
   * @protected
   * @param req ParsedRequest The parsed request
   * @param ctx Context The context passed by OAK
   * @returns void
   */
  protected _postBodyParse(req: ParsedRequest, ctx: Context): void {
    // Do nothing by default
    return;
  }

  /**
   * _postHandle
   *
   * This hook is called once the request has been handled. The response and response body is available. 
   * This is useful when trying to handle HMAC signatures for response body.
   *
   * @protected
   * @param ctx Context The context passed by OAK
   * @returns void
   */
  protected _postHandle(ctx: Context): void {
    // Do nothing by default
    return;
  }

  protected _buildIdentifiers(): string {
    if(this._hasOption('routeIdentifiers')) {
      // return ':' + this._getOption('routeIdentifiers').join(',:') + '?';
      return ':' + this._getOption('routeIdentifiers').join('\\::') + '?';
    } else {
      return '';
    }
  }

  //#region Begin abstract functions

  /**
   * _GET
   *
   * The actual handler for GET requests
   *
   * @protected
   * @abstract
   * @param req ParsedRequest The parsed request
   * @param ctx Context The context passed by OAK
   */
  protected abstract _GET(req: ParsedRequest, ctx: Context): void;

  /**
   * _POST
   *
   * The actual handler for POST requests
   *
   * @protected
   * @abstract
   * @param req ParsedRequest The parsed request
   * @param ctx Context The context passed by OAK
   */
  protected abstract _POST(req: ParsedRequest, ctx: Context): void;

  /**
   * _PUT
   *
   * The actual handler for PUT requests
   *
   * @protected
   * @abstract
   * @param req ParsedRequest The parsed request
   * @param ctx Context The context passed by OAK
   */
  protected abstract _PUT(req: ParsedRequest, ctx: Context): void;

  /**
   * _PATCH
   *
   * The actual handler for PATCH requests
   *
   * @protected
   * @abstract
   * @param req ParsedRequest The parsed request
   * @param ctx Context The context passed by OAK
   */
  protected abstract _PATCH(req: ParsedRequest, ctx: Context): void;

  /**
   * _DELETE
   *
   * The actual handler for DELETE requests
   *
   * @protected
   * @abstract
   * @param req ParsedRequest The parsed request
   * @param ctx Context The context passed by OAK
   */
  protected abstract _DELETE(req: ParsedRequest, ctx: Context): void;
  //#endregion End abstract functions

  // public async handle2(ctx: Context) {
  //   const { request, response } = ctx;
  //   /* Setup basic response headers */
  //   // response.headers.append("X-ROUTE-NAME", this.name);
  //   // response.headers.append("X-ROUTE-GROUP", this.group);
  //   // response.headers.append("X-ROUTE-PATH", this.route);
  //   // response.headers.append("X-ALLOWED-METHODS", this.allowedMethods.join(","));
  //   response.headers.set("Allow", this.allowedMethods.join(", "));
  //   // Check if the method is allowed
  //   if (!this.allowedMethods.includes(request.method)) {
  //     response.status = 405;
  //     response.body = {
  //       error: `Method ${request.method} not allowed in this route`,
  //     };
  //     return;
  //   }
  //   if (request.method === "OPTIONS") {
  //     response.status = 204;
  //   } else {
  //     const req = await this._parseRequest(ctx);
  //     if (request.method === "HEAD" || request.method === "GET") {
  //       response.status = 200;
  //       await this._GET(req, ctx);
  //       if (request.method === "HEAD") {
  //         // Remove the body
  //         response.body = null;
  //       }
  //     } else if (request.method === "POST") {
  //       response.status = 201;
  //       await this._POST(req, ctx);
  //     } else if (request.method === "PUT") {
  //       response.status = 200;
  //       await this._PUT(req, ctx);
  //     } else if (request.method === "PATCH") {
  //       response.status = 200;
  //       await this._PATCH(req, ctx);
  //     } else if (request.method === "DELETE") {
  //       response.status = 204;
  //       await this._DELETE(req, ctx);
  //     }
  //   }
  // }

  // protected async _parseRequest2(ctx: Context): Promise<ParsedRequest> {
  //   const params = oakHelpers.getQuery(ctx, { mergeParams: true }),
  //     paging: PagingParam = {},
  //     sorting: SortingParam = {};
  //   //#region Handle param details
  //   if (params["page"]) {
  //     paging.page = Number(params["page"]) || undefined;
  //     delete params["page"];
  //   }
  //   if (params["pagesize"]) {
  //     paging.size = Number(params["pagesize"]) || undefined;
  //     delete params["pagesize"];
  //   }
  //   // Sorting
  //   if (params["sort"]) {
  //     const sort = params["sort"].split(",");
  //     sort.forEach((s) => {
  //       const [key, value] = s.split(":");
  //       sorting[key.trim()] = (value.trim().toUpperCase() as "ASC" | "DESC") ||
  //         "ASC";
  //     });
  //     delete params["sort"];
  //   } else if (params["sortasc"]) {
  //     const sort = params["sortasc"].split(",");
  //     sort.forEach((s) => {
  //       sorting[s] = "ASC";
  //     });
  //     delete params["sortasc"];
  //   } else if (params["sortdesc"]) {
  //     const sort = params["sortdesc"].split(",");
  //     sort.forEach((s) => {
  //       sorting[s] = "DESC";
  //     });
  //     delete params["sortdesc"];
  //   }
  //   //#endregion Handle param details
  //   const body = await ctx.request.body();
  //   let bodyContent: ParsedBody = {
  //     type: "JSON",
  //     value: undefined,
  //   };
  //   switch (body.type) {
  //     case "form":
  //       bodyContent = { type: "FORM", value: await body.value as unknown as {[key: string]: unknown} };
  //       console.log(bodyContent);
  //       break;
  //     // deno-lint-ignore no-case-declarations
  //     case "form-data":
  //       const formData = await body.value.read({
  //           maxFileSize: ctx.app.state.maxFileSize || 10485760,
  //           outPath: ctx.app.state.uploadPath || undefined,
  //         }),
  //         fields: Record<string, unknown> = formData.fields,
  //         files: Record<string, string> = {};
  //       if (formData.files) {
  //         formData.files.forEach((file) => {
  //           files[file.originalName] = String(file.filename);
  //           if (!fields[file.name]) {
  //             fields[file.name] = [];
  //           }
  //           fields[file.name].push(file.name);
  //         });
  //         fields["_files"] = files;
  //       }
  //       bodyContent = { type: "FORM", value: fields };
  //       // const op = await body.value.read();
  //       // console.log(op);
  //       break;
  //     case "json":
  //       bodyContent = { type: "JSON", value: await body.value as unknown as {[key: string]: unknown} };
  //       console.log(bodyContent);
  //       break;
  //     case "bytes":
  //       bodyContent = { type: "BYTES", value: new TextDecoder().decode(await body.value) as unknown as string} ;
  //       console.log(bodyContent);
  //       break;
  //     default:
  //     case "text":
  //       bodyContent = { type: "TEXT", value: await body.value as unknown as string };
  //       console.log(bodyContent);
  //       break;
  //   }
  //   return {
  //     params: params,
  //     paging: paging,
  //     sorting: sorting,
  //     body: bodyContent,
  //   }
  //   // if (body.type === "form-data") {
  //   //   const formatData = await body.value.read({
  //   //     customContentTypes: {
  //   //       "text/vnd.custom": "txt"
  //   //     },
  //   //     outPath: 'path to write file',
  //   //     maxFileSize: 'max size of file',
  //   //   });
  //   // }
  // }
}
