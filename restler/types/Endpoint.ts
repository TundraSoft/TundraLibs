/**
 * Configuration for a RESTler API endpoint.
 * Defines the URL, authentication, and other properties for making a request.
 */
export type RESTlerEndpoint = {
  /**
   * The path part of the URL (e.g., "/users/{id}").
   * Can include {version} placeholder that will be replaced with the version.
   */
  path: string;

  /**
   * Optional base URL for this specific endpoint.
   * Overrides the baseURL from RESTlerOptions if provided.
   */
  baseURL?: string;

  /**
   * Optional port number for this specific endpoint.
   * Overrides the port from RESTlerOptions if provided.
   */
  port?: number;

  /**
   * Optional version for this specific endpoint.
   * Overrides the version from RESTlerOptions if provided.
   */
  version?: string;

  /**
   * Optional HTTP Basic Authentication credentials.
   * If provided, a Basic Auth header will be added to the request.
   */
  basicAuth?: {
    username: string;
    password: string;
  };

  /**
   * Optional Bearer token for authentication.
   * If provided, an Authorization header with the Bearer token will be added.
   */
  bearerToken?: string;

  /**
   * Optional query parameters to add to the URL.
   * Values can include {version} placeholder.
   */
  query?: Record<string, string>;
};
