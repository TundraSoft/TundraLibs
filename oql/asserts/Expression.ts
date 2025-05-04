import type {
  AbsExpression,
  AddExpression,
  BaseExpression,
  CeilExpression,
  ConcatExpression,
  CurrentDateExpression,
  CurrentTimeExpression,
  CurrentTimestampExpression,
  DateAddExpression,
  DateDiffExpression,
  DateExpression,
  DecryptExpression,
  DivideExpression,
  EncryptExpression,
  Expressions,
  FloorExpression,
  HashExpression,
  JSONExpression,
  LengthExpression,
  LowerExpression,
  ModuloExpression,
  MultiplyExpression,
  NowExpression,
  NumberExpression,
  ReplaceExpression,
  StringExpression,
  SubstrExpression,
  SubtractExpression,
  TrimExpression,
  UpperExpression,
  UUIDExpression,
} from '../types/mod.ts';
import { assertColumnIdentifier } from './Column.ts';

const expressions = [
  'UUID',
  'CONCAT',
  'ENCRYPT',
  'DECRYPT',
  'HASH',
  'LOWER',
  'UPPER',
  'REPLACE',
  'SUBSTR',
  'TRIM',
  'CURRENT_DATE',
  'CURRENT_TIME',
  'CURRENT_TIMESTAMP',
  'NOW',
  'DATE_ADD',
  'DATE_DIFF',
  'ADD',
  'SUBTRACT',
  'MULTIPLY',
  'DIVIDE',
  'MODULO',
  'ABS',
  'CEIL',
  'FLOOR',
  'LENGTH',
  'JSON_VALUE',
];

const assertBaseExpression: (x: unknown) => asserts x is BaseExpression = (
  x: unknown,
) => {
  if (x === null || typeof x !== 'object') {
    throw new TypeError('Expression must be an object with $expr property');
  }
  if (
    !('$expr' in x) || typeof x.$expr !== 'string' ||
    !expressions.includes(x.$expr)
  ) {
    throw new TypeError(
      `Expression must be an object with $expr property having one of the following values: ${
        expressions.join(
          ', ',
        )
      }`,
    );
  }
};

//#region String Expressions
export const assertUUIDExpression: (x: unknown) => asserts x is UUIDExpression =
  (
    x: unknown,
  ) => {
    assertBaseExpression(x);
    if (x.$expr !== 'UUID') {
      throw new TypeError(`Expected $expr to be 'UUID', but got ${x.$expr}`);
    }
    // Should not have any other properties
    if (Object.keys(x).length > 1) {
      throw new TypeError(
        `UUID expression should not have any other properties, but got ${
          Object.keys(
            x,
          ).join(', ')
        }`,
      );
    }
  };

export const assertConcatExpression: (
  x: unknown,
) => asserts x is ConcatExpression = (
  x: unknown,
) => {
  assertBaseExpression(x);
  if (x.$expr !== 'CONCAT') {
    throw new TypeError(`Expected $expr to be 'CONCAT', but got ${x.$expr}`);
  }
  if (!('$args' in x) || !Array.isArray(x.$args)) {
    throw new TypeError(
      `Expected $args to be an array`,
    );
  }
  for (const arg of x.$args) {
    if (typeof arg === 'string') {
      // Plain strings are valid for CONCAT
      if (arg.startsWith('$')) {
        try {
          assertColumnIdentifier(arg);
        } catch (e) {
          // Allow any string starting with $ as possible column reference
          // This might need refinement based on your exact column naming rules
          if (!arg.match(/^\$[a-zA-Z0-9_]+$/)) {
            throw e;
          }
        }
      }
      continue;
    }

    try {
      assertStringExpression(arg);
    } catch {
      throw new TypeError(
        `Expected $args to be an array of strings, column identifiers or string expressions for ${x.$expr}, but got ${typeof arg}`,
      );
    }
  }
};

