import { Context } from "../../dependencies.ts";
// import type { HTTPMethods } from "../../dependencies.ts";
import { ParsedRequest } from "./ParsedRequest.ts";
import type { HTTPResponse } from "./HTTPResponse.ts";

export type PostBodyParseHandler = (
  req: ParsedRequest,
  ctx: Context,
) => Promise<void>;
export type PreResponseHandler = (ctx: Context) => Promise<void>;
export type MethodHandler = (request: ParsedRequest) => Promise<HTTPResponse>;

export type EndpointOptions = {
  name: string;
  routePath: string;
  routeGroup: string;
  routeIdentifiers: string[];
  stateParams: boolean;
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
  authHandler?: PreResponseHandler;
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
