/**
 * Metadata type for Guardian validators.
 * Used for documentation, introspection, and error messages.
 *
 * @since 1.0.0
 */
export type GuardianMetaData = {
  /** Human-readable description of what this guardian validates */
  description: string;
  /** Short title for this guardian */
  title?: string;
  /** Array of example values that would pass validation */
  examples?: Array<unknown>;
  /** Whether this guardian is deprecated */
  deprecated?: boolean;
};