export const assertEncryptExpression: (
  x: unknown,
) => asserts x is EncryptExpression = (
  x: unknown,
) => {
  assertBaseExpression(x);
  if (x.$expr !== 'ENCRYPT') {
    throw new TypeError(`Expected $expr to be 'ENCRYPT', but got ${x.$expr}`);
  }
  if (!('$args' in x) || !Array.isArray(x.$args) || x.$args.length !== 2) {
    throw new TypeError(`Expected $args to be an array with 2 elements`);
  }

  // Check each argument - they should be string, column identifier, or string expression
  for (const arg of x.$args) {
    if (typeof arg === 'string') continue;

    try {
      assertColumnIdentifier(arg);
    } catch {
      try {
        assertStringExpression(arg);
      } catch {
        throw new TypeError(
          `Expected $args to be string, column identifier, or string expression for ${x.$expr}`,
        );
      }
    }
  }
};

export const assertDecryptExpression: (
  x: unknown,
) => asserts x is DecryptExpression = (
  x: unknown,
) => {
  assertBaseExpression(x);
  if (x.$expr !== 'DECRYPT') {
    throw new TypeError(`Expected $expr to be 'DECRYPT', but got ${x.$expr}`);
  }
  if (!('$args' in x) || !Array.isArray(x.$args) || x.$args.length !== 2) {
    throw new TypeError(`Expected $args to be an array with 2 elements`);
  }

  // Check each argument - they should be string, column identifier, or string expression
  for (const arg of x.$args) {
    if (typeof arg === 'string') continue;

    try {
      assertColumnIdentifier(arg);
    } catch {
      try {
        assertStringExpression(arg);
      } catch {
        throw new TypeError(
          `Expected $args to be string, column identifier, or string expression for ${x.$expr}`,
        );
      }
    }
  }
};

/**
 * Asserts that the input is a valid HASH expression
 * @param x - The value to check
 * @throws {TypeError} If the value is not a valid HASH expression
 */
export const assertHashExpression: (x: unknown) => asserts x is HashExpression =
  (
    x: unknown,
  ) => {
    assertBaseExpression(x);
    if (x.$expr !== 'HASH') {
      throw new TypeError(`Expected $expr to be 'HASH', but got ${x.$expr}`);
    }
    if (!('$args' in x)) {
      throw new TypeError(`Expected $args to be defined`);
    }

    const arg = x.$args;
    if (typeof arg === 'string') return;

    try {
      assertColumnIdentifier(arg);
    } catch {
      try {
        assertStringExpression(arg);
      } catch {
        throw new TypeError(
          `Expected $args to be string, column identifier, or string expression for ${x.$expr}`,
        );
      }
    }
  };

/**
 * Asserts that the input is a valid LOWER expression
 * @param x - The value to check
 * @throws {TypeError} If the value is not a valid LOWER expression
 */
export const assertLowerExpression: (
  x: unknown,
) => asserts x is LowerExpression = (
  x: unknown,
) => {
  assertBaseExpression(x);
  if (x.$expr !== 'LOWER') {
    throw new TypeError(`Expected $expr to be 'LOWER', but got ${x.$expr}`);
  }
  if (!('$args' in x)) {
    throw new TypeError(`Expected $args to be defined`);
  }

  const arg = x.$args;
  if (typeof arg === 'string') return;

  try {
    assertColumnIdentifier(arg);
  } catch {
    try {
      assertStringExpression(arg);
    } catch {
      throw new TypeError(
        `Expected $args to be string, column identifier, or string expression for ${x.$expr}`,
      );
    }
  }
};

/**
 * Asserts that the input is a valid UPPER expression
 * @param x - The value to check
 * @throws {TypeError} If the value is not a valid UPPER expression
 */
