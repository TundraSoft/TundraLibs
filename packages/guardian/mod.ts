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
 * // Safe parsing — returns a Go-style [error, data] tuple
 * const [err, data] = email.safeParse('JOHN@EXAMPLE.COM');
 * if (!err) {
 *   console.log(data); // 'john@example.com'
 * }
 * ```
 *
 * @module
 */

// Export main Guardian factory
export { Guardian } from './Guardian.ts';

// Base class for advanced usage / subclassing.
export { BaseGuardian } from './BaseGuardian.ts';

// Concrete guards (one per primitive / composite type).
export {
  ArrayGuardian,
  BigIntGuardian,
  BooleanGuardian,
  DateGuardian,
  DiscriminatedUnionGuardian,
  EnumGuardian,
  LazyGuardian,
  MapGuardian,
  NumberGuardian,
  ObjectGuardian,
  RecordGuardian,
  SetGuardian,
  StringGuardian,
  TupleGuardian,
  UnknownGuardian,
} from './guards/mod.ts';

// Error class.
export { GuardianError } from './errors/mod.ts';

// Type surface — single re-export site, all types live under ./types/.
export type {
  FinishedGuardian,
  GuardianErrorMeta,
  GuardianInfer,
  GuardianInferInput,
  GuardianMetaData,
  GuardianSafeParseResult,
  GuardianTransform,
  TupleOf,
} from './types/mod.ts';
