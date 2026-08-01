/**
 * @fileoverview Method-specific request shape (body-less vs body-bearing).
 *
 * @module
 */
import type { RESTlerContentTypePayload } from './RESTlerContentTypePayload.ts';
import type { RESTlerMethod } from './RESTlerMethod.ts';

/**
 * Method-specific request shape
 *
 * Body-less methods (`GET` / `HEAD` / `OPTIONS` / `DELETE`) carry only
 * `method`. Other methods additionally allow {@link RESTlerContentTypePayload},
 * whose `contentType` and `payload` are both optional — a body-bearing
 * method may still send no body.
 *
 * @typeParam Method - The HTTP method to define the payload for
 */
export type RESTlerMethodPayload<Method extends RESTlerMethod = RESTlerMethod> =
  Method extends ('GET' | 'HEAD' | 'OPTIONS' | 'DELETE') ? { method: Method }
    : RESTlerContentTypePayload & { method: Method } extends infer M
      ? { [K in keyof M]: M[K] }
    : never;
