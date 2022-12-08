import { Context } from '../../dependencies.ts';
// import type { HTTPMethods } from "../../dependencies.ts";
import { ParsedRequest } from './ParsedRequest.ts';
import type { HTTPResponse } from './HTTPResponse.ts';

export type PostBodyParseHandler = <
  S extends Record<string, unknown> = Record<string, unknown>,
>(
  req: ParsedRequest<S>,
  ctx: Context<S>,
) => Promise<void>;
export type PreResponseHandler = <
  S extends Record<string, unknown> = Record<string, unknown>,
>(ctx: Context<S>) => Promise<void>;
export type MethodHandler = <
  S extends Record<string, unknown> = Record<string, unknown>,
>(request: ParsedRequest<S>) => Promise<HTTPResponse>;

export type EndpointOptions = {
  name: string;
  routeGroup: string;
  routePath: string;
  routeIdentifiers?: string[];
  uploadPath?: string;
  uploadMaxFileSize?: number;
  // stateParams: boolean;
  // Method handlers
  getHandler?: MethodHandler;
  postHandler?: MethodHandler;
  putHandler?: MethodHandler;
  patchHandler?: MethodHandler;
  deleteHandler?: MethodHandler;
  headHandler?: MethodHandler;
  // Post body parse handler (After body is parsed)
  postBodyParse?: PostBodyParseHandler;
  preResponseHandler?: PreResponseHandler;
  // Auth handler - Called before actual method handlers
  // authHandler?: PostBodyParseHandler;
  // Few header names
  pageLimit?: number;
  headers: {
    totalRows: string;
    paginationLimit: string;
    paginationPage: string;
  };
  // Messages to use
  notFoundMessage: string;
  notSupportedMessage: string;
};

export type EndpointManagerOptions = Pick<
  EndpointOptions,
  | 'uploadPath'
  | 'uploadMaxFileSize'
  | 'postBodyParse'
  | 'preResponseHandler'
  | 'headers'
  | 'notFoundMessage'
  | 'notSupportedMessage'
  | 'pageLimit'
>;
