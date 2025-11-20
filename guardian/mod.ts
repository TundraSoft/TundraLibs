/**
 * Guardian - A TypeScript validation library with fluent API.
 *
 * Guardian provides a Zod-like validation library with step-based validation,
 * type transformations, and comprehensive error handling.
 *
 * @example
 * ```ts
 * import { Guardian } from '@tundralibs/guardian';
 *
 * // Basic string validation
 * const name = Guardian.string().minLength(2).maxLength(50);
 *
 * // Number validation with transformations
 * const age = Guardian.number().positive().integer().max(120);
 *
 * // String to number transformation
 * const stringToNumber = Guardian.string().pattern(/^\d+$/).toNumber();
 *
 * // Complex validation pipeline
 * const email = Guardian.string()
 *   .trim()
 *   .toLowerCase()
 *   .email('Invalid email format');
 *
 * // Parse values
 * const validName = name.parse('John'); // 'John'
 * const validAge = age.parse(25); // 25
 * const convertedNumber = stringToNumber.parse('123'); // 123
 *
 * // Safe parsing
 * const result = email.safeParse('JOHN@EXAMPLE.COM');
 * if (result.success) {
 *   console.log(result.data); // 'john@example.com'
 * }
 * ```
 *
 * @module
 * @since 1.0.0
 */

// Export main Guardian factory
export { Guardian } from './Guardian.ts';

// Export base classes for advanced usage
export { BaseGuardian } from './BaseGuardian.ts';
export {
  ArrayGuardian,
  BigIntGuardian,
  BooleanGuardian,
  DateGuardian,
  EnumGuardian,
  NumberGuardian,
  ObjectGuardian,
  StringGuardian,
  UnknownGuardian,
} from './guards/mod.ts';

// Export error classes
export { GuardianError, type GuardianErrorMeta } from './GuardianError.ts';

// Export types
export type {
  GuardianInfer,
  GuardianInferInput,
  GuardianMetaData,
  GuardianSafeParseResult,
  GuardianTransform,
} from './types/mod.ts';
