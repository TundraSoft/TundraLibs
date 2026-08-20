/**
 * @fileoverview {@link RapidRouteEntry} — a registered route — stored by the
 * app, consumed by HTTPTransport.
 *
 * @module
 */

import type { HTTPMethod } from '@tundralibs/compat/http';
import type { RapidHTTPHandler } from './HTTPHandler.ts';
import type { RapidHTTPMiddleware } from './HTTPMiddleware.ts';
import type { RapidContextState } from './context/State.ts';

/** A registered route — stored by the app, consumed by HTTPTransport. */
export type RapidRouteEntry<S extends RapidContextState = RapidContextState> = {
  method: HTTPMethod;
  /** The radrouter-native path as registered (`/users/:id:`). */
  path: string;
  /** Route-scoped middleware (base-typed), running INSIDE the app onion. */
  middlewares: RapidHTTPMiddleware[];
  handler: RapidHTTPHandler<S>;
  /**
   * Version label, a dimension SEPARATE from `path` (radrouter's own
   * concept — see `RadRouter.addRoute`). Omitted = the unversioned
   * slot; a request's inbound version resolves exact → default →
   * unversioned.
   */
  version?: string;
};
