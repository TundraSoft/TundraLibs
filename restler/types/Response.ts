import type { StatusCode } from '$http';
import { RESTlerError } from '../errors/mod.ts';

/**
 * Possible types for response bodies.
 */
export type ResponseBody =
  | Record<string, unknown> // JSON or XML parsed to object
  | Array<Record<string, unknown>> // JSON or XML parsed to array
  | string // Text or unparsable content
  | undefined; // No content

/**
 * Response object returned by RESTler requests.
 *
 * @template T Type of the response body, defaults to ResponseBody
 */
export type RESTlerResponse<T = ResponseBody> = {
  /**
   * The URL that was requested.
   */
  url: string;

  /**
   * Time taken to complete the request in milliseconds.
   */
  timeTaken: number;

  /**
   * Response headers.
   */
  headers?: Record<string, string>;

  /**
   * HTTP status code, or null if the request failed before receiving a response.
   */
  status: StatusCode | null;

  /**
   * HTTP status text, or null if the request failed before receiving a response.
   */
  statusText: string | null;

  /**
   * Response body, parsed according to content type.
   */
  body?: T;

  /**
   * Error that occurred during the request, if any.
   */
  error?: RESTlerError;
};
