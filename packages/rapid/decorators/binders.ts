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
} from '../types/mod.ts';
import type { SOCKETConnection } from '../context/mod.ts';

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
export function payload(
  validate?: (value: unknown) => unknown,
): RapidBinder<unknown> {
  return { source: 'payload', validate };
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
 * Bind the socket connection envelope (`ctx.connection` — upgrade
 * identity). SOCKET-only by nature; off-socket behaviour is settled
 * in the modules round.
 */
export function connection(): RapidBinder<SOCKETConnection> {
  return { source: 'connection' };
}
