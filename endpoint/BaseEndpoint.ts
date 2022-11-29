import { Options } from '../options/mod.ts';
import {
  Context,
  oakHelpers,
  path,
  RouterMiddleware,
  Status,
} from '../dependencies.ts';

import type { HTTPMethods } from '../dependencies.ts';

import type {
  EndpointOptions,
  FileUploadInfo,
  // HTTPResponse,
  PagingParam,
  ParsedRequest,
  SortingParam,
} from './types/mod.ts';

// import { EndpointManager } from './EndpointManager.ts';

// import type { HTTPMethods } from "../dependencies.ts";
import { MissingNameError, MissingRoutePathError } from './Errors.ts';
import {
  badRequest,
  methodNotAllowed,
  resourceNotFound,
} from './HTTPErrors.ts';
// import { EndpointHooks } from "./types/EndpointOptions.ts";

export class BaseEndpoint<
  O extends EndpointOptions = EndpointOptions,
  T extends Record<string, unknown> = Record<string, unknown>,
> extends Options<O> {
  protected _allowedMethods: Array<HTTPMethods> = [];

  constructor(options: Partial<EndpointOptions>) {
    const defOptions: Partial<EndpointOptions> = {
      stateParams: true,
      getHandler: undefined,
      postHandler: undefined,
      putHandler: undefined,
      patchHandler: undefined,
      deleteHandler: undefined,
      headHandler: undefined,
      postBodyParse: undefined,
      preResponseHandler: undefined,
      authHandler: undefined,
      headers: {
        totalRows: 'X-Total-Rows',
        paginationLimit: 'X-Pagination-Limit',
        paginationPage: 'X-Pagination-Page',
      },
      notFoundMessage: `Requested resource could not be found`,
      notSupportedMessage: `Method not supported by this endpoint`,
    };

    if (!options.name) {
      throw new MissingNameError();
    }

    if (!options.routePath) {
      throw new MissingRoutePathError(options.name);
    }

    options.name = options.name.trim().toLowerCase();

    super(options as O, defOptions as Partial<O>);
    // Check handlers which are present
    if (
      this._getOption('getHandler') !== undefined &&
      this._getOption('getHandler') instanceof Function
    ) {
      this._allowedMethods.push('GET');
    }
    if (
      this._getOption('postHandler') !== undefined &&
      this._getOption('postHandler') instanceof Function
    ) {
      this._allowedMethods.push('POST');
    }
    if (
      this._getOption('putHandler') !== undefined &&
      this._getOption('putHandler') instanceof Function
    ) {
      this._allowedMethods.push('PUT');
    }
    if (
      this._getOption('patchHandler') !== undefined &&
      this._getOption('patchHandler') instanceof Function
    ) {
      this._allowedMethods.push('PATCH');
    }
    if (
      this._getOption('deleteHandler') !== undefined &&
      this._getOption('deleteHandler') instanceof Function
    ) {
      this._allowedMethods.push('DELETE');
    }
    if (
      this._getOption('headHandler') !== undefined &&
      this._getOption('headHandler') instanceof Function
    ) {
      this._allowedMethods.push('HEAD');
    }
    this._allowedMethods.push('OPTIONS');
    // Register the endpoint
    // EndpointManager.register(this);
  }

  public get route(): string {
    return path.posix.join(
      this._getOption('routePath'),
      this._getOption('name'),
      this._buildIdentifiers(),
      // (this._getOption("routeParams") || "") + "?",
    );
  }

  public get group() {
    return this._getOption('routeGroup');
  }

  public get name() {
    return this._getOption('name');
  }

  public get allowedMethods(): string[] {
    return this._allowedMethods;
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
      if (method === 'GET') {
        await this.GET(ctx);
      } else if (method === 'POST') {
        await this.POST(ctx);
      } else if (method === 'PUT') {
        await this.PUT(ctx);
      } else if (method === 'PATCH') {
        await this.PATCH(ctx);
      } else if (method === 'DELETE') {
        await this.DELETE(ctx);
      } else if (method === 'HEAD') {
        await this.HEAD(ctx);
      } else if (method === 'OPTIONS') {
        await this.OPTIONS(ctx);
      } else {
        throw methodNotAllowed(this._getOption('notSupportedMessage'));
      }
    };
  }

  //#region HTTP Base Handlers

  /**
   * GET
   *
   * Handle GET request.
   *
   * @param ctx Context The Context from OAK
   * @returns void
   */
  public async GET(ctx: Context): Promise<void> {
    const handler = this._getOption('getHandler'),
      postHandle = this._getOption('preResponseHandler');

    this._setDefaultHeaders(ctx);

    // First check if method is even allowed
    if (
      this._allowedMethods.includes('GET') === false || handler === undefined
    ) {
      // ctx.response.status = 405;
      // ctx.response.body = {
      //   message: this._getOption("notSupportedMessage"),
      // };
      // return;
      throw methodNotAllowed(
        this._getOption('notSupportedMessage'),
        ctx.response.headers,
      );
    } else {
      const req = await this._parseRequest(ctx);
      // Call postBodyParse hook
      // We can handle things like HMAC signature check, User access check etc
      // await this._postBodyParse(req, ctx);

      // Call the actual handler
      const op = await handler.apply(this, [req]);

      ctx.response.status = op.status;
      // If there is identifier, then we are fetching a single record
      if (this._hasIdentifier(req)) {
        // If no rows throw 404
        if (!op.payload || op.totalRows === 0) {
          // ctx.response.status = 404;
          // ctx.response.body = { message: this._getOption("notFoundMessage") };
          // // Return as we do not want to set other info
          // return;
          throw resourceNotFound(
            this._getOption('notFoundMessage'),
            ctx.response.headers,
          );
        } else {
          ctx.response.body = Array.isArray(op.payload)
            ? op.payload[0]
            : op.payload;
        }
      } else {
        ctx.response.body = op.payload;
      }
      // Set pagination headers
      const headerNames = this._getOption('headers');
      ctx.response.headers.set(
        headerNames.totalRows as string,
        op.totalRows.toString(),
      );

      if (op.pagination && op.pagination.limit) {
        ctx.response.headers.set(
          headerNames.paginationPage as string,
          op.pagination.page.toString(),
        );
        ctx.response.headers.set(
          headerNames.paginationLimit as string,
          op.pagination.limit.toString(),
        );
      }

      if (op.headers) {
        op.headers.forEach(([key, value]) => {
          ctx.response.headers.set(key, value);
        });
      }

      // Call post response hook
      if (postHandle !== undefined) {
        await postHandle.apply(this, [ctx]);
      }
    }
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
    const handler = this._getOption('postHandler'),
      postHandle = this._getOption('preResponseHandler');

    this._setDefaultHeaders(ctx);

    // First check if method is even allowed
    if (
      this._allowedMethods.includes('POST') === false || handler === undefined
    ) {
      // ctx.response.status = 405;
      // ctx.response.body = {
      //   message: this._getOption("notSupportedMessage"),
      // };
      // return;
      throw methodNotAllowed(
        this._getOption('notSupportedMessage'),
        ctx.response.headers,
      );
    } else {
      const req = await this._parseRequest(ctx);
      if (
        (req.payload === undefined || Object.keys(req.payload).length === 0) &&
        (req.files === undefined || Object.keys(req.files).length === 0)
      ) {
        // ctx.response.status = Status.BadRequest;
        // ctx.response.body = { message: `Missing/No POST body` };
        // return;
        throw badRequest(`Missing/No POST body`, ctx.response.headers);
      }

      if (this._hasIdentifier(req)) {
        // ctx.response.status = 405;
        // ctx.response.body = {
        //   message: this._getOption("notSupportedMessage"),
        // };
        // return;
        throw resourceNotFound(
          this._getOption('notFoundMessage'),
          ctx.response.headers,
        );
      }

      // Call postBodyParse hook
      // We can handle things like HMAC signature check, User access check etc
      // await this._postBodyParse(req, ctx);
      // Check if it is a single record or multiple records
      let single = false;
      if (req.payload && !Array.isArray(req.payload)) {
        single = true;
        req.payload = [req.payload];
      }
      // Inject state params
      const injectedPayload: Array<Record<string, unknown>> = [];
      req.payload?.forEach((payload) => {
        injectedPayload.push({ ...ctx.state.params || {}, ...payload });
      });
      req.payload = injectedPayload;

      const op = await handler.apply(this, [req]);

      ctx.response.status = op.status;
      if (op.payload) {
        if (single) {
          ctx.response.body = Array.isArray(op.payload)
            ? op.payload[0]
            : op.payload;
        } else {
          ctx.response.body = op.payload;
        }
      }

      const headerNames = this._getOption('headers');
      ctx.response.headers.set(
        headerNames.totalRows as string,
        op.totalRows.toString(),
      );

      if (op.headers) {
        op.headers.forEach(([key, value]) => {
          ctx.response.headers.set(key, value);
        });
      }

      // Call post response hook
      if (postHandle !== undefined) {
        await postHandle.apply(this, [ctx]);
      }
    }
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
    const handler = this._getOption('putHandler'),
      postHandle = this._getOption('preResponseHandler');

    this._setDefaultHeaders(ctx);

    // First check if method is even allowed
    if (
      this._allowedMethods.includes('PUT') === false || handler === undefined
    ) {
      // ctx.response.status = 405;
      // ctx.response.body = {
      //   message: this._getOption("notSupportedMessage"),
      // };
      // return;
      throw methodNotAllowed(
        this._getOption('notSupportedMessage'),
        ctx.response.headers,
      );
    } else {
      const req = await this._parseRequest(ctx);
      if (
        (req.payload === undefined || Object.keys(req.payload).length === 0) &&
        (req.files === undefined || Object.keys(req.files).length === 0)
      ) {
        // ctx.response.status = Status.BadRequest;
        // ctx.response.body = { message: `Missing/No PUT body` };
        // return;
        throw badRequest(`Missing/No PUT body`, ctx.response.headers);
      }
      // Call postBodyParse hook
      // We can handle things like HMAC signature check, User access check etc
      // await this._postBodyParse(req, ctx);
      // TODO(@abhinav) - Handle array of objects

      const op = await handler.apply(this, [req]);

      ctx.response.status = op.status;
      if (this._hasIdentifier(req)) {
        // If no rows throw 404
        if (!op.payload || op.totalRows === 0) {
          // ctx.response.status = 404;
          // ctx.response.body = { message: this._getOption("notFoundMessage") };
          // // Return as we do not want to set other info
          // return;
          throw resourceNotFound(
            this._getOption('notFoundMessage'),
            ctx.response.headers,
          );
        } else {
          ctx.response.body = Array.isArray(op.payload)
            ? op.payload[0]
            : op.payload;
        }
      } else {
        ctx.response.body = op.payload;
      }

      const headerNames = this._getOption('headers');
      ctx.response.headers.set(
        headerNames.totalRows as string,
        op.totalRows.toString(),
      );

      if (op.headers) {
        op.headers.forEach(([key, value]) => {
          ctx.response.headers.set(key, value);
        });
      }

      // Call post response hook
      if (postHandle !== undefined) {
        await postHandle.apply(this, [ctx]);
      }
    }
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
    const handler = this._getOption('patchHandler'),
      postHandle = this._getOption('preResponseHandler');

    this._setDefaultHeaders(ctx);

    // First check if method is even allowed
    if (
      this._allowedMethods.includes('PATCH') === false || handler === undefined
    ) {
      // ctx.response.status = 405;
      // ctx.response.body = {
      //   message: this._getOption("notSupportedMessage"),
      // };
      // return;
      throw methodNotAllowed(
        this._getOption('notSupportedMessage'),
        ctx.response.headers,
      );
    } else {
      const req = await this._parseRequest(ctx);
      if (
        (req.payload === undefined || Object.keys(req.payload).length === 0) &&
        (req.files === undefined || Object.keys(req.files).length === 0)
      ) {
        // ctx.response.status = Status.BadRequest;
        // ctx.response.body = { message: `Missing/No PATCH body` };
        // return;
        throw badRequest(`Missing/No PATCH body`, ctx.response.headers);
      }
      // Call postBodyParse hook
      // We can handle things like HMAC signature check, User access check etc
      // await this._postBodyParse(req, ctx);
      // TODO(@abhinav) - Handle array of objects

      const op = await handler.apply(this, [req]);

      ctx.response.status = op.status;
      // If there is identifier, then we are fetching a single record
      if (this._hasIdentifier(req)) {
        // If no rows throw 404
        if (!op.payload || op.totalRows === 0) {
          // ctx.response.status = 404;
          // ctx.response.body = { message: this._getOption("notFoundMessage") };
          // // Return as we do not want to set other info
          // return;
          throw resourceNotFound(
            this._getOption('notFoundMessage'),
            ctx.response.headers,
          );
        } else {
          ctx.response.body = Array.isArray(op.payload)
            ? op.payload[0]
            : op.payload;
        }
      } else {
        ctx.response.body = op.payload;
      }

      const headerNames = this._getOption('headers');
      ctx.response.headers.set(
        headerNames.totalRows as string,
        op.totalRows.toString(),
      );

      if (op.headers) {
        op.headers.forEach(([key, value]) => {
          ctx.response.headers.set(key, value);
        });
      }
      // Call post response hook
      if (postHandle !== undefined) {
        await postHandle.apply(this, [ctx]);
      }
    }
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
    const handler = this._getOption('deleteHandler'),
      postHandle = this._getOption('preResponseHandler');

    this._setDefaultHeaders(ctx);

    // First check if method is even allowed
    if (
      this._allowedMethods.includes('PATCH') === false || handler === undefined
    ) {
      // ctx.response.status = 405;
      // ctx.response.body = {
      //   message: this._getOption("notSupportedMessage"),
      // };
      // return;
      throw methodNotAllowed(
        this._getOption('notSupportedMessage'),
        ctx.response.headers,
      );
    } else {
      const req = await this._parseRequest(ctx);
      // Call postBodyParse hook
      // We can handle things like HMAC signature check, User access check etc
      // await this._postBodyParse(req, ctx);

      const op = await handler.apply(this, [req]);

      ctx.response.status = op.status;

      if (this._hasIdentifier(req)) {
        // If no rows throw 404
        if (op.totalRows === 0) {
          throw resourceNotFound(
            this._getOption('notFoundMessage'),
            ctx.response.headers,
          );
        }
      }

      const headerNames = this._getOption('headers');
      ctx.response.headers.set(
        headerNames.totalRows as string,
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
      if (postHandle !== undefined) {
        await postHandle.apply(this, [ctx]);
      }
    }
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
    const handler = this._getOption('patchHandler'),
      postHandle = this._getOption('preResponseHandler');

    this._setDefaultHeaders(ctx);

    // First check if method is even allowed
    if (
      this._allowedMethods.includes('PATCH') === false || handler === undefined
    ) {
      // ctx.response.status = 405;
      // ctx.response.body = {
      //   message: this._getOption("notSupportedMessage"),
      // };
      // return;
      throw methodNotAllowed(
        this._getOption('notSupportedMessage'),
        ctx.response.headers,
      );
    } else {
      const req = await this._parseRequest(ctx);
      // Call postBodyParse hook
      // We can handle things like HMAC signature check, User access check etc
      // await this._postBodyParse(req, ctx);

      const op = await handler.apply(this, [req]);

      // ctx.response.status = Status.OK;
      // ctx.response.headers.set(this._getOption("totalRowHeaderName"), op.toString());
      ctx.response.status = Status.OK;

      const headerNames = this._getOption('headers');
      ctx.response.headers.set(
        headerNames.totalRows as string,
        op.totalRows.toString(),
      );

      if (op.headers) {
        op.headers.forEach(([key, value]) => {
          ctx.response.headers.set(key, value);
        });
      }
      // Call post response hook
      if (postHandle !== undefined) {
        await postHandle.apply(this, [ctx]);
      }
    }
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
    ctx.response.headers.set('Allow', this.allowedMethods.join(', '));
    // Await injected here to prevent error
    ctx.response.status = await 200;
  }

  //#endregion HTTP Base Handlers

  //#region Protected methods
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
      contentLength: number = ctx.request.headers.get('content-length')
        ? parseInt(ctx.request.headers.get('content-length') as string)
        : 0;
    let payload:
      | Record<string, unknown>
      | Array<Record<string, unknown>>
      | undefined = undefined;
    let files: { [key: string]: Array<FileUploadInfo> } | undefined = undefined;

    //#region Split paging and sorting params
    if (params['page']) {
      paging.page = Number(params['page']) || undefined;
      delete params['page'];
    }
    if (params['pagesize']) {
      paging.limit = Number(params['pagesize']) || undefined;
      delete params['pagesize'];
    }
    if (params['sort'] && params['sort'].length > 0) {
      const sort = params['sort'].split(',');
      sort.forEach((s) => {
        const [key, value] = s.split(':');
        sorting[key.trim()] = (value.trim().toUpperCase() as 'ASC' | 'DESC') ||
          'ASC';
      });
      delete params['sort'];
    } else if (params['sortasc']) {
      const sort = params['sortasc'].split(',');
      sort.forEach((s) => {
        sorting[s] = 'ASC';
      });
      delete params['sortasc'];
    } else if (params['sortdesc']) {
      const sort = params['sortdesc'].split(',');
      sort.forEach((s) => {
        sorting[s] = 'DESC';
      });
      delete params['sortdesc'];
    }
    //#endregion Split paging and sorting params

    //#region Parse Body
    // TODO(@abhinav) - Check if body exists in http 2.0
    if (ctx.request.hasBody === true && contentLength > 0) {
      const body = await ctx.request.body();
      if (body.type === 'bytes') {
        payload = {
          data: new TextDecoder().decode(await body.value),
        };
      } else if (body.type === 'text') {
        payload = {
          data: await body.value,
        };
      } else if (body.type === 'json') {
        payload = await body.value;
      } else if (body.type === 'form') {
        payload = {};
        const formData = await body.value;
        for (const [key, value] of formData.entries()) {
          payload[key] = value;
        }
      } else if (body.type === 'form-data') {
        // Ok this gets a little complicated as there will be both fields and files
        // @TODO - Figure out a better way to do this?
        const formData = await body.value.read({
          maxFileSize: ctx.app.state.MAX_FILE_UPLOAD_SIZE || 10485760, // default of 10MiB
          outPath: ctx.app.state.FILE_UPLOAD_PATH || undefined, // default of undefined
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
    // Handle Null value of Identifier and state params
    Object.keys(params).forEach((key) => {
      if (params[key] === null || params[key] === undefined) {
        delete params[key];
      }
    });

    //#endregion Parse Body
    const parseReq: ParsedRequest = {
      method: ctx.request.method,
      params: params,
      paging: paging,
      sorting: sorting,
      payload: payload,
      files: files,
    };

    const postBodyParseHook = this._getOption('postBodyParse');
    if (postBodyParseHook !== undefined) {
      await postBodyParseHook.apply(this, [parseReq, ctx]);
    }

    // Call Inject params
    return this._injectStateParams(parseReq, ctx.state.params);
  }

  /**
   * @param req ParsedRequest The data parsed from request
   * @param params Record<string, unknown> Params to inject
   * @returns ParsedRequest The parsed request with injected params
   */
  protected _injectStateParams(
    req: ParsedRequest,
    params?: Record<string, unknown>,
  ): ParsedRequest {
    if (params) {
      // Delete null and undefined values
      Object.keys(params).forEach((key) => {
        if (params[key] !== null && params[key] !== undefined) {
          delete params[key];
        }
      });
      Object.assign(req.params, params);
      //#region Inject params into payload
      if (
        req.method === 'POST' || req.method === 'PUT' ||
        req.method === 'PATCH'
      ) {
        if (req.payload) {
          if (Array.isArray(req.payload)) {
            req.payload = req.payload.map((p) => Object.assign(p, req.params));
          } else {
            Object.assign(req.payload, req.params);
          }
        }
      }
      //#endregion Inject params into payload
    }
    return req;
  }

  /**
   * _setDefaultHeaders
   *
   * Set default headers in the response
   *
   * @protected
   * @param ctx Context Set default headers
   */
  protected _setDefaultHeaders(ctx: Context): void {
    ctx.response.headers.set('X-ROUTE-NAME', this.name);
    ctx.response.headers.set('X-ROUTE-GROUP', this.group);
    ctx.response.headers.set('X-ROUTE-PATH', this.route);
    ctx.response.headers.set('Allow', this.allowedMethods.join(', '));
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
    const routeIdentifiers = this._getOption('routeIdentifiers');
    if (routeIdentifiers && routeIdentifiers.length > 0) {
      // return ':' + this._getOption('routeIdentifiers').join(',:') + '?';
      return ':' + routeIdentifiers.join('\\::') + '?';
    } else {
      return '';
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
    const routeIdentifiers = this._getOption('routeIdentifiers');
    if (routeIdentifiers && routeIdentifiers.length > 0) {
      return routeIdentifiers.every((identifier) => {
        return req.params[identifier] !== undefined;
      });
    } else {
      return false;
    }
  }
  //#endregion Protected methods
}
