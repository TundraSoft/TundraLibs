import { Context } from "../../dependencies.ts";
import type { HTTPMethods } from "../../dependencies.ts";
import { ParsedRequest } from "./ParsedRequest.ts";
import type { HTTPResponse } from "./HTTPResponse.ts";

export type PostBodyHook = (req: ParsedRequest, ctx: Context) => Promise<void>;
export type PostHandleHook = (ctx: Context) => Promise<void>;
export type MethodHook = (request: ParsedRequest) => Promise<HTTPResponse>;
// export type NormMethodHook = (request: ParsedRequest) => Promise<HTTPResponse>;

// export interface iBaseEndpoint {
//   _hasIdentifier: (req: ParsedRequest) => boolean;
//   _getOption: (name: string) => unknown | undefined;
//   _hasOption: (name: string) => boolean;
// }

// export interface iNormEndpoint extends iBaseEndpoint {
//   _fetch: NormMethodHook;
//   _insert: NormMethodHook;
//   _update: NormMethodHook;
//   _delete: NormMethodHook;
//   _count: NormMethodHook;
// }

export type EndpointHooks = {
  postBodyParse: PostBodyHook;
  postHandle: PostHandleHook;
  get: MethodHook;
  head: MethodHook;
  post: MethodHook;
  put: MethodHook;
  patch: MethodHook;
  delete: MethodHook;
};

export type EndpointOptions = {
  name: string;
  routePath: string;
  routeGroup: string;
  routeIdentifiers: string[];
  stateParams: boolean;
  allowedMethods: Array<HTTPMethods>;
  hooks: Partial<EndpointHooks>;
  // handlers: Partial<EndpointHandlers>;
  // postBodyParse?: (req: ParsedRequest, ctx: Context) => Promise<void>;
  // postHandle?: (ctx: Context) => Promise<void>;
  // Few header names
  pageLimit?: number;
  totalRowHeaderName: string;
  paginationLimitHeaderName: string;
  paginationPageHeaderName: string;
  // Messages to use
  notFoundMessage: string;
  notSupportedMessage: string;
};
