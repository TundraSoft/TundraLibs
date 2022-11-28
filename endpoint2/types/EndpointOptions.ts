import { Context } from "../../dependencies.ts";
import type { HTTPMethods } from "../../dependencies.ts";
import { ParsedRequest } from "./ParsedRequest.ts";
import type { HTTPResponse } from "./HTTPResponse.ts";

export type PostBodyHook = (req: ParsedRequest, ctx: Context) => Promise<void>;
export type PostHandleHook = (ctx: Context) => Promise<void>;
export type MethodHook = (request: ParsedRequest) => Promise<HTTPResponse>;

// export type EndpointHooks = {
//   postBodyParse: PostBodyHook;
//   postHandle: PostHandleHook;
//   get: MethodHook;
//   head: MethodHook;
//   post: MethodHook;
//   put: MethodHook;
//   patch: MethodHook;
//   delete: MethodHook;
// };

export type EndpointOptions = {
  name: string;
  routePath: string;
  routeGroup: string;
  routeIdentifiers: string[];
  stateParams: boolean;
  // Method handlers
  getHandler?: MethodHook;
  postHandler?: MethodHook;
  putHandler?: MethodHook;
  patchHandler?: MethodHook;
  deleteHandler?: MethodHook;
  headHandler?: MethodHook;
  // Post body parse handler (After body is parsed)
  postBodyParse?: PostBodyHook;
  // Auth handler - Called before actual method handlers
  authHandler?: PostBodyHook;
  // Few header names
  pageLimit?: number;
  headers: {
    totalRows: string, 
    paginationLimit: string, 
    paginationPage: string
  }
  // Messages to use
  notFoundMessage: string;
  notSupportedMessage: string;
};
