/**
 * Framework middleware for pact: one factory per framework — express,
 * fastify, oak, hono — each returning `{ authenticate, authorize }` over
 * one instance and one options bag, plus the framework-neutral core
 * (`createPactMiddleware`, `extractCredential`, `failureResponse`) that
 * makes an adapter for any other stack a few lines of glue.
 *
 * @module
 */
export { createPactMiddleware } from './core.ts';
export {
  DEFAULT_SCHEMES,
  extractCredential,
  failureResponse,
  NO_CREDENTIALS,
  type PactMiddlewareConfig,
  resolveOptions,
} from './shared.ts';
export {
  compileTemplate,
  contentDigest,
  REQUEST_TEMPLATE,
  RESPONSE_TEMPLATE,
  type SignatureTemplate,
} from './template.ts';
export {
  expressPact,
  type PactExpressMiddleware,
  type PactExpressRequest,
  type PactExpressResponse,
} from './express.ts';
export {
  fastifyPact,
  type PactFastifyHook,
  type PactFastifyOnSend,
  type PactFastifyReply,
  type PactFastifyRequest,
} from './fastify.ts';
export { oakPact, type PactOakContext, type PactOakMiddleware } from './oak.ts';
export {
  honoPact,
  type PactHonoContext,
  type PactHonoMiddleware,
} from './hono.ts';
export type {
  PactMiddlewareCore,
  PactMiddlewareDenial,
  PactMiddlewareOptions,
  PactMiddlewareRequest,
  PactMiddlewareResponder,
  PactMiddlewareResponse,
  PactMiddlewareResponsePatch,
  PactMiddlewareVerdict,
} from './types/mod.ts';
