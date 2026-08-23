/**
 * @fileoverview The binder factories — `bind:` entries for the route/
 * command/job decorators. Each factory returns a pure
 * {@link RapidBinder} DESCRIPTOR (source + optional validator); the
 * generic parameter it carries is what types the decorated method's
 * corresponding PARAMETER, so the bind tuple and the method signature
 * are checked against each other at the `@` site. Extraction and
 * validation execute at mount time (module tier), never here.
 *
 * These descriptors are also the raw material for generated OpenAPI
 * documentation later — declare intent, not mechanics.
 *
 * @module
 */

import type {
  RapidBinder,
  RapidContextPaging,
  RapidContextQuery,
  RapidSchema,
} from '../types/mod.ts';
import type { SOCKETConnection } from '../context/mod.ts';
import type { RapidSession } from '../middlewares/session.ts';

/**
 * Bind one invocation param (`ctx.args.params[name]`): a route param
 * on HTTP, a frame-payload key on SOCKET, a job-args key on JOB.
 * Without a validator the parameter is PINNED to `string` (the HTTP
 * route case) — the overload split is deliberate: it stops contextual
 * inference from silently flexing an unvalidated binder to whatever
 * type the method parameter claims. Pass a guardian schema (or any
 * function) to coerce/narrow.
 */
export function param(name: string): RapidBinder<string>;
export function param<T>(
  name: string,
  validate: (value: unknown) => T | Promise<T>,
): RapidBinder<T>;
export function param(
  name: string,
  validate?: (value: unknown) => unknown,
): RapidBinder<unknown> {
  return { source: 'param', name, validate };
}

/**
 * Bind the invocation payload (`await ctx.payload` — parsed HTTP body,
 * raw socket frame value; jobs have none). Without a validator the
 * parameter is PINNED to `unknown` — a typed payload parameter must
 * earn its type through a validator; the binder never just asserts
 * it. Exact off-HTTP semantics are settled in the modules round; the
 * descriptor shape is final.
 */
export function payload(): RapidBinder<unknown>;
export function payload<T>(
  validate: (value: unknown) => T | Promise<T>,
): RapidBinder<T>;
/**
 * Pass a schema OBJECT (`payload(UserSchema)`, anything with `.parse` —
 * a guardian schema) and the binder both validates the body AND documents
 * it: `buildOpenApi` emits the schema's `toOpenAPI()` as the request body.
 * `payload(Schema.parse)` still works but cannot document. This is the
 * ONLY binder that takes a schema object — the body is the one client-sent
 * value with a schema; context-derived binders never appear in OpenAPI.
 */
export function payload<T>(schema: RapidSchema<T>): RapidBinder<T>;
export function payload(
  arg?: ((value: unknown) => unknown) | RapidSchema,
): RapidBinder<unknown> {
  if (arg === undefined || typeof arg === 'function') {
    return { source: 'payload', validate: arg };
  }
  // Called as a method so a schema whose `parse` reads `this` keeps working.
  return {
    source: 'payload',
    validate: (value) => arg.parse(value),
    schema: arg,
  };
}

/**
 * Bind the parsed query (`ctx.args.query` — `$op` filters + sorting).
 * UNTRUSTED as-is: the validator is where the allowlist/re-casing
 * belongs. Without one the parameter is PINNED to the raw
 * {@link RapidContextQuery} shape.
 */
export function query(): RapidBinder<RapidContextQuery>;
export function query<T>(
  validate: (value: unknown) => T | Promise<T>,
): RapidBinder<T>;
export function query(
  validate?: (value: unknown) => unknown,
): RapidBinder<unknown> {
  return { source: 'query', validate };
}

/** Bind the resolved paging window (`ctx.args.paging` — always valid). */
export function paging(): RapidBinder<RapidContextPaging> {
  return { source: 'paging' };
}

/**
 * Bind one request header (HTTP; `null` when absent — off-HTTP
 * semantics are settled in the modules round). Without a validator
 * the parameter is PINNED to `string | null`.
 */
export function header(name: string): RapidBinder<string | null>;
export function header<T>(
  name: string,
  validate: (value: unknown) => T | Promise<T>,
): RapidBinder<T>;
export function header(
  name: string,
  validate?: (value: unknown) => unknown,
): RapidBinder<unknown> {
  return { source: 'header', name, validate };
}

/**
 * Bind one inbound cookie (HTTP; `null` when absent or off-HTTP). Without
 * a validator the parameter is PINNED to `string | null`. Mirrors
 * {@link header} — read from the parsed request cookies.
 */
export function cookie(name: string): RapidBinder<string | null>;
export function cookie<T>(
  name: string,
  validate: (value: unknown) => T | Promise<T>,
): RapidBinder<T>;
export function cookie(
  name: string,
  validate?: (value: unknown) => unknown,
): RapidBinder<unknown> {
  return { source: 'cookie', name, validate };
}

/**
 * Bind the per-invocation auth bag (`ctx.auth`; `undefined` until an auth
 * middleware sets it). Without a validator the parameter is PINNED to
 * `Record<string, unknown> | undefined`; pass one to narrow to your typed
 * principal (`auth(asUser)`).
 */
export function auth(): RapidBinder<Record<string, unknown> | undefined>;
export function auth<T>(
  validate: (value: unknown) => T | Promise<T>,
): RapidBinder<T>;
export function auth(
  validate?: (value: unknown) => unknown,
): RapidBinder<unknown> {
  return { source: 'auth', validate };
}

/**
 * Bind the request session (`getSession(ctx)`; `undefined` when the
 * {@link session} middleware is not installed or off-HTTP). Read/write it
 * in the method without touching `ctx`.
 */
export function session(): RapidBinder<RapidSession | undefined> {
  return { source: 'session' };
}

/**
 * Bind the socket connection envelope (`ctx.connection` — upgrade
 * identity). SOCKET-only by nature; off-socket behaviour is settled
 * in the modules round.
 */
export function connection(): RapidBinder<SOCKETConnection> {
  return { source: 'connection' };
}