export const assertUpperExpression: (
  x: unknown,
) => asserts x is UpperExpression = (
  x: unknown,
) => {
  assertBaseExpression(x);
  if (x.$expr !== 'UPPER') {
    throw new TypeError(`Expected $expr to be 'UPPER', but got ${x.$expr}`);
  }
  if (!('$args' in x)) {
    throw new TypeError(`Expected $args to be defined`);
  }

  const arg = x.$args;
  if (typeof arg === 'string') return;

  try {
    assertColumnIdentifier(arg);
  } catch {
    try {
      assertStringExpression(arg);
    } catch {
      throw new TypeError(
        `Expected $args to be string, column identifier, or string expression for ${x.$expr}`,
      );
    }
  }
};

export const assertReplaceExpression: (
  x: unknown,
) => asserts x is ReplaceExpression = (
  x: unknown,
) => {
  assertBaseExpression(x);
  if (x.$expr !== 'REPLACE') {
    throw new TypeError(`Expected $expr to be 'REPLACE', but got ${x.$expr}`);
  }
  if (!('$args' in x) || !Array.isArray(x.$args) || x.$args.length !== 3) {
    throw new TypeError(`Expected $args to be an array with 3 elements`);
  }

  // Check each argument - they should be string, column identifier, or string expression
  for (const arg of x.$args) {
    if (typeof arg === 'string') continue;

    try {
      assertColumnIdentifier(arg);
    } catch {
      try {
        assertStringExpression(arg);
      } catch {
        throw new TypeError(
          `Expected $args to be string, column identifier, or string expression for ${x.$expr}`,
        );
      }
    }
  }
};

export const assertSubstrExpression: (
  x: unknown,
) => asserts x is SubstrExpression = (
  x: unknown,
) => {
  assertBaseExpression(x);
  if (x.$expr !== 'SUBSTR') {
    throw new TypeError(`Expected $expr to be 'SUBSTR', but got ${x.$expr}`);
  }
  if (
    !('$args' in x) || !Array.isArray(x.$args) || x.$args.length < 2 ||
    x.$args.length > 3
  ) {
    throw new TypeError(`Expected $args to be an array with 2 or 3 elements`);
  }

  // First arg should be string, column identifier, or string expression
  const firstArg = x.$args[0];
  if (typeof firstArg !== 'string') {
    try {
      assertColumnIdentifier(firstArg);
    } catch {
      try {
        assertStringExpression(firstArg);
      } catch {
        throw new TypeError(
          `Expected first argument to be string, column identifier, or string expression for ${x.$expr}`,
        );
      }
    }
  }

  // Second and third args should be number, column identifier, or number expression
  for (let i = 1; i < x.$args.length; i++) {
    const arg = x.$args[i];
    if (arg === undefined && i === 2) continue; // Third arg can be undefined

    if (typeof arg !== 'number') {
      try {
        assertColumnIdentifier(arg);
      } catch {
        try {
          assertNumberExpression(arg);
        } catch {
          throw new TypeError(
            `Expected argument ${
              i + 1
            } to be number, column identifier, or number expression for ${x.$expr}`,
          );
        }
      }
    }
  }
};

/**
 * Asserts that the input is a valid TRIM expression
 * @param x - The value to check
 * @throws {TypeError} If the value is not a valid TRIM expression
 */
export const assertTrimExpression: (x: unknown) => asserts x is TrimExpression =
  (
    x: unknown,
  ) => {
    assertBaseExpression(x);
    if (x.$expr !== 'TRIM') {
      throw new TypeError(`Expected $expr to be 'TRIM', but got ${x.$expr}`);
    }
    if (!('$args' in x)) {
      throw new TypeError(`Expected $args to be defined`);
    }

    const arg = x.$args;
    if (typeof arg === 'string') return;

    try {
      assertColumnIdentifier(arg);
    } catch {
      try {
        assertStringExpression(arg);
      } catch {
        throw new TypeError(
          `Expected $args to be string, column identifier, or string expression for ${x.$expr}`,
        );
      }
    }
  };

