/**
 * Type utility that extracts variable names from a template string at compile time.
 *
 * This utility type uses template literal types to parse a string template
 * and extract all variable names that appear within `${...}` placeholders.
 * It provides full type safety by ensuring only actual variables from the
 * template can be used as keys in the values object.
 *
 * @template T - The template string literal type to analyze
 *
 * @example Basic variable extraction:
 * ```typescript
 * type Variables = ExtractVariableNames<'Hello, ${name}! Today is ${day}.'>;
 * // Result: 'name' | 'day'
 * ```
 *
 * @example Single variable:
 * ```typescript
 * type SingleVar = ExtractVariableNames<'Welcome ${user}!'>;
 * // Result: 'user'
 * ```
 *
 * @example No variables:
 * ```typescript
 * type NoVars = ExtractVariableNames<'Hello world!'>;
 * // Result: never
 * ```
 *
 * @example Complex variable names:
 * ```typescript
 * type ComplexVars = ExtractVariableNames<'${user.name} lives in ${user.address.city}'>;
 * // Result: 'user.name' | 'user.address.city'
 * ```
 */
type ExtractVariableNames<T extends string> = T extends
  `${infer _Start}\${${infer Var}}${infer Rest}`
  ? Var | ExtractVariableNames<Rest>
  : never;

/**
 * Type utility that creates a mapped type for template variable values.
 *
 * This utility type takes a template string and creates an object type
 * where each extracted variable name becomes a required string property.
 * This ensures type safety when providing values to the template parser.
 *
 * @template T - The template string literal type to create values for
 *
 * @example Basic usage:
 * ```typescript
 * type Values = TemplateValues<'Hello, ${name}! Today is ${day}.'>;
 * // Result: { name: string; day: string; }
 * ```
 *
 * @example Single variable:
 * ```typescript
 * type SingleValue = TemplateValues<'Welcome ${user}!'>;
 * // Result: { user: string; }
 * ```
 *
 * @example No variables:
 * ```typescript
 * type NoValues = TemplateValues<'Hello world!'>;
 * // Result: {} (empty object)
 * ```
 *
 * @example Nested property names:
 * ```typescript
 * type NestedValues = TemplateValues<'User: ${user.name}, Age: ${user.age}'>;
 * // Result: { "user.name": string; "user.age": string; }
 * ```
 */
type TemplateValues<T extends string> = {
  [K in ExtractVariableNames<T>]: string;
};

/**
 * Creates a type-safe template parser function that replaces variables in a template string.
 *
 * This function provides a powerful and type-safe templating system that:
 * - Extracts variable names from template strings at compile time
 * - Provides full TypeScript type safety for variable values
 * - Optimizes performance by pre-parsing templates
 * - Handles missing variables gracefully (replaces with empty string)
 * - Supports complex variable names including dots and special characters
 * - Returns optimized functions for templates without variables
 *
 * The function uses a two-phase approach:
 * 1. **Parse Phase**: Analyzes the template and extracts variables (done once)
 * 2. **Render Phase**: Replaces variables with provided values (done per render)
 *
 * @template T - The template string literal type (automatically inferred)
 * @param template - The template string containing variables in `${variable}` format
 * @returns A parser function that accepts values and returns the rendered string
 *
 * @example Basic usage:
 * ```typescript
 * const parser = templatize('Hello, ${name}!');
 * const result = parser({ name: 'Alice' });
 * console.log(result); // "Hello, Alice!"
 * ```
 *
 * @example Multiple variables:
 * ```typescript
 * const parser = templatize('Hello, ${name}! Today is ${day}.');
 * const result = parser({ name: 'Alice', day: 'Monday' });
 * console.log(result); // "Hello, Alice! Today is Monday."
 * ```
 *
 * @example Type safety:
 * ```typescript
 * const parser = templatize('User: ${userId}, Status: ${status}');
 *
 * // ✅ This works - all required variables provided
 * parser({ userId: '123', status: 'active' });
 *
 * // ❌ TypeScript error - missing 'status' property
 * parser({ userId: '123' });
 *
 * // ❌ TypeScript error - 'invalid' is not a valid variable
 * parser({ userId: '123', status: 'active', invalid: 'test' });
 * ```
 *
 * @example Templates without variables:
 * ```typescript
 * const parser = templatize('Hello, world!');
 * const result = parser({}); // No variables needed
 * console.log(result); // "Hello, world!"
 * ```
 *
 * @example Missing values (graceful handling):
 * ```typescript
 * const parser = templatize('Hello, ${name}!');
 * const result = parser({} as any); // Missing 'name'
 * console.log(result); // "Hello, !" (empty string substitution)
 * ```
 *
 * @example Complex variable names:
 * ```typescript
 * const parser = templatize('User: ${user.name}, Age: ${user-age}');
 * const result = parser({
 *   'user.name': 'John Doe',
 *   'user-age': '30'
 * });
 * console.log(result); // "User: John Doe, Age: 30"
 * ```
 *
 * @example Performance optimization:
 * ```typescript
 * // Parse once, use many times (recommended)
 * const parser = templatize('Status: ${status}');
 * const results = items.map(item => parser({ status: item.status }));
 *
 * // vs. parsing every time (not recommended)
 * const results = items.map(item =>
 *   templatize('Status: ${status}')({ status: item.status })
 * );
 * ```
 *
 * @example Adjacent variables:
 * ```typescript
 * const parser = templatize('Value: ${prefix}${suffix}');
 * const result = parser({ prefix: 'pre', suffix: 'fix' });
 * console.log(result); // "Value: prefix"
 * ```
 */
export const templatize = <T extends string>(
  template: T,
): (values: TemplateValues<T>) => string => {
  // Extract all variable placeholders from the template using regex
  // Matches patterns like ${variable}, ${user.name}, ${special-chars}, etc.
  const variables = template.match(/\${(.*?)}/g);

  if (!variables) {
    // Optimization: if no variables found, return a function that always returns the template
    // This avoids unnecessary processing for static templates
    return () => template;
  } else {
    // Return a parser function that replaces variables with provided values
    return (values: TemplateValues<T>): string =>
      variables.reduce((acc, variable) => {
        // Extract the variable name by removing ${ and } brackets
        const key = variable.slice(2, -1) as keyof TemplateValues<T>;
        // Replace the variable placeholder with the provided value
        // Use empty string as fallback for missing values (nullish coalescing)
        return acc.replace(variable, values[key] ?? '');
      }, template);
  }
};
