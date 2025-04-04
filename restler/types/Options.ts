import type { RESTlerContentType } from './ContentType.ts';

/**
 * Configuration options for RESTler clients.
 */
export type RESTlerOptions = {
  /**
   * Base URL for all API requests.
   * Can include {version} placeholder that will be replaced with the version.
   */
  baseURL: string;

  /**
   * Optional port number for API requests.
   * Must be between 1 and 65535.
   */
  port?: number;

  /**
   * Optional default headers to include with every request.
   */
  headers?: Record<string, string>;

  /**
   * Optional request timeout in seconds.
   * Must be between 1 and 60 seconds.
   * Default: 10
   */
  timeout?: number;

  /**
   * Optional default content type for requests.
   * Default: 'JSON'
   */
  contentType?: RESTlerContentType;

  /**
   * Optional API version string.
   * Will replace {version} placeholders in URLs and headers.
   */
  version?: string;

  /**
   * Optional Unix domain socket path for socket-based requests.
   * If provided, requests will be made through the Unix socket instead of HTTP.
   */
  socketPath?: string;

  /**
   * TLS configuration for secure connections.
   * Can be a path to a CA certificate file, or an object with certificate and key paths.
   */
  tls?: string | { certificate: string; key: string };
};
