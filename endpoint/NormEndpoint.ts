import { Status } from "../dependencies.ts";
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
import { badRequest,internalServerError } from "./HTTPErrors.ts";

export type ErrorList = {
  [key: string]: string;
};

export class NormEndpoint<
  S extends ModelDefinition = ModelDefinition,
  T extends ModelType<S> = ModelType<S>,
> extends BaseEndpoint<EndpointOptions> {
  protected _model: Model<S, T>;

  constructor(model: Model<S, T>, options: Partial<EndpointOptions>) {
    const defOptions: Partial<EndpointOptions> = {
      routeIdentifiers: model.primaryKeys as Array<string>,
      allowedMethods: {
        GET: model.capability("insert"),
        POST: model.capability("insert"),
        PUT: model.capability("update"),
        PATCH: model.capability("update"),
        DELETE: model.capability("delete"),
        HEAD: true,
      },
    };
    super({ ...defOptions, ...options });
    this._model = model;
  }

  protected async _fetch(request: ParsedRequest): Promise<HTTPResponse> {
    // Validate filters
    let filters: Filters<T> | undefined;
    try {
      if (request.payload) {
        // It is possible specific "filters" (complex filters). If present, then this will override the params
      }
      filters = this._model.validateFilters(request.params as Filters<T>);
    } catch (e) {
      if(e instanceof ModelFilterError) {
        throw badRequest('Invalid filter conditions provided');
      } else {
        throw internalServerError(e.message)
      }
    }
    // Set page size and limit
    if (
      (!request.paging || !request.paging.limit) &&
      this._getOption("pageLimit") !== undefined &&
      this._getOption("pageLimit") > 0
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
    // validate data
    // const validatedData: Array<Partial<T>> = [],
    //   errorRecords: Array<{ row: number; errors: ModelValidation<T> }> = [];

    // for (const [index, item] of request.payload?.entries() || []) {
    //   const [err, dat] = await this._model.validateData(item as Partial<T>);
    //   if (err) {
    //     // console.log(err);
    //     errorRecords.push({
    //       row: index,
    //       errors: err,
    //     });
    //   } else {
    //     validatedData.push(dat as Partial<T>);
    //   }
    // }
    // // console.log("Async check done");
    // if (errorRecords.length > 0) {
    //   // console.log(errorRecords);
    //   const errHead = new Headers();
    //   errHead.set("X-Error-Rows", errorRecords.length.toString());
    //   return {
    //     status: Status.BadRequest,
    //     payload: errorRecords,
    //     headers: errHead,
    //     totalRows: data.length,
    //   };
    // }

    // const queryOutput = await this._model.insert(
    //     validatedData,
    //   ),
    //   response: HTTPResponse = {
    //     status: Status.Created,
    //     payload: queryOutput.rows,
    //     totalRows: queryOutput.totalRows,
    //   };
    const response: HTTPResponse = {
      status: Status.Created,
      totalRows: 0, 
    };
    try {
      // Perform update
      const queryOutput = await this._model.insert(request.payload as Array<Partial<T>>);
      response.totalRows = queryOutput.totalRows;
      response.payload = queryOutput.rows;
    } catch (e) {
      if(e instanceof ModelValidationError) {
        throw badRequest(e.errorList)
      } else {
        throw internalServerError(e.message)
      }
    }
    // Return the data
    return response;
  }

  protected async _update(request: ParsedRequest): Promise<HTTPResponse> {
    // Validate filters
    let filters: Filters<T> | undefined;
    try {
      filters = this._model.validateFilters(request.params as Filters<T>);
    } catch (e) {
      if(e instanceof ModelFilterError) {
        throw badRequest('Invalid filter conditions provided')
      } else {
        throw internalServerError(e.message)
      }
    }
    
    

    if(Array.isArray(request.payload) && request.payload.length > 1) {
      throw badRequest(`Cannot update multiple records at once`)
    }
    // TODO Process filters

    const response: HTTPResponse = {
      status: Status.OK,
      totalRows: 0,
    };
    try {
      // Perform update
      const queryOutput = await this._model.update(
        (Array.isArray(request.payload)? request.payload[0] : request.payload) as Partial<T>,
        filters,
      );
      response.totalRows = queryOutput.totalRows;
      response.payload = queryOutput.rows;
    } catch (e) {
      if(e instanceof ModelValidationError) {
        throw badRequest(e.errorList)
      } else {
        throw internalServerError(e.message)
      }
    }
    // Return the data
    return response;
  }

  protected async _delete(request: ParsedRequest): Promise<HTTPResponse> {
    // Validate filters
    let filters: Filters<T> | undefined;
    try {
      filters = this._model.validateFilters(request.params as Filters<T>);
    } catch (e) {
      if(e instanceof ModelFilterError) {
        throw badRequest('Invalid filter conditions provided')
      } else {
        throw internalServerError(e.message)
      }
    }

    const queryOutput = await this._model.delete(filters),
      response: HTTPResponse = {
        status: Status.NoContent,
        headers: new Headers(),
        totalRows: queryOutput.totalRows,
      };
    return response;
  }

  protected async _count(request: ParsedRequest): Promise<HTTPResponse> {
    // Validate filters
    let filters: Filters<T> | undefined;
    try {
      filters = this._model.validateFilters(request.params as Filters<T>);
    } catch (e) {
      if(e instanceof ModelFilterError) {
        throw badRequest('Invalid filter conditions provided')
      } else {
        throw internalServerError(e.message)
      }
    }
    // Validate filters
    const queryOutput = await this._model.count(filters);
    return {
      status: Status.OK,
      totalRows: queryOutput.totalRows,
    }
  }
}
