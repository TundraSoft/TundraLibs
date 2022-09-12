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
  stateIdentifiers?: string[];
  // Permission settings
  allowedMethods: {
    GET: boolean;
    POST: boolean;
    PUT: boolean;
    PATCH: boolean;
    DELETE: boolean;
    HEAD: boolean;
  };
};
