import type { RESTlerContentTypePayload } from './ContentType.ts';

/**
 * HTTP methods supported by RESTler.
 */
export type RESTlerMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS';

/**
 * Type definition for method-specific payloads.
 * For methods that don't typically have a body (GET, HEAD, OPTIONS, DELETE),
 * only the method is required. For other methods, both contentType and payload are required.
 *
 * @template Method The HTTP method to define the payload for
 */
export type RESTlerMethodPayload<Method extends RESTlerMethod = RESTlerMethod> =
  Method extends ('GET' | 'HEAD' | 'OPTIONS' | 'DELETE') ? { method: Method }
    : RESTlerContentTypePayload & { method: Method } extends infer M
      ? { [K in keyof M]: M[K] }
    : never;