export const assertStringExpression: (
  x: unknown,
) => asserts x is StringExpression = (x: unknown) => {
  assertBaseExpression(x);
  switch (x.$expr) {
    case 'UUID':
      assertUUIDExpression(x);
      break;
    case 'CONCAT':
      assertConcatExpression(x);
      break;
    case 'ENCRYPT':
      assertEncryptExpression(x);
      break;
    case 'DECRYPT':
      assertDecryptExpression(x);
      break;
    case 'HASH':
      assertHashExpression(x);
      break;
    case 'LOWER':
      assertLowerExpression(x);
      break;
    case 'UPPER':
      assertUpperExpression(x);
      break;
    case 'REPLACE':
      assertReplaceExpression(x);
      break;
    case 'SUBSTR':
      assertSubstrExpression(x);
      break;
    case 'TRIM':
      assertTrimExpression(x);
      break;
    default:
      throw new TypeError(
        `Unknown string expression type: ${(x as BaseExpression).$expr}`,
      );
  }
};
//#endregion String Expressions

//#region Date Expressions
export const assertCurrentDateExpression: (
  x: unknown,
) => asserts x is CurrentDateExpression = (
  x: unknown,
) => {
  assertBaseExpression(x);
  if (x.$expr !== 'CURRENT_DATE') {
    throw new TypeError(
      `Expected $expr to be 'CURRENT_DATE', but got ${x.$expr}`,
    );
  }
  // Should not have any other properties
  if (Object.keys(x).length > 1) {
    throw new TypeError(
      `CURRENT_DATE expression should not have any other properties, but got ${
        Object.keys(x).join(', ')
      }`,
    );
  }
};

export const assertCurrentTimeExpression: (
  x: unknown,
) => asserts x is CurrentTimeExpression = (
  x: unknown,
) => {
  assertBaseExpression(x);
  if (x.$expr !== 'CURRENT_TIME') {
    throw new TypeError(
      `Expected $expr to be 'CURRENT_TIME', but got ${x.$expr}`,
    );
  }
  // Should not have any other properties
  if (Object.keys(x).length > 1) {
    throw new TypeError(
      `CURRENT_TIME expression should not have any other properties, but got ${
        Object.keys(x).join(', ')
      }`,
    );
  }
};

export const assertCurrentTimestampExpression: (
  x: unknown,
) => asserts x is CurrentTimestampExpression = (
  x: unknown,
) => {
  assertBaseExpression(x);
  if (x.$expr !== 'CURRENT_TIMESTAMP') {
    throw new TypeError(
      `Expected $expr to be 'CURRENT_TIMESTAMP', but got ${x.$expr}`,
    );
  }
  // Should not have any other properties
  if (Object.keys(x).length > 1) {
    throw new TypeError(
      `CURRENT_TIMESTAMP expression should not have any other properties, but got ${
        Object.keys(x).join(', ')
      }`,
    );
  }
};

export const assertNowExpression: (x: unknown) => asserts x is NowExpression = (
  x: unknown,
) => {
  assertBaseExpression(x);
  if (x.$expr !== 'NOW') {
    throw new TypeError(`Expected $expr to be 'NOW', but got ${x.$expr}`);
  }
  // Should not have any other properties
  if (Object.keys(x).length > 1) {
    throw new TypeError(
      `NOW expression should not have any other properties, but got ${
        Object.keys(x).join(', ')
      }`,
    );
  }
};

export const assertDateAddExpression: (
  x: unknown,
) => asserts x is DateAddExpression = (
  x: unknown,
) => {
  assertBaseExpression(x);
  if (x.$expr !== 'DATE_ADD') {
    throw new TypeError(`Expected $expr to be 'DATE_ADD', but got ${x.$expr}`);
  }
  if (!('$args' in x) || !Array.isArray(x.$args) || x.$args.length !== 2) {
    throw new TypeError(`Expected $args to be an array with 2 elements`);
  }

  // First arg should be Date, column identifier, or date expression
  const firstArg = x.$args[0];
  if (!(firstArg instanceof Date)) {
    try {
      assertColumnIdentifier(firstArg);
    } catch {
      try {
        assertDateExpression(firstArg);
      } catch {
        throw new TypeError(
          `Expected first argument to be Date, column identifier, or date expression for ${x.$expr}`,
        );
      }
    }
  }

  // Second arg should be number or number expression
  const secondArg = x.$args[1];
  if (typeof secondArg !== 'number') {
    try {
      assertNumberExpression(secondArg);
    } catch {
      throw new TypeError(
        `Expected second argument to be number or number expression for ${x.$expr}`,
      );
    }
  }
};

