/**
 * Extracts variable names from a template string.
 *
 * @template T - The template string type.
 * @example
 * type Variables = ExtractVariableNames<'Hello, ${name}! Today is ${day}.'>;
 * // Variables is 'name' | 'day'
 */
type ExtractVariableNames<T extends string> = T extends
  `${infer _Start}\${${infer Var}}${infer Rest}`
  ? Var | ExtractVariableNames<Rest>
  : never;

/**
 * Maps variable names to string values.
 *
 * @template T - The template string type.
 * @example
 * type Values = TemplateValues<'Hello, ${name}! Today is ${day}.'>;
 * // Values is { name: string; day: string; }
 */
type TemplateValues<T extends string> = {
  [K in ExtractVariableNames<T>]: string;
};

/**
 * Creates a template parser function that replaces variables in the template with provided values.
 *
 * @template T - The template string type.
 * @param {T} template - The template string containing variables in the format ${variable}.
 * @returns {(values: TemplateValues<T>) => string} A function that takes an object with variable values and returns the parsed string.
 *
 * @example
 * const template = 'Hello, ${name}! Today is ${day}.';
 * const parser = templateParser(template);
 * const result = parser({ name: 'Alice', day: 'Monday' });
 * console.log(result); // Output: Hello, Alice! Today is Monday.
 */
export const templatize = <T extends string>(
  template: T,
): (values: TemplateValues<T>) => string => {
  // Find all the variables in the template
  const variables = template.match(/\${(.*?)}/g);
  if (!variables) {
    return () => template;
  } else {
    // Create a function that replaces the variables with the values
    return (values: TemplateValues<T>): string =>
      variables.reduce((acc, variable) => {
        const key = variable.slice(2, -1) as keyof TemplateValues<T>;
        return acc.replace(variable, values[key] ?? '');
      }, template);
  }
};
