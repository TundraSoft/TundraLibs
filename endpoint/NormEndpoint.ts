import { Context } from "../dependencies.ts";
import { BaseEndpoint } from "./BaseEndpoint.ts";
import { NormEndpointOptions, ParsedRequest } from "./types/mod.ts";
import { Model, ModelDefinition } from '../norm/mod.ts';

export class NormEndpoint extends BaseEndpoint<NormEndpointOptions> {
  protected _model: Model;
  constructor(options: Partial<NormEndpointOptions>) {
    super(options);
    this._model = new Model({} as ModelDefinition);
  }

  protected async _GET(request: ParsedRequest, ctx: Context): Promise<void> {
    const op = await this._model.select({
      filters: request.params, 
      sort: request.sorting, 
      paging: request.paging
    });
    ctx.response.body = op.rows;
    if(op.paging) {
      ctx.response.headers.append('X-PAGE-COUNT', op.paging.size.toString());
      ctx.response.headers.append('X-PAGE-NUMBER', (op.paging.page || 1).toString());
    }
  }

  protected async _POST(request: ParsedRequest, ctx: Context): Promise<void> {
    // Insert
    const op = await this._model.insert(request.body.value);
  }

  protected async _PUT(request: ParsedRequest, ctx: Context): Promise<void> {
    const op = await this._model.update(request.body.value, request.params);
  }

  protected async _PATCH(request: ParsedRequest, ctx: Context): Promise<void> {
    const op = await this._model.update(request.body.value, request.params);
  }

  protected async _DELETE(request: ParsedRequest, ctx: Context): Promise<void> {
    const op = await this._model.delete(request.params);
  }
}