export const assertDateExpression: (x: unknown) => asserts x is DateExpression =
  (
    x: unknown,
  ) => {
    assertBaseExpression(x);
    switch (x.$expr) {
      case 'CURRENT_DATE':
        assertCurrentDateExpression(x);
        break;
      case 'CURRENT_TIME':
        assertCurrentTimeExpression(x);
        break;
      case 'CURRENT_TIMESTAMP':
        assertCurrentTimestampExpression(x);
        break;
      case 'NOW':
        assertNowExpression(x);
        break;
      case 'DATE_ADD':
        assertDateAddExpression(x);
        break;
      default:
        throw new TypeError(
          `Unknown date expression type: ${(x as BaseExpression).$expr}`,
        );
    }
  };
//#endregion Date Expressions

//#region Number Expressions
export const assertDateDiffExpression: (
  x: unknown,
) => asserts x is DateDiffExpression = (
  x: unknown,
) => {
  assertBaseExpression(x);
  if (x.$expr !== 'DATE_DIFF') {
    throw new TypeError(`Expected $expr to be 'DATE_DIFF', but got ${x.$expr}`);
  }
  if (!('$args' in x) || !Array.isArray(x.$args) || x.$args.length !== 3) {
    throw new TypeError(`Expected $args to be an array with 3 elements`);
  }

  // First arg should be a unit string
  const validUnits = ['DAYS', 'MONTHS', 'YEARS', 'HOURS', 'MINUTES', 'SECONDS'];
  if (typeof x.$args[0] !== 'string' || !validUnits.includes(x.$args[0])) {
    throw new TypeError(
      `Expected first argument to be one of ${validUnits.join(', ')}, but got ${
        x.$args[0]
      }`,
    );
  }

  // Second and third args should be Date, column identifier, or date expression
  for (let i = 1; i <= 2; i++) {
    const arg = x.$args[i];
    if (arg instanceof Date) continue;

    if (typeof arg === 'string' && arg.startsWith('$')) {
      try {
        assertColumnIdentifier(arg);
      } catch (e) {
        // Allow any string starting with $ as possible column reference
        if (!arg.match(/^\$[a-zA-Z0-9_]+$/)) {
          throw e;
        }
      }
      continue;
    }

    try {
      assertDateExpression(arg);
    } catch {
      throw new TypeError(
        `Expected argument ${
          i + 1
        } to be Date, column identifier, or date expression for ${x.$expr}`,
      );
    }
  }
};

/**
 * Asserts that the input is a valid ABS expression
 * @param x - The value to check
 * @throws {TypeError} If the value is not a valid ABS expression
 */
export const assertAbsExpression: (x: unknown) => asserts x is AbsExpression = (
  x: unknown,
) => {
  assertBaseExpression(x);
  if (x.$expr !== 'ABS') {
    throw new TypeError(`Expected $expr to be 'ABS', but got ${x.$expr}`);
  }
  if (!('$args' in x)) {
    throw new TypeError(`Expected $args to be defined`);
  }

  const arg = x.$args;
  if (typeof arg === 'number' || typeof arg === 'bigint') return;

  try {
    assertColumnIdentifier(arg);
  } catch {
    try {
      assertNumberExpression(arg);
    } catch {
      throw new TypeError(
        `Expected $args to be number, bigint, column identifier, or number expression for ${x.$expr}`,
      );
    }
  }
};

