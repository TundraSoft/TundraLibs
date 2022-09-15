import { Context, Status } from "../dependencies.ts";
import { BaseEndpoint } from "./BaseEndpoint.ts";
import { EndpointOptions, HTTPResponse, ParsedRequest } from "./types/mod.ts";
import { Model } from "../norm/mod.ts";
import type {
  Filters,
  ModelDefinition,
  ModelPermissions,
  ModelType,
  QueryPagination,
  QuerySorting,
} from "../norm/mod.ts";

export type ErrorList = {
  [key: string]: string;
}

export class NormEndpoint<
  S extends ModelDefinition = ModelDefinition,
  T extends ModelType<S> = ModelType<S>,
> extends BaseEndpoint<EndpointOptions> {
  protected _model: Model<S, T>;

  constructor(model: Model<S, T>, options: Partial<EndpointOptions>) {
    const defOptions: Partial<EndpointOptions> = {
      routeIdentifiers: model.primaryKeys as Array<string>,
      allowedMethods: {
        GET: true,
        POST: model.capability("insert"),
        PUT: model.capability("update"),
        PATCH: model.capability("update"),
        DELETE: model.capability("delete"),
        HEAD: true,
      },
    };
    super({ ...defOptions, ...options });
    this._model = model;
    // Override allowed methods
    // this._options['allowedMethods'] = {
    //   GET: this._options['allowedMethods']?.GET || true,
    //   POST: this._model.capability("insert"),
    //   PUT: this._model.capability('update'),
    //   PATCH: this._model.capability('update'),
    //   DELETE: this._model.capability('delete'),
    //   HEAD: true
    // };
  }

  protected async _fetch(request: ParsedRequest): Promise<HTTPResponse> {
    // Ok we create the filter first
    const filters = request.params as Filters<T>;
    if (request.payload) {
      // It is possible specific "filters" (complex filters). If present, then this will override the params
    }
    const queryOutput = await this._model.select(
        filters,
        request.sorting as QuerySorting<T>,
        request.paging as QueryPagination,
      ),
      // hasIdentifier = this._hasIdentifier(request),
      response: HTTPResponse = {
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

  protected async _insert(request: ParsedRequest): Promise<HTTPResponse> {
    // NORM accepts only array for input. So we must convert payload to array
    if (request.payload && !Array.isArray(request.payload)) {
      request.payload = [request.payload];
    }
    // Perform Insert
    const queryOutput = await this._model.insert(
        request.payload as Array<Partial<T>>,
      ),
      response: HTTPResponse = {
        status: Status.Created,
        payload: queryOutput.rows,
        totalRows: queryOutput.totalRows,
      };
    // Return the data
    return response;
  }

  protected async _update(request: ParsedRequest): Promise<HTTPResponse> {
    // Prepare data for update
    const filters = request.params as Filters<T>;
    // Perform update
    const queryOutput = await this._model.update(
        request.payload as Partial<T>,
        filters,
      ),
      response: HTTPResponse = {
        status: Status.OK,
        payload: queryOutput.rows,
        totalRows: queryOutput.totalRows,
      };
    // Return the data
    return response;
  }

  protected async _delete(request: ParsedRequest): Promise<HTTPResponse> {
    const queryOutput = await this._model.delete(request.params as Filters<T>),
      response: HTTPResponse = {
        status: Status.NoContent,
        headers: new Headers(),
        totalRows: queryOutput.totalRows,
      };
    return response;
  }

  protected _validateParams(params: ParsedRequest): [ErrorList, ParsedRequest] {
    // Check if the params are valid
    const errors: ErrorList = {
      'id': 'Invalid ID',
    };
    return [errors, params];
  }
  // protected _parseParams(request: ParsedRequest) {
    
  // }

  // protected _parsePayload(data: Array<Partial<T>>): Array<Partial<T>>;
  // protected _parsePayload(data: Partial<T>): Partial<T>;
  // protected _parsePayload(data: Partial<T> | Array<Partial<T>>): Partial<T> | Array<Partial<T>> {
  //   if(Array.isArray(data)) {
  //     const result: Array<Partial<T>> = [];
  //     data.forEach((d) => {
  //       result.push(this._parsePayload(d));
  //     })
  //     return result;
  //   }
    
  // }
}
