/**
 * Replaces placeholders in the form ${key} within a message string using values from a context object.
 *
 * It flattens nested objects so that their properties can be referenced with "dot" notation, e.g., "user.profile.name".
 *
 * @param message - The string containing placeholders (e.g. "Hello ${user.firstName}").
 * @param context - An object whose properties should replace placeholders.
 * @param regex - The regular expression used to match placeholders in the message string.
 * @returns The message string with placeholders replaced by the corresponding context values.
 */
export const variableReplacer = (
  message: string,
  context: Record<string, unknown>,
  regex = /\$\{([^}]+)\}/g,
): string => {
  /**
   * Recursively flattens an object so that nested properties
   * become dot-delimited keys in the final result object.
   */
  const flatten = (
    obj: Record<string, unknown>,
    parentKey = '',
    visited = new Set<object>(),
  ): Record<string, unknown> => {
    // Detect circular references
    if (typeof obj === 'object' && obj !== null) {
      if (visited.has(obj)) {
        throw new Error(
          'Circular reference detected during variable replacement',
        );
      }
      visited.add(obj);
    }

    const result: Record<string, unknown> = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        const newKey = parentKey ? `${parentKey}.${key}` : key;

        // If value is an array, convert it to a string
        if (Array.isArray(value)) {
          result[newKey] = `(${value.join(', ')})`;
        } // If value is a non-null object, recurse deeper
        else if (typeof value === 'object' && value !== null) {
          const nested = flatten(
            value as Record<string, unknown>,
            newKey,
            visited,
          );
          Object.assign(result, nested);
        } // Otherwise, directly store the primitive value
        else {
          result[newKey] = value;
        }
      }
    }
    return result;
  };

  // Flatten the context to handle nested keys using dot-notation
  const flattenedContext = flatten(context);
  // Replace placeholders ${key} in the message string with the corresponding flattened values
  return message.replace(regex, (match, key) => {
    return flattenedContext[key] !== undefined
      ? String(flattenedContext[key])
      : match;
  });
};
