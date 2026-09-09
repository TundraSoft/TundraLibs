/**
 * @fileoverview {@link RapidBinder} — one argument-binding descriptor:
 * WHERE a decorated method's parameter comes from, and how it is
 * validated on the way in.
 *
 * @module
 */

import type { RapidSchema } from './Schema.ts';

/** The extraction sources a binder can name. */
export type RapidBinderSource =
  | 'param'
  | 'payload'
  | 'query'
  | 'paging'
  | 'header'
  | 'cookie'
  | 'auth'
  | 'session'
  | 'connection'
  | 'config';

/**
 * One argument-binding descriptor, produced by the binder factories
 * (`param()`, `payload()`, `query()`, …). PURE DATA: the decorator
 * records it; extraction and validation run at MOUNT time, when the
 * module tier builds the per-transport closures. `T` is the value the
 * method parameter receives — the factories thread it so the bind
 * tuple drives the method's compile-time parameter types.
 */
export type RapidBinder<T = unknown> = {
  /** Where the value is extracted from. */
  source: RapidBinderSource;
  /** Key within the source (`param`/`header` need one). */
  name?: string;
  /**
   * Validator/transformer — a guardian schema or any function; its
   * return value IS what the method receives. Runs at mount-built
   * invocation time, never at decoration time.
   */
  validate?: (value: unknown) => T | Promise<T>;
  /**
   * The DOCUMENTATION half of a schema object passed to `payload(Schema)` —
   * read by the OpenAPI assembler for the request body, never at invocation
   * time. Only `payload` sets it: the body is the one client-sent value that
   * has a schema. Context-derived binders (`auth`, `session`, `cookie`,
   * `connection`, …) are not part of the request contract and never document.
   */
  schema?: Pick<RapidSchema, 'toOpenAPI' | 'toJSONSchema'>;
};
