import { RESERVED_WORDS } from '../const/mod.ts';

/**
 * Validates that a string is a valid entity name
 *
 * Valid entity names:
 * - Can contain alphanumeric characters (a-z, A-Z, 0-9)
 * - Can contain underscores (_) and hyphens (-)
 * - Must start with a letter or underscore
 * - Cannot be a reserved SQL word
 *
 * @param name - The name to validate
 * @throws {TypeError} If the name is invalid
 */
export const assertEntityName: (name: unknown) => asserts name is string = (
  name: unknown,
): asserts name is string => {
  // Check if name is a string
  if (typeof name !== 'string') {
    throw new TypeError('Entity name must be a string');
  }

  // Check if name is empty
  if (!name.length) {
    throw new TypeError('Entity name cannot be empty');
  }

  // Check if name starts with a letter or underscore
  if (!/^[a-zA-Z_]/.test(name)) {
    throw new TypeError('Entity name must start with a letter or underscore');
  }

  // Check if name contains only valid characters
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new TypeError(
      'Entity name contains invalid characters - only alphanumeric, underscore, and hyphen are allowed',
    );
  }

  // Check if name is not a reserved SQL word (case-insensitive check)
  const upperCaseName = name.toUpperCase();
  if (RESERVED_WORDS.includes(upperCaseName)) {
    throw new TypeError('Entity name cannot be a reserved word');
  }
};
