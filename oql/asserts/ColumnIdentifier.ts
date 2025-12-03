import type { ColumnIdentifier } from '../types/mod.ts';

/**
 * Asserts that a value is a valid ColumnIdentifier.
 * Throws an error if validation fails.
 *
 * Supported formats:
 * - `@columnName` - Direct column reference
 * - `@table.@column` - Table-qualified column reference
 * - `@table.@column.@jsonKey` - JSON path reference
 * - `@table.@column.@jsonKey.@subKey` - Nested JSON path reference
 * - And so on...
 *
 * Rules:
 * - Must start with `@`
 * - Each segment after a dot must start with `@`
 * - Segments must be valid identifiers (letters, numbers, underscores, not starting with a number)
 *
 * @param value - The string to assert
 * @param customMessage - Optional custom error message
 * @throws {TypeError} If value is not a valid ColumnIdentifier
 *
 * @example
 * ```typescript
 * assertColumnIdentifier('@id');                          // OK
 * assertColumnIdentifier('@users.@id');                   // OK
 * assertColumnIdentifier('@users.@profile.@email');       // OK
 * assertColumnIdentifier('@data.@settings.@theme.@dark'); // OK
 * assertColumnIdentifier('id');                           // Throws
 * assertColumnIdentifier('@table.id');                    // Throws - missing @ on segment
 * assertColumnIdentifier('@table.@');                     // Throws - empty segment
 * ```
 */
export function assertColumnIdentifier(
  value: string,
  customMessage?: string,
): asserts value is ColumnIdentifier {
  if (!value.startsWith('@')) {
    throw new TypeError(
      customMessage ??
        `Invalid ColumnIdentifier: "${value}". Must start with '@'`,
    );
  }

  // Split by dots and validate each segment
  const segments = value.split('.');

  for (const segment of segments) {
    if (!segment) {
      throw new TypeError(
        customMessage ??
          `Invalid ColumnIdentifier: "${value}". Empty segment found`,
      );
    }

    // Each segment must start with @
    if (!segment.startsWith('@')) {
      throw new TypeError(
        customMessage ?? `Invalid ColumnIdentifier: "${value}". ` +
            `Segment "${segment}" must start with '@'`,
      );
    }

    // Remove @ and validate the identifier
    const identifier = segment.slice(1);

    if (!identifier) {
      throw new TypeError(
        customMessage ?? `Invalid ColumnIdentifier: "${value}". ` +
            `Segment "${segment}" has empty identifier after '@'`,
      );
    }

    // Validate identifier: must start with letter or underscore, followed by alphanumeric or underscore
    const identifierPattern = /^[a-zA-Z_]\w*$/;
    if (!identifierPattern.test(identifier)) {
      throw new TypeError(
        customMessage ?? `Invalid ColumnIdentifier: "${value}". ` +
            `Segment "${segment}" contains invalid identifier "${identifier}". ` +
            `Must start with a letter or underscore, followed by letters, numbers, or underscores`,
      );
    }
  }
}
