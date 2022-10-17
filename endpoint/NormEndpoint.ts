import { HTTPMethods, Status } from "../dependencies.ts";
import { BaseEndpoint } from "./BaseEndpoint.ts";
import { EndpointOptions, HTTPResponse, ParsedRequest } from "./types/mod.ts";
import { Model, ModelFilterError, ModelValidationError } from "../norm/mod.ts";
import type {
  Filters,
  ModelDefinition,
  // ModelPermissions,
  ModelType,
  QueryPagination,
  QuerySorting,
} from "../norm/mod.ts";
import { badRequest, internalServerError } from "./HTTPErrors.ts";

export type ErrorList = {
  [key: string]: string;
};

const defaultGetHandler = async function (
    this: NormEndpoint<EndpointOptions>,
    req: ParsedRequest,
  ) {
    return await this._fetch(req);
  },
  defaultPostHandler = async function (
    this: NormEndpoint<EndpointOptions>,
    req: ParsedRequest,
  ) {
    return await this._insert(req);
  },
  defaultPutHandler = async function (
    this: NormEndpoint<EndpointOptions>,
    req: ParsedRequest,
  ) {
    return await this._update(req);
  },
  defaultDeleteHandler = async function (
    this: NormEndpoint<EndpointOptions>,
    req: ParsedRequest,
  ) {
    return await this._delete(req);
  },
  defaultHeadHandler = async function (
    this: NormEndpoint<EndpointOptions>,
    req: ParsedRequest,
  ) {
    return await this._count(req);
  };

export class NormEndpoint<
  O extends EndpointOptions,
  S extends ModelDefinition = ModelDefinition,
  T extends ModelType<S> = ModelType<S>,
