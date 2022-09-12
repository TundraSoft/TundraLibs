import { Context, Status } from "../dependencies.ts";
import { BaseEndpoint } from "./BaseEndpoint.ts";
import { EndpointOptions, HTTPResponse, ParsedRequest } from "./types/mod.ts";
import { Model } from '../norm/mod.ts';
import type { ModelPermissions, ModelDefinition, ModelType, Filters, QueryPagination, QuerySorting } from '../norm/mod.ts';

export class NormEndpoint<
S extends ModelDefinition = ModelDefinition,
T extends ModelType<S> = ModelType<S>,
> extends BaseEndpoint<EndpointOptions> {

  protected _model: Model<S, T>;

  constructor(model: Model<S,T>, options: Partial<EndpointOptions>) {
    const defOptions: Partial<EndpointOptions> = {
      routeIdentifiers: model.primaryKeys as Array<string>, 
      allowedMethods: {
        GET: true,
        POST: model.capability('insert'),
        PUT: model.capability('update'),
        PATCH: model.capability('update'),
        DELETE: model.capability('delete'), 
        HEAD: true,
      }
    }
    super({...defOptions, ...options});
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
    if(request.payload) {
      // It is possible specific "filters" (complex filters). If present, then this will override the params
    }
    const queryOutput = await this._model.select(request.params as Filters<T>, request.sorting as QuerySorting<T>, request.paging as QueryPagination), 
      hasIdentifier = this._hasIdentifier(request), 
      response: HTTPResponse = {
        status: Status.OK, 
        headers: new Headers()
      };
    
    if(hasIdentifier) {
      if(queryOutput.rows && queryOutput.rows.length > 0) {
        response.body = queryOutput.rows[0];
      } else {
        response.status = Status.NotFound;
      }
    } else {
      response.body = queryOutput;
      response.headers?.set('Pagination-Count', queryOutput.totalRows.toString());
      response.headers?.set('X-Pagination-Count', queryOutput.totalRows.toString());
      if(queryOutput.paging) {
        response.headers?.set('X-Pagination-Page', (queryOutput.paging.page || 1).toString());
        response.headers?.set('Pagination-Page', (queryOutput.paging.page || 1).toString());
        response.headers?.set('X-Pagination-Limit', queryOutput.paging.size.toString());
        response.headers?.set('Pagination-Limit', queryOutput.paging.size.toString());
      }
    }
    return response;
  }

  protected async _insert(request: ParsedRequest): Promise<HTTPResponse> {
    // Prepare data for insert

    // Insert

    // Return the data

  }

  protected async _update(request: ParsedRequest): Promise<HTTPResponse> {
    // Prepare data for update

    // Perform update

    // Return the data

  }

  protected async _delete(request: ParsedRequest): Promise<HTTPResponse> {
    const queryOutput = await this._model.delete(request.params as Filters<T>), 
      response: HTTPResponse = {
        status: Status.NoContent, 
        headers: new Headers()
      };
    response.headers?.set('X-Deleted-Count', queryOutput.totalRows.toString());
    return response;
  }
}