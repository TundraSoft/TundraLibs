/**
 * @fileoverview Barrel for the pact auth adapter
 * (`@tundralibs/rapid/middlewares/pact`) — opt-in, deliberately separate
 * from `./middlewares` so importing the core middleware catalog never
 * pulls pact in. See `packages/rapid/DESIGN-Auth.md`.
 *
 * @module
 */

export { authenticate } from './authenticate.ts';
export { authorize } from './authorize.ts';
export {
  type PactApiKeySchemeOptions,
  type PactBasicSchemeOptions,
  type PactBearerSchemeOptions,
  type PactHmacSchemeOptions,
  type PactResolvedScheme,
  type PactScheme,
  type PactSchemeExtractor,
  type PactSchemeResponder,
  type PactTokenSchemeOptions,
} from './credentials.ts';
export { PACT, pact, type PactMiddlewareOptions } from './pact.ts';
