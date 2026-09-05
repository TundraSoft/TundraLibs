/**
 * Framework middleware adapters for pact: drop-in authentication and
 * permission-guard handlers for express, fastify, oak, and hono, plus
 * the framework-neutral core (`extractCredential`, `failureResponse`)
 * that makes an adapter for any other stack a few lines of glue.
 *
 * @module
 */
export {
  DEFAULT_SCHEMES,
  extractCredential,
  failureResponse,
  NO_CREDENTIALS,
} from './shared.ts';
export {
  expressAuth,
  expressGuard,
  type PactExpressRequest,
  type PactExpressResponse,
} from './express.ts';
export {
  fastifyAuth,
  fastifyGuard,
  type PactFastifyReply,
  type PactFastifyRequest,
} from './fastify.ts';
export { oakAuth, oakGuard, type PactOakContext } from './oak.ts';
export { honoAuth, honoGuard, type PactHonoContext } from './hono.ts';
export type {
  PactMiddlewareOptions,
  PactMiddlewareRequest,
} from './types/mod.ts';
