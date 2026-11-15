/**
 * Depth-first search for an expression node inside a filter or value.
 *
 * @module translator/findExpression
 */

/**
 * The `$$_expression` type of the first expression node in `value` that
 * `match` accepts, or `null` when there is none. Arrays and plain objects
 * are walked, nested expression arguments included; a `Date` is a value.
 */
export const findExpression = (
  value: unknown,
  match: (type: string) => boolean = () => true,
): string | null => {
  if (typeof value !== 'object' || value === null || value instanceof Date) {
    return null;
  }
  const type = (value as { $$_expression?: unknown }).$$_expression;
  if (typeof type === 'string' && match(type)) return type;
  for (const inner of Object.values(value)) {
    const found = findExpression(inner, match);
    if (found !== null) return found;
  }
  return null;
};
