import type { GuardianError } from '../errors/Base.ts';

/**
 * Metadata attached to every {@link GuardianError}. Populated by the
 * thrower; downstream consumers (form renderers, API error
 * serialisers, log pipelines) read these fields off
 * `error.context.*` without parsing the message string.
 */
export type GuardianErrorMeta = {
  /** Nested validation errors keyed by field name / index segment. */
  cause?: Record<string, GuardianError>;
  /** Category of failure — `'string'`, `'object'`, `'refinement_failure'`, … */
  type?: string;
  /** Actual value received. */
  got: unknown;
  /** Expected value or label. */
  expected?: unknown;
  /** Constraint name — `'type'`, `'min'`, `'max'`, `'pattern'`, … */
  comparison: string;
  /** When the failing value was an array element, its index. */
  arrayIndex?: number;
  /**
   * Structured path from the validation root to the failing value.
   * Populated by composite guardians (Object/Array/Tuple/Record/
   * Set/Map) as errors bubble up — each level prepends its key /
   * index. Leaves carry absolute paths; consumer code can read
   * `error.path` directly without walking the `cause` tree.
   *
   * String segments are object keys; numeric segments are array /
   * tuple / set / map-entry indices.
   */
  path?: ReadonlyArray<string | number>;
};