> extends BaseEndpoint<O, T> {
  protected _model: Model<S, T>;

  constructor(model: Model<S, T>, options: Partial<O>) {
    // We set routeIdentifiers as PK by default
    const defOptions: Partial<EndpointOptions> = {
      routeIdentifiers: model.primaryKeys as Array<string>,
      hooks: {
        get: defaultGetHandler,
        post: defaultPostHandler,
        put: defaultPutHandler,
        patch: defaultPutHandler,
        delete: defaultDeleteHandler,
        head: defaultHeadHandler,
      },
      // Disabled as methods must be manually enabled as config
      // allowedMethods: {
      //   GET: model.capability("insert"),
      //   POST: model.capability("insert"),
      //   PUT: model.capability("update"),
      //   PATCH: model.capability("update"),
      //   DELETE: model.capability("delete"),
      //   HEAD: true,
      // },
    };
    if (model.isView) {
      // Disable post, put, patch and delete
      const newMethods: Array<HTTPMethods> = [];
      if (options.allowedMethods?.includes("GET")) {
        newMethods.push("GET");
      }
      if (options.allowedMethods?.includes("HEAD")) {
        newMethods.push("HEAD");
      }
      options.allowedMethods = newMethods;
    }
    super({ ...defOptions, ...options });
    this._model = model;
  }

  protected async _fetch(request: ParsedRequest): Promise<HTTPResponse<T>> {
    // Validate filters
    let filters: Filters<T> | undefined;
    try {
      if (request.payload) {
        // It is possible specific "filters" (complex filters). If present, then this will override the params
      }
      filters = this._model.validateFilters(request.params as Filters<T>);
    } catch (e) {
      if (e instanceof ModelFilterError) {
        throw badRequest("Invalid filter conditions provided");
      } else {
        throw internalServerError(e.message);
      }
    }
    // Set page size and limit
    if (
      (!request.paging || !request.paging.limit) &&
      (this._getOption("pageLimit") !== undefined &&
          this._getOption("pageLimit") || 0 > 0)
    ) {
      request.paging = request.paging || {};
      request.paging.limit = this._getOption("pageLimit");
      request.paging.page = request.paging.page || 1;
    }
    const queryOutput = await this._model.select(
        filters,
        request.sorting as QuerySorting<T>,
        request.paging as QueryPagination,
      ),
      // hasIdentifier = this._hasIdentifier(request),
      response: HTTPResponse<T> = {
        status: Status.OK,
        totalRows: queryOutput.totalRows,
        headers: new Headers(),
        payload: queryOutput.rows,
      };

    if (queryOutput.paging) {
      response.pagination = {
        limit: queryOutput.paging.limit,
        page: queryOutput.paging.page || 1,
      };
    }

    return response;
  }

  protected async _insert(request: ParsedRequest): Promise<HTTPResponse<T>> {
    // NORM accepts only array for input. So we must convert payload to array
    if (request.payload && !Array.isArray(request.payload)) {
      request.payload = [request.payload];
    }

    const response: HTTPResponse<T> = {
      status: Status.Created,
      totalRows: 0,
    };
    try {
      // Perform update
      const queryOutput = await this._model.insert(
        request.payload as Array<Partial<T>>,
      );
      response.totalRows = queryOutput.totalRows;
      response.payload = queryOutput.rows;
    } catch (e) {
      if (e instanceof ModelValidationError) {
        throw badRequest(e.errorList);
      } else {
        throw internalServerError(e.message);
      }
    }
    // Return the data
    return response;
  }

  protected async _update(request: ParsedRequest): Promise<HTTPResponse<T>> {
    // Validate filters
    let filters: Filters<T> | undefined;
    try {
      filters = this._model.validateFilters(request.params as Filters<T>);
    } catch (e) {
      if (e instanceof ModelFilterError) {
        throw badRequest("Invalid filter conditions provided");
      } else {
        throw internalServerError(e.message);
      }
    }

    if (Array.isArray(request.payload) && request.payload.length > 1) {
      throw badRequest(`Cannot update multiple records at once`);
    }
    // TODO Process filters

    const response: HTTPResponse<T> = {
      status: Status.OK,
      totalRows: 0,
    };
    try {
      // Perform update
      const queryOutput = await this._model.update(
        (Array.isArray(request.payload)
          ? request.payload[0]
          : request.payload) as Partial<T>,
        filters,
      );
      response.totalRows = queryOutput.totalRows;
      response.payload = queryOutput.rows;
    } catch (e) {
      if (e instanceof ModelValidationError) {
        throw badRequest(e.errorList);
      } else {
        throw internalServerError(e.message);
      }
    }
    // Return the data
    return response;
  }

  protected async _delete(request: ParsedRequest): Promise<HTTPResponse<T>> {
    // Validate filters
    let filters: Filters<T> | undefined;
    try {
      filters = this._model.validateFilters(request.params as Filters<T>);
    } catch (e) {
      if (e instanceof ModelFilterError) {
        throw badRequest("Invalid filter conditions provided");
      } else {
        throw internalServerError(e.message);
      }
    }

    const queryOutput = await this._model.delete(filters),
      response: HTTPResponse<T> = {
        status: Status.NoContent,
        headers: new Headers(),
        totalRows: queryOutput.totalRows,
      };
    return response;
  }

  protected async _count(request: ParsedRequest): Promise<HTTPResponse<T>> {
    // Validate filters
    let filters: Filters<T> | undefined;
    try {
      filters = this._model.validateFilters(request.params as Filters<T>);
    } catch (e) {
      if (e instanceof ModelFilterError) {
        throw badRequest("Invalid filter conditions provided");
      } else {
        throw internalServerError(e.message);
      }
    }
    // Validate filters
    const queryOutput = await this._model.count(filters);
    return {
      status: Status.OK,
      totalRows: queryOutput.totalRows,
    };
  }

  protected override _injectStateParams(
    req: ParsedRequest,
    params: Record<string, unknown>,
  ): ParsedRequest {
    // Check if the params exist in model
    Object.keys(params).forEach((key) => {
      const name: keyof T | undefined = this._model.normaliseColumn(key);
      if (name === undefined) {
        delete params[key];
      } else {
        const value = params[key];
        delete params[key];
        params[name as string] = value;
      }
    });
    return super._injectStateParams(req, params);
  }
}
