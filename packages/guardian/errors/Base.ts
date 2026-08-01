/**
 * @fileoverview Guardian error classes for validation failures.
 *
 * This module provides specialized error classes for Guardian validation failures.
 * Includes support for nested validation errors, cause tracking, and rich error context.
 *
 * @module
 */

import { BaseError, BaseErrorJson, variableReplacer } from '@tundralibs/utils';
import type { GuardianErrorMeta } from '../types/mod.ts';

export class GuardianError extends BaseError<GuardianErrorMeta> {
  protected override get _messageTemplate(): string {
    return '${message}';
  }

  constructor(
    message: string,
    meta: GuardianErrorMeta,
  ) {
    // Message must be passed
    super(message, meta);
  }

  public override toJSON<T extends BaseErrorJson = BaseErrorJson>(): T {
    let causeValue: Record<string, string> | undefined = undefined;

    if (this.context.cause) {
      // Loop through causes and convert them to JSON
      causeValue = {};
      for (const [key, error] of Object.entries(this.context.cause)) {
        // Redact each child against ITS OWN `got` — a child message may
        // embed the child's raw offending value (default validator
        // messages interpolate it), and that value can be a secret / PII.
        causeValue[key] = error.__redactMessage(error.message);
      }
    }
    return {
      name: this.name,
      // Redact the raw offending value out of the serialized message.
      // Many default validator messages interpolate `context.got`
      // (the raw received input) at construction time, so `_baseMessage`
      // can carry a secret / PII verbatim; strip it the same way
      // `context.got` is stripped below. The unredacted message stays
      // reachable in-memory via `error.message`.
      message: this.__redactMessage(this._baseMessage),
      // Emit a redacted view of the context — the raw offending value
      // (`context.got`) is kept out of the serialized form so secrets /
      // PII (passwords, tokens, request bodies) don't leak into logs or
      // error aggregators. The unredacted value is still reachable
      // in-memory via `error.context.got` for programmatic use.
      context: this.__redactedContext(),
      timeStamp: this.timeStamp.toISOString(),
      // The stack's first line repeats the message, so it needs the
      // same scrub. The frames below it are scanned too (a value can
      // appear in an inlined argument), but whole-token matching keeps
      // the scan from touching class names, the package name or file
      // paths — see `__redactMessage`.
      stack: this.stack === undefined
        ? this.stack
        : this.__redactMessage(this.stack),
      causes: causeValue,
    } as unknown as T;
  }

  /**
   * Strip this error's raw received value (`context.got`) out of a
   * free-form string (the message or the stack) so it can't leak
   * through the serialized form. Only string values are scrubbed —
   * they're the shape that can hold secrets / PII and the shape a
   * default message interpolates verbatim; scalars (numbers, booleans,
   * type-name markers stored as `typeof`) aren't sensitive and stay so
   * type diagnostics survive. Mirrors {@link __redactValue}'s rule for
   * `context.got`, keeping the message and the context consistent.
   *
   * **Whole-token matching only.** Default messages always embed the
   * value at a token boundary (`got r`, `Cannot coerce "t" to number`),
   * so an occurrence is replaced only when the characters on BOTH
   * sides are non-word (or it sits at a string edge). A blind
   * substring replace destroys the diagnostics it is meant to protect:
   * `got = 'a'` would shred `does not match pattern` into
   * `does not m[redacted…]tch p[redacted…]ttern`, corrupt
   * developer-authored constraint text (`isIn(['foo','bar'])` →
   * `ba[redacted…]`), and inflate the serialized stack ~3x by hitting
   * every `a` in `GuardianError`, the package name and the file paths.
   *
   * @internal
   */
  private __redactMessage(message: string): string {
    const got = this.context.got;
    if (typeof got !== 'string' || got.length === 0) return message;
    const marker = `[redacted string, length ${got.length}]`;
    let out = '';
    let copiedTo = 0;
    let idx = message.indexOf(got);
    while (idx !== -1) {
      const end = idx + got.length;
      if (
        !GuardianError.__isWordChar(message[idx - 1]) &&
        !GuardianError.__isWordChar(message[end])
      ) {
        out += message.slice(copiedTo, idx) + marker;
        copiedTo = end;
        idx = message.indexOf(got, end);
      } else {
        idx = message.indexOf(got, idx + 1);
      }
    }
    return copiedTo === 0 ? message : out + message.slice(copiedTo);
  }

