import { Context } from "../dependencies.ts";
import { BaseEndpoint } from "./BaseEndpoint.ts";
import { EndpointOptions, ParsedRequest } from "./types/mod.ts";
import { Model, ModelManager } from '../norm/mod.ts';
import type { ModelPermissions, ModelDefinition, ModelType, Filters, QueryPagination, QuerySorting } from '../norm/mod.ts';

export class NormEndpoint<
S extends ModelDefinition = ModelDefinition,
T extends ModelType<S> = ModelType<S>,
> extends BaseEndpoint<EndpointOptions> {

  protected _model: Model<S, T>;

  constructor(model: Model<S,T>, options: Partial<EndpointOptions>) {
    super(options);
    this._model = model;
    // Override allowed methods
    this._options['allowedMethods'] = {
      GET: this._options['allowedMethods']?.GET || true, 
      POST: this._model.capability("insert"),
      PUT: this._model.capability('update'), 
      PATCH: this._model.capability('update'),
      DELETE: this._model.capability('delete'),
      HEAD: true
    };
  }

  protected async _GET(request: ParsedRequest, ctx: Context): Promise<void> {
    const op = await this._model.select(request.params as Filters<T>, request.sorting as QuerySorting<T>, request.paging as QueryPagination);
    ctx.response.body = op.rows;
    if(op.paging) {
      ctx.response.headers.append('X-PAGE-COUNT', op.paging.size.toString());
      ctx.response.headers.append('X-PAGE-NUMBER', (op.paging.page || 1).toString());
    }
    ctx.response.headers.append('X-TOTAL-RECORDS', op.totalRows.toString());
  }

  protected async _POST(request: ParsedRequest, ctx: Context): Promise<void> {
    // Insert
    const data = this._model.validator(request.body.value);
    const op = await this._model.insert(data);
    ctx.response.headers.append('X-TOTAL-RECORDS', op.totalRows.toString());
  }

  protected async _PUT(request: ParsedRequest, ctx: Context): Promise<void> {
    // const op = await this._model.update(request.body.value, request.params);

    // ctx.response.headers.append('X-TOTAL-RECORDS', op.totalRows.toString());
  }

  protected async _PATCH(request: ParsedRequest, ctx: Context): Promise<void> {
    // const op = await this._model.update(request.body.value, request.params);

    // ctx.response.headers.append('X-TOTAL-RECORDS', op.totalRows.toString());
  }

  protected async _DELETE(request: ParsedRequest, ctx: Context): Promise<void> {
    const op = await this._model.delete(request.params as Filters<T>);
    ctx.response.headers.append('X-TOTAL-RECORDS', op.totalRows.toString());
  }
}