/**
 * Metadata type for Guardian validators.
 * Used for documentation, introspection, and error messages.
 */
export type GuardianMetaData = {
  /** Human-readable description of what this guardian validates */
  description?: string;
  /** Short title for this guardian */
  title?: string;
  /** Array of example values that would pass validation */
  examples?: Array<unknown>;
  /** Whether this guardian is deprecated */
  deprecated?: boolean;
  /** Format identifier for OpenAPI schema generation */
  format?: string;
  /** Whether this guardian is async */
  isAsync?: boolean;
  /**
   * Set while the `isAsync` verdict above is **provisional**: a
   * `lazy()` thunk somewhere in this guardian's subtree wasn't
   * resolvable when the async probe last ran (the forward / mutual /
   * self reference `lazy()` exists for). Parents propagate it upward
   * and re-probe on every `metaData` read until it clears, which is
   * what makes `isAsync` correct for recursive schemas. Never emitted
   * into OpenAPI / JSON Schema.
   *
   * @internal
   */
  asyncPending?: boolean;
  /** Whether this guardian accepts null values */
  isNullable?: boolean;
  /** Whether this guardian has optional behavior */
  isOptional?: boolean;
  /** Whether `.optional(default)` carries a default value — container
   * guardians route ABSENT keys through the optional handler when set,
   * so the default fills for missing keys too. */
  hasDefault?: boolean;
  /**
   * Custom schema-emit overrides for guardians whose emitted
   * OpenAPI / JSON-Schema / Markdown can't be derived from `_type` +
   * metadata alone — `Guardian.intersection` (allOf), `.instanceof`
   * (className), `.never` (not), `.preprocess` (delegates to the inner
   * schema). Stored in metadata (rather than patched onto the instance)
   * so they survive `_cloneWith` — every chain op (`describe`,
   * `optional`, `clone`, …) reconstructs a fresh instance and would
   * otherwise drop instance-level method patches, collapsing the
   * emitted schema. `UnknownGuardian`'s emit methods consult this and
   * layer the current doc metadata (title / description) on top.
   *
   * @internal
   */
  schemaEmit?: {
    openAPI?: () => Record<string, unknown>;
    jsonSchema?: () => Record<string, unknown>;
    markdown?: () => string;
  };
} & Record<string, unknown>;
