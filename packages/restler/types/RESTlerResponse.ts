/**
 * @fileoverview Result of a RESTler request, including timing and any error.
 *
 * @module
 */
import type { StatusCode } from '@tundralibs/compat/http';
import { RESTlerError } from '../errors/mod.ts';
import type { ResponseBody } from './ResponseBody.ts';

/**
 * Result of a RESTler request, including timing and any error
 *
 * `status` / `statusText` are `null` when the request failed before a
 * response was received; in that case `error` is populated.
 *
 * @typeParam T - Type of the response body; defaults to {@link ResponseBody}
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
   * Response body, parsed according to content type. Parsing is lenient: if a
   * structured (JSON/XML) body fails to parse, the raw text is returned, so
   * this may be a `string` even when `T` is an object.
   */
  body?: T;

  /**
   * Error that occurred during the request, if any.
   */
  error?: RESTlerError;
};
