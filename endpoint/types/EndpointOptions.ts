export type EndpointOptions = {
  // Name of the endpoint - For quick reference
  name: string;
  // The route path, example /users
  route: string;
  // The route group - Useful for deployment. Has no use case in app execution
  routeGroup: string;
  // Any "Params" found in the route. This will be used to switch from bulk to single endpoint (passed on as filter)
  routeParams: string[];
  // Permission settings
  permissions: {
    GET: boolean;
    POST: boolean;
    PUT: boolean;
    PATCH: boolean;
    DELETE: boolean;
    HEAD: boolean;
  };
};