/**
 * Asserts that the input is a valid CEIL expression
 * @param x - The value to check
 * @throws {TypeError} If the value is not a valid CEIL expression
 */
export const assertCeilExpression: (x: unknown) => asserts x is CeilExpression =
  (
    x: unknown,
  ) => {
    assertBaseExpression(x);
    if (x.$expr !== 'CEIL') {
      throw new TypeError(`Expected $expr to be 'CEIL', but got ${x.$expr}`);
    }
    if (!('$args' in x)) {
      throw new TypeError(`Expected $args to be defined`);
    }

    const arg = x.$args;
    if (typeof arg === 'number' || typeof arg === 'bigint') return;

    try {
      assertColumnIdentifier(arg);
    } catch {
      try {
        assertNumberExpression(arg);
      } catch {
        throw new TypeError(
          `Expected $args to be number, bigint, column identifier, or number expression for ${x.$expr}`,
        );
      }
    }
  };

/**
 * Asserts that the input is a valid FLOOR expression
 * @param x - The value to check
 * @throws {TypeError} If the value is not a valid FLOOR expression
 */
export const assertFloorExpression: (
  x: unknown,
) => asserts x is FloorExpression = (
  x: unknown,
) => {
  assertBaseExpression(x);
  if (x.$expr !== 'FLOOR') {
    throw new TypeError(`Expected $expr to be 'FLOOR', but got ${x.$expr}`);
  }
  if (!('$args' in x)) {
    throw new TypeError(`Expected $args to be defined`);
  }

  const arg = x.$args;
  if (typeof arg === 'number' || typeof arg === 'bigint') return;

  try {
    assertColumnIdentifier(arg);
  } catch {
    try {
      assertNumberExpression(arg);
    } catch {
      throw new TypeError(
        `Expected $args to be number, bigint, column identifier, or number expression for ${x.$expr}`,
      );
    }
  }
};

/**
 * Asserts that the input is a valid LENGTH expression
 * @param x - The value to check
 * @throws {TypeError} If the value is not a valid LENGTH expression
 */
export const assertLengthExpression: (
  x: unknown,
) => asserts x is LengthExpression = (
  x: unknown,
) => {
  assertBaseExpression(x);
  if (x.$expr !== 'LENGTH') {
    throw new TypeError(`Expected $expr to be 'LENGTH', but got ${x.$expr}`);
  }
  if (!('$args' in x)) {
    throw new TypeError(`Expected $args to be defined`);
  }

  const arg = x.$args;
  if (typeof arg === 'string') return;

  try {
    assertColumnIdentifier(arg);
  } catch {
    try {
      assertStringExpression(arg);
    } catch {
      throw new TypeError(
        `Expected argument to be string, column identifier, or string expression for ${x.$expr}`,
      );
    }
  }
};

/**
 * Asserts that the input is a valid ADD expression
 * @param x - The value to check
 * @throws {TypeError} If the value is not a valid ADD expression
 */
export const assertAddExpression: (x: unknown) => asserts x is AddExpression = (
  x: unknown,
) => {
  assertBaseExpression(x);
  if (x.$expr !== 'ADD') {
    throw new TypeError(`Expected $expr to be 'ADD', but got ${x.$expr}`);
  }
  if (!('$args' in x) || !Array.isArray(x.$args) || x.$args.length < 2) {
    throw new TypeError(
      `Expected $args to be an array with at least 2 elements`,
    );
  }

  // Each arg should be number, bigint, column identifier, or number expression
  for (const arg of x.$args) {
    if (typeof arg === 'number' || typeof arg === 'bigint') continue;

    try {
      assertColumnIdentifier(arg);
    } catch {
      try {
        assertNumberExpression(arg);
      } catch {
        throw new TypeError(
          `Expected arguments to be number, bigint, column identifier, or number expression for ${x.$expr}`,
        );
      }
    }
  }
};

/**
 * Asserts that the input is a valid SUBTRACT expression
 * @param x - The value to check
 * @throws {TypeError} If the value is not a valid SUBTRACT expression
 */
