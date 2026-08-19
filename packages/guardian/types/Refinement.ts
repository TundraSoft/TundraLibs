/**
 * A single refinement check consumed by
 * {@link BaseGuardian.superRefine}. Each entry pairs a predicate with
 * the human-readable message thrown on failure and an optional `path`
 * segment used to key the failure inside the aggregate error's cause
 * map (falling back to `refinement_N` when omitted).
 *
 * Generic over the guardian's OUTPUT type `T`, so the same shape drives
 * `.superRefine([...])` on every guardian — scalar or composite — not
 * just objects.
 *
 * @template T - The guardian's output type the validator receives.
 */
export type Refinement<T> = {
  /** Predicate; a truthy result passes, a falsy one fails. May be async. */
  validator: (data: T) => boolean | Promise<boolean>;
  /** Error message surfaced when the predicate fails. */
  message: string;
  /**
   * Optional path segment attached to the failure. Lands on the leaf
   * error's `path` and keys the failure inside the aggregate's cause
   * map; when omitted the aggregate falls back to `refinement_N`.
   */
  path?: string;
};
