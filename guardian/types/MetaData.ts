/**
 * Metadata type for Guardian validators.
 * Used for documentation, introspection, and error messages.
 *
 * @since 1.0.0
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
  /** Whether this guardian accepts null values */
  isNullable?: boolean;
  /** Whether this guardian has optional behavior */
  isOptional?: boolean;
  /** Whether this guardian is immutable */
  isImmutable?: boolean;
} & Record<string, unknown>;
