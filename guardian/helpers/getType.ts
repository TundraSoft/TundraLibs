/**
 * Returns the type of a given value as a string
 *
 * @param value The value to determine the type of
 * @returns A string representing the type of the value ('array', 'Date', 'RegExp', 'null', 'string', 'number', 'boolean', 'bigint', 'function', 'undefined', 'object', or other type name)
 */
export const getType = (value: unknown): string => {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  if (value instanceof Date) {
    return 'Date';
  }

  if (value instanceof RegExp) {
    return 'RegExp';
  }

  const type = typeof value;

  switch (type) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    case 'bigint':
      return 'bigint';
    case 'function':
      return 'function';
    case 'undefined':
      return 'undefined';
    case 'object':
      return 'object';
    default:
      return type;
  }
};
