import type { ColumnIdentifier } from '../../types/mod.ts';

export const assertColumnIdentifier = (
  x: unknown,
  cols?: string[],
): x is ColumnIdentifier => {
  return typeof x === 'string' && // Must be a string
    x.startsWith('$') && // Should start with $
    x.length > 1 && // Should have more than 1 character
    x[1] !== '$' && // Should not be $$
    (!cols ||
      (cols.includes(x.substring(1)) ||
        cols.includes(x.replace('$MAIN.$', '')))); // If cols is provided, should be in cols (if not, ignore this check)
};
