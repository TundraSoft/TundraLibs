// import { Context } from "../../dependencies.ts";
// import { HTTPResponse } from "./HTTPResponse.ts";
// import { ParsedRequest } from "./ParsedRequest.ts";

export type EndpointOptions = {
  // Name of the endpoint - For quick reference
  name: string;
  // The route path, example /users
  routePath: string;
  // The route group - Useful for deployment. Has no use case in app execution
  routeGroup: string;
  // Route Identifiers are the Primary Key values basis which a specific (single) record can be identified
  // @TODO - Both these must be Map<string, string> where we have alias - actual name #HasH9
  routeIdentifiers: string[];
  // Identifiers coming in through OAK's State object
  stateParams: boolean;
  // Permission settings
  allowedMethods: {
    GET: boolean;
    POST: boolean;
    PUT: boolean;
    PATCH: boolean;
    DELETE: boolean;
    HEAD: boolean;
  };
  pageLimit: number;
  totalRowHeaderName: string;
  paginationLimitHeaderName: string;
  paginationPageHeaderName: string;
  // Messages to use
  notFoundMessage: string;
  notSupportedMessage: string;
};