export const assertSubtractExpression: (
  x: unknown,
) => asserts x is SubtractExpression = (
  x: unknown,
) => {
  assertBaseExpression(x);
  if (x.$expr !== 'SUBTRACT') {
    throw new TypeError(`Expected $expr to be 'SUBTRACT', but got ${x.$expr}`);
  }
  if (!('$args' in x) || !Array.isArray(x.$args) || x.$args.length < 2) {
    throw new TypeError(
      `Expected $args to be an array with at least 2 elements`,
    );
  }

  // Each arg should be number, bigint, column identifier, or number expression
  for (const arg of x.$args) {
    if (typeof arg === 'number' || typeof arg === 'bigint') continue;

    try {
      assertColumnIdentifier(arg);
    } catch {
      try {
        assertNumberExpression(arg);
      } catch {
        throw new TypeError(
          `Expected arguments to be number, bigint, column identifier, or number expression for ${x.$expr}`,
        );
      }
    }
  }
};

/**
 * Asserts that the input is a valid MULTIPLY expression
 * @param x - The value to check
 * @throws {TypeError} If the value is not a valid MULTIPLY expression
 */
export const assertMultiplyExpression: (
  x: unknown,
) => asserts x is MultiplyExpression = (
  x: unknown,
) => {
  assertBaseExpression(x);
  if (x.$expr !== 'MULTIPLY') {
    throw new TypeError(`Expected $expr to be 'MULTIPLY', but got ${x.$expr}`);
  }
  if (!('$args' in x) || !Array.isArray(x.$args) || x.$args.length < 2) {
    throw new TypeError(
      `Expected $args to be an array with at least 2 elements`,
    );
  }

  // Each arg should be number, bigint, column identifier, or number expression
  for (const arg of x.$args) {
    if (typeof arg === 'number' || typeof arg === 'bigint') continue;

    try {
      assertColumnIdentifier(arg);
    } catch {
      try {
        assertNumberExpression(arg);
      } catch {
        throw new TypeError(
          `Expected arguments to be number, bigint, column identifier, or number expression for ${x.$expr}`,
        );
      }
    }
  }
};

/**
 * Asserts that the input is a valid DIVIDE expression
 * @param x - The value to check
 * @throws {TypeError} If the value is not a valid DIVIDE expression
 */
export const assertDivideExpression: (
  x: unknown,
) => asserts x is DivideExpression = (
  x: unknown,
) => {
  assertBaseExpression(x);
  if (x.$expr !== 'DIVIDE') {
    throw new TypeError(`Expected $expr to be 'DIVIDE', but got ${x.$expr}`);
  }
  if (!('$args' in x) || !Array.isArray(x.$args) || x.$args.length < 2) {
    throw new TypeError(
      `Expected $args to be an array with at least 2 elements`,
    );
  }

  // Each arg should be number, bigint, column identifier, or number expression
  for (const arg of x.$args) {
    if (typeof arg === 'number' || typeof arg === 'bigint') continue;

    try {
      assertColumnIdentifier(arg);
    } catch {
      try {
        assertNumberExpression(arg);
      } catch {
        throw new TypeError(
          `Expected arguments to be number, bigint, column identifier, or number expression for ${x.$expr}`,
        );
      }
    }
  }
};

/**
 * Asserts that the input is a valid MODULO expression
 * @param x - The value to check
 * @throws {TypeError} If the value is not a valid MODULO expression
 */
export const assertModuloExpression: (
  x: unknown,
) => asserts x is ModuloExpression = (
  x: unknown,
) => {
  assertBaseExpression(x);
  if (x.$expr !== 'MODULO') {
    throw new TypeError(`Expected $expr to be 'MODULO', but got ${x.$expr}`);
  }
  if (!('$args' in x) || !Array.isArray(x.$args) || x.$args.length < 2) {
    throw new TypeError(
      `Expected $args to be an array with at least 2 elements`,
    );
  }

  // Each arg should be number, bigint, column identifier, or number expression
  for (const arg of x.$args) {
    if (typeof arg === 'number' || typeof arg === 'bigint') continue;

    try {
      assertColumnIdentifier(arg);
    } catch {
      try {
        assertNumberExpression(arg);
      } catch {
        throw new TypeError(
          `Expected arguments to be number, bigint, column identifier, or number expression for ${x.$expr}`,
        );
      }
    }
  }
};

