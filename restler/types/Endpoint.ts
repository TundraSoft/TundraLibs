import type { RESTlerAuth } from "./Auth.ts";

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
   * Optional authentication configuration.
   * Can be a bearer token string or an object with username and password for basic auth.
   * @see {@link RESTlerAuth}
   */
  auth?: RESTlerAuth;

  /**
   * Optional query parameters to add to the URL.
   * Values can include {version} placeholder.
   */
  query?: Record<string, string>;
};
