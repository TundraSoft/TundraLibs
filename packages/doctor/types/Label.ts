/**
 * @fileoverview The typed label `Doctor.stock` registers under and
 * `inject(label)` resolves by.
 *
 * @module
 */

/**
 * A typed label for a stocked value: the **name** Doctor keys the
 * entry by, plus a compile-time-only record of what is stocked under
 * it. Create one with `label<T>(name)`; two labels with the same name
 * address the same entry.
 *
 * @typeParam T - Type of the stocked value. Phantom — carried by the
 *   type only, never present at runtime.
 */
export type Label<T = unknown> = {
  readonly name: string;
  /** Phantom carrier for `T`; exists in the type only, never set. */
  readonly __type?: T;
  /**
   * Keeps classes out: a constructor also carries a `.name`, but its
   * `prototype` can never be `never`. Exists in the type only.
   */
  readonly prototype?: never;
};
