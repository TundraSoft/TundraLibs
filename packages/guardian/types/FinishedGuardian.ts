import type { BaseGuardian } from '../BaseGuardian.ts';

/**
 * Methods stripped from {@link BaseGuardian} when it's narrowed to
 * {@link FinishedGuardian} — these are the chain-extension methods
 * that the runtime forbids after a finisher (`.optional()` /
 * `.nullable()`). Listing them here once keeps the narrowing in
 * sync with the runtime guards.
 */
type FinisherForbiddenMethods =
  | 'process'
  | 'test'
  | 'refine'
  | 'equals'
  | 'notEquals'
  | 'isIn'
  | 'isNotIn';

/**
 * Type returned by {@link BaseGuardian.optional} and
 * {@link BaseGuardian.nullable}. These methods are **finishers** —
 * once called, the validation chain is sealed and further
 * chain-extension methods (`process`, `test`, `equals`, …) are no
 * longer available at the type level.
 *
 * The runtime already throws on those calls; this type elevates the
 * rule to compile time so callers get the error before the schema
 * is ever exercised.
 *
 * Both finishers (`optional` + `nullable`) remain accessible so the
 * standard `.optional().nullable()` and `.nullable().optional()`
 * combinations still compose. Calling the same finisher twice still
 * throws at runtime — the type system can't catch that one without
 * splitting `FinishedGuardian` into more variants.
 *
 * Defined as `Omit<BaseGuardian<T>, …>` rather than a free-standing
 * shape so that TypeScript's class-nominal inference is preserved
 * for the kept methods (otherwise `T[K] extends FinishedGuardian<
 * infer U>` doesn't reliably narrow `U` from concrete subclasses
 * like `StringGuardian` / `NumberGuardian`).
 */
export type FinishedGuardian<T> = Omit<
  BaseGuardian<T>,
  FinisherForbiddenMethods
>;