  /**
   * Token-boundary test for {@link __redactMessage}. `undefined` (a
   * read past either end of the string) counts as a boundary.
   *
   * @internal
   */
  private static __isWordChar(char: string | undefined): boolean {
    return char !== undefined && /[\p{L}\p{N}_]/u.test(char);
  }

  /**
   * Build a copy of `context` safe to serialize. Only `got` (the raw
   * received value) is redacted — `expected`, `comparison`, `type`,
   * `path`, `arrayIndex` are developer-authored labels / structural
   * markers and stay intact. The `cause` map is preserved by reference
   * so nested {@link GuardianError}s serialise through their own
   * (redacting) `toJSON` when the whole tree is `JSON.stringify`d.
   *
   * @internal
   */
  private __redactedContext(): GuardianErrorMeta {
    const { got, cause, ...rest } = this.context;
    const redacted = {
      ...rest,
      got: GuardianError.__redactValue(got),
    } as GuardianErrorMeta;
    if (cause !== undefined) redacted.cause = cause;
    return redacted;
  }

  /**
   * Replace a raw received value with a type + size descriptor so it
   * never appears verbatim in serialized output. Strings and
   * structural containers (arrays / plain objects) are summarised —
   * these are the shapes that can hold secrets or PII. Scalar
   * primitives (number / boolean / bigint / null / undefined / symbol)
   * and the short type-name markers Guardian stores for type
   * mismatches pass through unchanged so type diagnostics survive;
   * `Date` is rendered as its ISO string (non-sensitive, useful).
   *
   * @internal
   */
  private static __redactValue(value: unknown): unknown {
    if (typeof value === 'string') {
      return `[redacted string, length ${value.length}]`;
    }
    if (Array.isArray(value)) {
      return `[redacted array, length ${value.length}]`;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (value !== null && typeof value === 'object') {
      return `[redacted object, ${Object.keys(value).length} key(s)]`;
    }
    return value;
  }

  public addCause(key: string, error: GuardianError): void {
    this.context.cause ??= {};
    this.context.cause[key] = error;
  }

  /**
   * Structured path from the validation root to this error's failure
   * site. Empty for root-level / un-tagged errors; populated by
   * composite guardians as the error bubbles up (via
   * {@link prependPath}).
   *
   * - String segments are object keys.
   * - Numeric segments are array / tuple / set / map-entry indices.
   *
   * @example
   * ```ts
   * const [err] = User.safeParse({ address: { zipCode: 42 } });
   * err.path;            // [] — top-level aggregate
   * err.context.cause?.address?.context.cause?.zipCode?.path;
   *                      // ['address', 'zipCode']
   * ```
   */
  get path(): ReadonlyArray<string | number> {
    return this.context.path ?? [];
  }

  /**
   * Prepend `segment` to this error's path and recurse into every
   * nested `cause` so that **all leaves carry absolute paths**. Cycle
   * detection prevents infinite recursion if a cause graph somehow
   * loops back on itself.
   *
   * Called by composite guardians (Object / Array / Tuple / Record /
   * Set / Map) as they catch a child error and re-throw / aggregate
   * it: each level prepends its own key or index.
   *
   * @returns This error, for chaining.
   */
  public prependPath(segment: string | number): this {
    this.__prependPathWithVisited(segment, new Set<GuardianError>());
    return this;
  }

  private __prependPathWithVisited(
    segment: string | number,
    visited: Set<GuardianError>,
  ): void {
    if (visited.has(this)) return;
    visited.add(this);
    this.context.path = [segment, ...(this.context.path ?? [])];
    if (this.context.cause) {
      for (const child of Object.values(this.context.cause)) {
        child.__prependPathWithVisited(segment, visited);
      }
    }
  }

  /**
   * Walk the error's `cause` tree and yield every **leaf** error
   * (one that has no further nested causes), each paired with its
   * absolute `path` from the root. The convenient surface for
   * form/API code that wants "here's every field that failed and
   * why".
   *
   * Leaves are yielded depth-first; cycle detection mirrors
   * {@link listCauses}.
   */
  public *leafErrors(): IterableIterator<
    { path: ReadonlyArray<string | number>; error: GuardianError }
  > {
    yield* this.__leafErrorsWithVisited(new Set<GuardianError>());
  }

  private *__leafErrorsWithVisited(
    visited: Set<GuardianError>,
  ): IterableIterator<
    { path: ReadonlyArray<string | number>; error: GuardianError }
  > {
    if (visited.has(this)) return;
    visited.add(this);
    const causes = this.context.cause;
    if (!causes || Object.keys(causes).length === 0) {
      yield { path: this.context.path ?? [], error: this };
      return;
    }
    for (const child of Object.values(causes)) {
      yield* child.__leafErrorsWithVisited(visited);
    }
  }

  public listCauses(): Record<string, string> {
    return this.__listCausesWithVisited(new Set());
  }

  private __listCausesWithVisited(
    visited: Set<GuardianError>,
  ): Record<string, string> {
    if (!this.context.cause || visited.has(this)) {
      return {};
    }

    // Add this error to visited set to prevent infinite recursion
    visited.add(this);

    const causes: Record<string, string> = {};
    for (const [key, error] of Object.entries(this.context.cause)) {
      if (visited.has(error)) {
        // Circular reference detected - just use the error message
        causes[key] = `${error.message} [circular]`;
      } else {
        const subCauses = error.__listCausesWithVisited(visited);
        if (Object.keys(subCauses).length === 0) {
          causes[key] = error.message;
        } else {
          for (const [subKey, subError] of Object.entries(subCauses)) {
            causes[`${key}.${subKey}`] = subError;
          }
        }
      }
    }

    // Remove this error from visited set when done (backtrack)
    visited.delete(this);
    return causes;
  }

  public causeSize(): number {
    return this.context.cause ? Object.keys(this.context.cause).length : 0;
  }

  private static __formatValue(value: unknown): string {
    if (Array.isArray(value)) {
      return `(${value.map((v) => GuardianError.__formatValue(v)).join(', ')})`;
    } else if (value instanceof Date) {
      return value.toISOString();
    } else if (value instanceof RegExp) {
      return value.toString();
    } else if (typeof value === 'object') {
      return JSON.stringify(value);
    } else if (value === undefined) {
      return 'undefined';
    } else if (value === null) {
      return 'null';
    } else if (typeof value === 'boolean') {
      return value === true ? 'TRUE' : 'FALSE';
    } else if (typeof value === 'bigint') {
      return value.toString() + 'n';
    } else {
      return value as string;
    }
  }

  protected override _makeMessage(): string {
    // Fast path: most Guardian error sites use a static message plus
    // structured context (the context is consumed by tooling /
    // `toJSON`, not interpolated). After BaseError's constructor has
    // run pass 1, `_baseMessage` has had its placeholders resolved.
    // If neither the base message nor the template wrapper carries
    // any further `${…}` placeholders, we can skip the two extra
    // variableReplacer passes and the two __formatValue calls
    // entirely — substantial win on the safeParse-on-failure path.
    const tpl = this._messageTemplate;
    const baseHasPlaceholder = this._baseMessage.includes('${');
    const tplIsTrivial = tpl === '${message}';
    if (!baseHasPlaceholder && tplIsTrivial) {
      return this._baseMessage;
    }

    const vars = {
      ...this.context,
      timeStamp: this.timeStamp.toISOString(),
      message: this._baseMessage,
    };
    // Only run Guardian-specific value formatting if a downstream
    // template references the placeholder. Saves the __formatValue
    // call when the message text doesn't interpolate the value.
    if (baseHasPlaceholder || tpl.includes('${got}')) {
      vars.got = GuardianError.__formatValue(this.context.got);
    }
    if (baseHasPlaceholder || tpl.includes('${expected}')) {
      vars.expected = GuardianError.__formatValue(this.context.expected);
    }
    if (baseHasPlaceholder) {
      vars.message = variableReplacer(vars.message, vars);
    }
    return tplIsTrivial ? vars.message : variableReplacer(tpl, vars);
  }
}
