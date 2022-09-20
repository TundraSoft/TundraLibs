import { Options } from "../options/mod.ts";
import {
  Context,
  oakHelpers,
  path,
  RouterMiddleware,
  Status,
} from "../dependencies.ts";

import type {
  EndpointOptions,
  FileUploadInfo,
  HTTPResponse,
  PagingParam,
  ParsedRequest,
  SortingParam,
} from "./types/mod.ts";
import { EndpointManager } from "./EndpointManager.ts";
// import type { HTTPMethods } from "../dependencies.ts";
import { MissingNameError, MissingRoutePathError } from "./Errors.ts";

/**
 * This is the base endpoint, acts like a base template
 */
export abstract class BaseEndpoint<T extends EndpointOptions = EndpointOptions>
  extends Options<T> {
  constructor(options: Partial<EndpointOptions>) {
    const defOptions: Partial<EndpointOptions> = {
      stateParams: true,
      allowedMethods: {
        GET: true,
        POST: true,
        PUT: true,
        PATCH: true,
        DELETE: true,
        HEAD: true,
      },
      pageLimit: 10,
      totalRowHeaderName: "X-Total-Rows",
      paginationPageHeaderName: "X-Pagination-Page",
      paginationLimitHeaderName: "X-Pagination-Limit",
      notFoundMessage: `Requested resource could not be found`,
      notSupportedMessage: `Method not supported by this endpoint`,
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

  /**
   * handle
   *
   * Helper function which handles all request verbs and calls the appropriate handler
   *
   * @param ctx Context The Context from OAK
   * @returns void
   */
  public handle<R extends string>(): RouterMiddleware<R> {
    return async (ctx: Context) => {
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
    };
  }

  //#region Handle Methods
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
        message: this._getOption("notSupportedMessage"),
      };
      return;
    }
    const req = await this._parseRequest(ctx);
    // Call postBodyParse hook
    // We can handle things like HMAC signature check, User access check etc
    this._postBodyParse(req, ctx);
    // Call the actual handler
    const op = await this._fetch(req);

    ctx.response.status = op.status;
    // If there is identifier, then we are fetching a single record
    if (this._hasIdentifier(req)) {
      // If no rows throw 404
      if (!op.payload || op.totalRows === 0) {
        ctx.response.status = 404;
        ctx.response.body = { message: this._getOption("notFoundMessage") };
        // Return as we do not want to set other info
        return;
      } else {
        ctx.response.body = (Array.isArray(op.payload) ? op.payload[0] : op.payload);
      }
    } else {
      ctx.response.body = op.payload;
    }
    // Set pagination headers
    ctx.response.headers.set(
      this._getOption("totalRowHeaderName"),
      op.totalRows.toString(),
    );
    if (op.pagination) {
      ctx.response.headers.set(
        this._getOption("paginationPageHeaderName"),
        op.pagination.page.toString(),
      );
      ctx.response.headers.set(
        this._getOption("paginationLimitHeaderName"),
        op.pagination.limit.toString(),
      );
    }

    if (op.headers) {
      op.headers.forEach(([key, value]) => {
        ctx.response.headers.set(key, value);
      });
    }

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
        message: this._getOption("notSupportedMessage"),
      };
      return;
    }

    const req = await this._parseRequest(ctx);
    if (
      (req.payload === undefined || Object.keys(req.payload).length === 0) &&
      (req.files === undefined || Object.keys(req.files).length === 0)
    ) {
      ctx.response.status = Status.BadRequest;
      ctx.response.body = { message: `Missing/No POST body` };
      return;
    }

    if (this._hasIdentifier(req)) {
      ctx.response.status = 405;
      ctx.response.body = {
        message: this._getOption("notSupportedMessage"),
      };
      return;
    }

    // Call postBodyParse hook
    // We can handle things like HMAC signature check, User access check etc
    this._postBodyParse(req, ctx);
    // Check if it is a single record or multiple records
    let single = false;
    if (!Array.isArray(req.payload)) {
      single = true;
    }
    const op = await this._insert(req);
    ctx.response.status = op.status;
    if (op.payload) {
      if (single) {
        ctx.response.body = (Array.isArray(op.payload) ? op.payload[0] : op.payload);
      } else {
        ctx.response.body = op.payload;
      }
    }
    ctx.response.headers.set("X-Total-Rows", op.totalRows.toString());

    if (op.headers) {
      op.headers.forEach(([key, value]) => {
        ctx.response.headers.set(key, value);
      });
    }
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
        message: this._getOption("notSupportedMessage"),
      };
      return;
    }
    const req = await this._parseRequest(ctx);
    if (
      (req.payload === undefined || Object.keys(req.payload).length === 0) &&
      (req.files === undefined || Object.keys(req.files).length === 0)
    ) {
      ctx.response.status = Status.BadRequest;
      ctx.response.body = { message: `Missing/No PUT body` };
      return;
    }
    // Call postBodyParse hook
    // We can handle things like HMAC signature check, User access check etc
    this._postBodyParse(req, ctx);
    // TODO - Handle array of objects

    const op = await this._update(req);

    ctx.response.status = op.status;
    if (this._hasIdentifier(req)) {
      // If no rows throw 404
      if (!op.payload || op.totalRows === 0) {
        ctx.response.status = 404;
        ctx.response.body = { message: this._getOption("notFoundMessage") };
        // Return as we do not want to set other info
        return;
      } else {
        ctx.response.body = (Array.isArray(op.payload) ? op.payload[0] : op.payload);
      }
    } else {
      ctx.response.body = op.payload;
    }
    ctx.response.headers.set(
      this._getOption("totalRowHeaderName"),
      op.totalRows.toString(),
    );

    if (op.headers) {
      op.headers.forEach(([key, value]) => {
        ctx.response.headers.set(key, value);
      });
    }
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
        message: this._getOption("notSupportedMessage"),
      };
      return;
    }
    const req = await this._parseRequest(ctx);
    if (
      (req.payload === undefined || Object.keys(req.payload).length === 0) &&
      (req.files === undefined || Object.keys(req.files).length === 0)
    ) {
      ctx.response.status = Status.BadRequest;
      ctx.response.body = { message: `Missing/No PATCH body` };
      return;
    }
    // Call postBodyParse hook
    // We can handle things like HMAC signature check, User access check etc
    this._postBodyParse(req, ctx);
    // TODO - Handle array of objects

    const op = await this._update(req);
    ctx.response.status = op.status;
    // If there is identifier, then we are fetching a single record
    if (this._hasIdentifier(req)) {
      // If no rows throw 404
      if (!op.payload || op.totalRows === 0) {
        ctx.response.status = 404;
        ctx.response.body = { message: this._getOption("notFoundMessage") };
        // Return as we do not want to set other info
        return;
      } else {
        ctx.response.body = (Array.isArray(op.payload) ? op.payload[0] : op.payload);
      }
    } else {
      ctx.response.body = op.payload;
    }
    ctx.response.headers.set(
      this._getOption("totalRowHeaderName"),
      op.totalRows.toString(),
    );

    if (op.headers) {
      op.headers.forEach(([key, value]) => {
        ctx.response.headers.set(key, value);
      });
    }
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
        message: this._getOption("notSupportedMessage"),
      };
      return;
    }
    const req = await this._parseRequest(ctx);
    // Call postBodyParse hook
    // We can handle things like HMAC signature check, User access check etc
    this._postBodyParse(req, ctx);
    const op = await this._delete(req);
    ctx.response.status = op.status;

    // If there is identifier, then we are fetching a single record
    if (this._hasIdentifier(req)) {
      // If no rows throw 404
      if (!op.payload || op.payload.length === 0) {
        ctx.response.status = 404;
        ctx.response.body = { message: this._getOption("notFoundMessage") };
        // Return as we do not want to set other info
        return;
      } else {
        ctx.response.body = (Array.isArray(op.payload) ? op.payload[0] : op.payload);
      }
    } else {
      ctx.response.body = op.payload;
    }
    ctx.response.headers.set(
      this._getOption("totalRowHeaderName"),
      op.totalRows.toString(),
    );

    // There is no body in DELETE response
    // ctx.response.body = op.body;
    if (op.headers) {
      op.headers.forEach(([key, value]) => {
        ctx.response.headers.set(key, value);
      });
    }
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
        message: `HEAD method not supported by this endpoint`,
      };
      return;
    }

    const req = await this._parseRequest(ctx);
    // Call postBodyParse hook
    // We can handle things like HMAC signature check, User access check etc
    this._postBodyParse(req, ctx);
    const op = await this._count(req);
    ctx.response.status = Status.OK;
    ctx.response.headers.set(this._getOption("totalRowHeaderName"), op.toString());
    // if (op.headers) {
    //   op.headers.forEach(([key, value]) => {
    //     ctx.response.headers.set(key, value);
    //   });
    // }
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
    // Await injected here to prevent error
    ctx.response.status = await 200;
  }

  //#endregion Handle Methods

  // Protected methods

  //#region Begin Protected Methods

  //#region Implementation methods

  /**
   * _fetch
   *
   * Perform a "fetch" operation. Return an array of entities which are to be returned basis parameters
   * (filters) provided.
   *
   * @param request ParsedRequest The parsed request object
   * @returns Promise<HTTPResponse<T>> The response object
   */
  protected abstract _fetch(request: ParsedRequest): Promise<HTTPResponse>;

  /**
   * _insert
   *
   * Perform an "insert" operation. Return the entity which was inserted.
   *
   * @param request ParsedRequest The parsed request object
   * @returns Promise<HTTPResponse<T>> The response object
   */
  protected abstract _insert(request: ParsedRequest): Promise<HTTPResponse>;

  /**
   * _update
   *
   * Perform an "update" operation. Return an array of entities which are to be returned basis parameters
   * (filters) provided.
   *
   * @param request ParsedRequest The parsed request object
   * @returns Promise<HTTPResponse<T>> The response object
   */
  protected abstract _update(request: ParsedRequest): Promise<HTTPResponse>;

  /**
   * _delete
   *
   * Perform a "Delete" operation. This should ideally return just the status code along with any headers.
   *
   * @param request ParsedRequest The parsed request object
   * @returns Promise<HTTPResponse<T>> The response object
   */
  protected abstract _delete(request: ParsedRequest): Promise<HTTPResponse>;

  protected abstract _count(request: ParsedRequest): Promise<number>;

  //#endregion Implementation methods

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
  ): Promise<ParsedRequest> {
    const params = oakHelpers.getQuery(ctx, { mergeParams: true }),
      paging: PagingParam = {},
      sorting: SortingParam = {},
      contentLength: number = ctx.request.headers.get("content-length")
        ? parseInt(ctx.request.headers.get("content-length") as string)
        : 0;
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
      paging.limit = Number(params["pagesize"]) || undefined;
      delete params["pagesize"];
    }
    if (params["sort"] && params["sort"].length > 0) {
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
    //#region Inject state params
    if (ctx.state.params) {
      Object.assign(params, ctx.state.params);
    }
    // Handle Null value of Identifier and state params
    Object.keys(params).forEach((key) => {
      if (params[key] === null || params[key] === undefined) {
        delete params[key];
      }
    });
    //#endregion Inject state params

    //#region Parse Body
    // TODO - Check if body exists in http 2.0
    if (ctx.request.hasBody === true && contentLength > 0) {
      const body = await ctx.request.body();
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
  // deno-lint-ignore no-unused-vars
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
  // deno-lint-ignore no-unused-vars
  protected _postHandle(ctx: Context): void {
    // Do nothing by default
    return;
  }

  /**
   * _buildIdentifiers
   *
   * Builds the identifiers for the route. Identifiers are the "Primary Keys" identifying a specific
   * record in the entity. This is used to build the URL for the route.
   *
   * @returns string The identifiers for the route
   */
  protected _buildIdentifiers(): string {
    const routeIdentifiers = this._getOption("routeIdentifiers");
    if (routeIdentifiers && routeIdentifiers.length > 0) {
      // return ':' + this._getOption('routeIdentifiers').join(',:') + '?';
      return ":" + this._getOption("routeIdentifiers").join("\\::") + "?";
    } else {
      return "";
    }
  }

  /**
   * _hasIdentifier
   *
   * Checks if the Identifier is present in the request.
   *
   * @param req ParsedRequest The parsed request
   * @returns boolean True if Identifier is present in the request
   */
  protected _hasIdentifier(req: ParsedRequest): boolean {
    if (this._hasOption("routeIdentifiers")) {
      return this._getOption("routeIdentifiers").every((identifier) => {
        return req.params[identifier] !== undefined;
      });
    } else {
      return false;
    }
  }
  //#endregion End Protected Methods
}
