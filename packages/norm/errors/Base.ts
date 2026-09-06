/**
 * @module
 *
 * Base error class for `@tundralibs/norm`. Concrete norm errors
 * extend it; mirrors the pattern `@tundralibs/drivers` and the legacy
 * `@tundralibs/norm` package use so caller-side error handling looks
 * the same across packages.
 *
 * @since 1.0.0
 */

import { BaseError } from '@tundralibs/utils';
import type { NormErrorCode } from './NormErrorCodes.ts';

/**
 * Base error class for the norm package.
 *
 * @template M - Type of error metadata; defaults to a generic record.
 */
export class NormError<
  M extends Record<string, unknown> = Record<string, unknown>,
> extends BaseError<M> {
  /**
   * Stable, machine-readable {@link NormErrorCode} when the throw-site
   * set one on `context.code` — branch on this instead of parsing the
   * message. `undefined` when the site left it unset.
   */
  get code(): NormErrorCode | undefined {
    return (this.context as { code?: NormErrorCode }).code;
  }

  /**
   * The `name` of the `Norm` instance the error came from
   * (`context.norm`) — set by the throw site, or stamped by the `NormDb`
   * boundary the error crossed. `undefined` when no instance was in
   * play: definition errors from `Entity()` / `Schema()`, or a
   * hand-built runtime that gave no name.
   */
  get norm(): string | undefined {
    return (this.context as { norm?: string }).norm;
  }

  /**
   * Stamp `name` as the originating `Norm` when none is set, re-rendering
   * the message with the `[name]` prefix. Idempotent — the first stamp
   * wins, so an error tagged deep in the pipeline keeps that name when it
   * crosses an outer boundary. Returns `this` so a catch can
   * `throw err.tagNorm(name)`.
   *
   * @internal
   */
  public tagNorm(name: string): this {
    if (this.norm !== undefined) return this;
    (this.context as Record<string, unknown>).norm = name;
    this.message = this._makeMessage();
    return this;
  }

  /** `[<name>] <message>` once a `Norm` is known — the name is what
   * tells two instances in one process apart. */
  protected override get _messageTemplate(): string {
    return this.norm === undefined ? '${message}' : '[${norm}] ${message}';
  }
}
