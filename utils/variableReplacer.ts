/**
 * Replaces template placeholders in the form `${key}` within a message string using values from a context object.
 *
 * This function provides a powerful templating system that supports:
 * - Simple variable substitution: `${name}`
 * - Nested object access with dot notation: `${user.profile.name}`
 * - Array formatting: `${items}` becomes `(item1, item2, item3)`
 * - Type coercion: all values are converted to strings
 * - Safe handling of missing values: unknown placeholders are left unchanged
 * - Circular reference detection to prevent infinite loops
 *
 * The context object is recursively flattened, so deeply nested properties
 * can be accessed using dot notation in placeholders.
 *
 * @param message - The template string containing placeholders to replace
 * @param context - An object containing the data to substitute into placeholders
 * @param regex - Optional custom regex for matching placeholders (default: `/\$\{([^}]+)\}/g`)
 * @returns The message string with all matched placeholders replaced by their corresponding values
 *
 * @throws {Error} When circular references are detected in the context object
 *
 * @example Basic usage:
 * ```typescript
 * const result = variableReplacer(
 *   "Hello ${name}!",
 *   { name: "World" }
 * );
 * console.log(result); // "Hello World!"
 * ```
 *
 * @example Nested object access:
 * ```typescript
 * const result = variableReplacer(
 *   "User: ${user.firstName} ${user.lastName} (${user.id})",
 *   {
 *     user: {
 *       firstName: "John",
 *       lastName: "Doe",
 *       id: 123
 *     }
 *   }
 * );
 * console.log(result); // "User: John Doe (123)"
 * ```
 *
 * @example Array handling:
 * ```typescript
 * const result = variableReplacer(
 *   "Available colors: ${colors}",
 *   { colors: ["red", "green", "blue"] }
 * );
 * console.log(result); // "Available colors: (red, green, blue)"
 * ```
 *
 * @example Mixed types and missing values:
 * ```typescript
 * const result = variableReplacer(
 *   "Count: ${count}, Active: ${active}, Missing: ${missing}",
 *   { count: 42, active: true }
 * );
 * console.log(result); // "Count: 42, Active: true, Missing: ${missing}"
 * ```
 *
 * @example Custom regex pattern:
 * ```typescript
 * const result = variableReplacer(
 *   "Hello {{name}}!",
 *   { name: "World" },
 *   /\{\{([^}]+)\}\}/g
 * );
 * console.log(result); // "Hello World!"
 * ```
 *
 * @example Error handling for circular references:
 * ```typescript
 * const obj: any = { a: {} };
 * obj.a.b = obj; // Creates circular reference
 *
 * try {
 *   variableReplacer("${a.b.a}", obj);
 * } catch (error) {
 *   console.log(error.message); // "Circular reference detected during variable replacement"
 * }
 * ```
 */
export const variableReplacer = (
  message: string,
  context: Record<string, unknown>,
  regex = /\$\{([^}]+)\}/g,
): string => {
  /**
   * Checks for circular references in an object and adds it to the visited set.
   *
   * @param obj - The object to check
   * @param visited - Set of already visited objects
   * @throws {Error} When a circular reference is detected
   */
  const checkCircularReference = (obj: unknown, visited: Set<object>): void => {
    if (typeof obj === 'object' && obj !== null) {
      if (visited.has(obj)) {
        throw new Error(
          'Circular reference detected during variable replacement',
        );
      }
      visited.add(obj);
    }
  };

  /**
   * Processes a single value during flattening, handling arrays and objects appropriately.
   *
   * @param value - The value to process
   * @param newKey - The key for this value in the flattened object
   * @param visited - Set of visited objects for circular reference detection
   * @returns An object containing the flattened key-value pairs for this value
   */
  const processValue = (
    value: unknown,
    newKey: string,
    visited: Set<object>,
  ): Record<string, unknown> => {
    // If value is an array, convert it to a string representation
    if (Array.isArray(value)) {
      return { [newKey]: `(${value.join(', ')})` };
    }

    // If value is a non-null object, recursively flatten it
    if (typeof value === 'object' && value !== null) {
      return flatten(value as Record<string, unknown>, newKey, visited);
    }

    // For primitive values, store directly
    return { [newKey]: value };
  };

  /**
   * Recursively flattens a nested object into a flat object with dot-notation keys.
   *
   * This function transforms nested objects like:
   * ```
   * { user: { profile: { name: "John" } } }
   * ```
   * Into flat objects like:
   * ```
   * { "user.profile.name": "John" }
   * ```
   *
   * @param obj - The object to flatten
   * @param parentKey - The current parent key path (used for recursion)
   * @param visited - Set of already visited objects to detect circular references
   * @returns A flattened object with dot-notation keys
   *
   * @throws {Error} When a circular reference is detected
   *
   * @example
   * ```typescript
   * const nested = { a: { b: { c: 42 } } };
   * const flat = flatten(nested);
   * // Result: { "a.b.c": 42 }
   * ```
   */
  const flatten = (
    obj: Record<string, unknown>,
    parentKey = '',
    visited = new Set<object>(),
  ): Record<string, unknown> => {
    // Check for circular references before processing
    checkCircularReference(obj, visited);

    const result: Record<string, unknown> = {};

    for (const key in obj) {
      if (Object.hasOwn(obj, key)) {
        const value = obj[key];
        const newKey = parentKey ? `${parentKey}.${key}` : key;

        // Process the value and merge results into our result object
        const processed = processValue(value, newKey, visited);
        Object.assign(result, processed);
      }
    }

    return result;
  };

  // Flatten the context object to enable dot-notation access
  const flattenedContext = flatten(context);

  // Replace all placeholders in the message with their corresponding values
  // If a placeholder key is not found, leave the placeholder unchanged
  return message.replace(regex, (match, key) => {
    const value = flattenedContext[key];
    if (value === undefined) {
      return match;
    }
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value);
    }
    return String(value);
  });
};
