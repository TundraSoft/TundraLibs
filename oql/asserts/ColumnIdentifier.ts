import type { ColumnIdentifier } from '../types/mod.ts';

export const assertColumnIdentifier: (
  x: unknown,
  columnList?: string[],
) => asserts x is ColumnIdentifier = (
  x: unknown,
  columnList?: string[],
): asserts x is ColumnIdentifier => {
  if (typeof x !== 'string') {
    throw new TypeError(
      `Invalid ColumnIdentifier: Expected string, got ${typeof x}`,
    );
  }

  const parts = x.split('.');
  for (const part of parts) {
    // Should start with @
    if (!part.startsWith('@')) {
      throw new TypeError(
        `Invalid ColumnIdentifier: Segment "${part}" must start with '@'`,
      );
    }

    const identifier = part.slice(1); // Remove '@'

    if (identifier.trim().length === 0) {
      throw new TypeError(
        `Invalid ColumnIdentifier: Segment "${part}" has empty identifier after '@'`,
      );
    }
    // Match identifier pattern which is basically alphanumeric and underscores, starting with a letter or underscore
    const identifierPattern = /^[a-zA-Z_]\w*$/;
    if (!identifierPattern.test(identifier)) {
      throw new TypeError(
        `Invalid ColumnIdentifier: Segment "${part}" has invalid identifier "${identifier}"`,
      );
    }
  }
  if (columnList && columnList.length > 0) {
    const cleanColumn = parts.map((p) => p.slice(1)).join('.');
    if (!columnList.includes(cleanColumn)) {
      throw new TypeError(
        `ColumnIdentifier "${x}" is not in the provided column list`,
      );
    }
  }
};

export const isColumnIdentifier = (
  x: unknown,
  columnList?: string[],
): x is ColumnIdentifier => {
  try {
    assertColumnIdentifier(x, columnList);
    return true;
  } catch {
    return false;
  }
};