export const assertNumberExpression: (
  x: unknown,
) => asserts x is NumberExpression = (
  x: unknown,
) => {
  assertBaseExpression(x);
  switch (x.$expr) {
    case 'DATE_DIFF':
      assertDateDiffExpression(x);
      break;
    case 'ADD':
      assertAddExpression(x);
      break;
    case 'SUBTRACT':
      assertSubtractExpression(x);
      break;
    case 'MULTIPLY':
      assertMultiplyExpression(x);
      break;
    case 'DIVIDE':
      assertDivideExpression(x);
      break;
    case 'MODULO':
      assertModuloExpression(x);
      break;
    case 'ABS':
      assertAbsExpression(x);
      break;
    case 'CEIL':
      assertCeilExpression(x);
      break;
    case 'FLOOR':
      assertFloorExpression(x);
      break;
    case 'LENGTH':
      assertLengthExpression(x);
      break;
    default:
      throw new TypeError(
        `Unknown number expression type: ${(x as BaseExpression).$expr}`,
      );
  }
};
//#endregion Number Expressions

//#region JSON Expressions
export const assertJSONExpression: (x: unknown) => asserts x is JSONExpression =
  (
    x: unknown,
  ) => {
    assertBaseExpression(x);
    if (x.$expr !== 'JSON_VALUE') {
      throw new TypeError(
        `Expected $expr to be 'JSON_VALUE', but got ${x.$expr}`,
      );
    }
    if (!('$args' in x) || !Array.isArray(x.$args) || x.$args.length !== 2) {
      throw new TypeError(`Expected $args to be an array with 2 elements`);
    }

    // First arg should be column identifier
    try {
      assertColumnIdentifier(x.$args[0]);
    } catch {
      throw new TypeError(
        `Expected first argument to be a column identifier for ${x.$expr}`,
      );
    }

    // Second arg should be string array
    if (
      !Array.isArray(x.$args[1]) ||
      !x.$args[1].every((item) => typeof item === 'string')
    ) {
      throw new TypeError(
        `Expected second argument to be an array of strings for ${x.$expr}`,
      );
    }
  };
//#endregion JSON Expressions

// Main expression assertion function
export const assertExpression: (x: unknown) => asserts x is Expressions = (
  x: unknown,
) => {
  assertBaseExpression(x);
  const expr = x as BaseExpression;

  switch (expr.$expr) {
    // String expressions
    case 'UUID':
    case 'CONCAT':
    case 'ENCRYPT':
    case 'DECRYPT':
    case 'HASH':
    case 'LOWER':
    case 'UPPER':
    case 'REPLACE':
    case 'SUBSTR':
    case 'TRIM':
      assertStringExpression(x);
      break;

    // Date expressions
    case 'CURRENT_DATE':
    case 'CURRENT_TIME':
    case 'CURRENT_TIMESTAMP':
    case 'NOW':
    case 'DATE_ADD':
      assertDateExpression(x);
      break;

    // Number expressions
    case 'DATE_DIFF':
    case 'ADD':
    case 'SUBTRACT':
    case 'MULTIPLY':
    case 'DIVIDE':
    case 'MODULO':
    case 'ABS':
    case 'CEIL':
    case 'FLOOR':
    case 'LENGTH':
      assertNumberExpression(x);
      break;

    // JSON expressions
    case 'JSON_VALUE':
      assertJSONExpression(x);
      break;

    default:
      throw new TypeError(`Unknown expression type: ${expr.$expr}`);
  }
};
