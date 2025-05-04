import type { ColumnIdentifier } from './column/mod.ts';

/**
 * All supported expression types that can be used in database queries
 * Grouped by the result type they produce
 */
export type Expression =
  // String Expressions
  | 'CONCAT'
  | 'DECRYPT'
  | 'ENCRYPT'
  | 'HASH'
  | 'LOWER'
  | 'REPLACE'
  | 'SUBSTR'
  | 'TRIM'
  | 'UPPER'
  | 'UUID'
  // Date Expressions
  | 'CURRENT_DATE'
  | 'CURRENT_TIME'
  | 'CURRENT_TIMESTAMP'
  | 'NOW'
  | 'DATE_ADD'
  // Number Expressions
  | 'DATE_DIFF'
  | 'ADD'
  | 'SUBTRACT'
  | 'MULTIPLY'
  | 'DIVIDE'
  | 'MODULO'
  | 'ABS'
  | 'CEIL'
  | 'FLOOR'
  | 'LENGTH'
  // JSON Expressions
  | 'JSON_VALUE';

/**
 * Base interface for all expression types
 * @template T - The specific expression type
 */
export type BaseExpression<T extends Expression = Expression> = {
  $expr: T;
};

//#region String Expressions
/**
 * Generates a new UUID as a string
 */
export type UUIDExpression = BaseExpression<'UUID'>;

/**
 * Concatenates multiple string values into a single string
 */
export type ConcatExpression = BaseExpression<'CONCAT'> & {
  $args: Array<string | ColumnIdentifier | StringExpression>;
};

/**
 * Encrypts a string value using the provided key
 */
export type EncryptExpression = BaseExpression<'ENCRYPT'> & {
  $args: [
    string | ColumnIdentifier | StringExpression,
    string | ColumnIdentifier | StringExpression,
  ];
};

/**
 * Decrypts an encrypted string value using the provided key
 */
export type DecryptExpression = BaseExpression<'DECRYPT'> & {
  $args: [
    string | ColumnIdentifier | StringExpression,
    string | ColumnIdentifier | StringExpression,
  ];
};

/**
 * Creates a hash of the input string
 */
export type HashExpression = BaseExpression<'HASH'> & {
  $args: string | ColumnIdentifier | StringExpression;
};

/**
 * Converts a string to lowercase
 */
export type LowerExpression = BaseExpression<'LOWER'> & {
  $args: string | ColumnIdentifier | StringExpression;
};

/**
 * Converts a string to uppercase
 */
export type UpperExpression = BaseExpression<'UPPER'> & {
  $args: string | ColumnIdentifier | StringExpression;
};

/**
 * Replaces all occurrences of a substring with another substring
 */
export type ReplaceExpression = BaseExpression<'REPLACE'> & {
  $args: [
    string | ColumnIdentifier | StringExpression,
    string | ColumnIdentifier | StringExpression,
    string | ColumnIdentifier | StringExpression,
  ];
};

/**
 * Extracts a substring from a string
 */
export type SubstrExpression = BaseExpression<'SUBSTR'> & {
  $args: [
    string | ColumnIdentifier | StringExpression,
    number | NumberExpression | ColumnIdentifier,
    number | NumberExpression | ColumnIdentifier | undefined,
  ];
};

/**
 * Removes leading and trailing whitespace from a string
 */
export type TrimExpression = BaseExpression<'TRIM'> & {
  $args: string | ColumnIdentifier | StringExpression;
};

/**
 * Union of all expression types that result in a string value
 */
export type StringExpression =
  | UUIDExpression
  | ConcatExpression
  | EncryptExpression
  | DecryptExpression
  | HashExpression
  | LowerExpression
  | UpperExpression
  | ReplaceExpression
  | SubstrExpression
  | TrimExpression;
//#endregion String Expressions

//#region Date Expressions
/**
 * Returns the current date
 */
export type CurrentDateExpression = BaseExpression<'CURRENT_DATE'>;

/**
 * Returns the current time
 */
export type CurrentTimeExpression = BaseExpression<'CURRENT_TIME'>;

/**
 * Returns the current timestamp (date and time)
 */
export type CurrentTimestampExpression = BaseExpression<'CURRENT_TIMESTAMP'>;

/**
 * Returns the current timestamp (alias for CURRENT_TIMESTAMP)
 */
export type NowExpression = BaseExpression<'NOW'>;

/**
 * Adds a specified time interval to a date
 */
export type DateAddExpression = BaseExpression<'DATE_ADD'> & {
  $args: [
    Date | ColumnIdentifier | DateExpression,
    number | NumberExpression,
  ];
};

/**
 * Union of all expression types that result in a date value
 */
export type DateExpression =
  | CurrentDateExpression
  | CurrentTimeExpression
  | CurrentTimestampExpression
  | NowExpression
  | DateAddExpression;
//#endregion Date Expressions

//#region Number Expressions
/**
 * Calculates the difference between two dates in the specified unit
 */
export type DateDiffExpression = BaseExpression<'DATE_DIFF'> & {
  $args: [
    'DAYS' | 'MONTHS' | 'YEARS' | 'HOURS' | 'MINUTES' | 'SECONDS',
    Date | ColumnIdentifier | DateExpression,
    Date | ColumnIdentifier | DateExpression,
  ];
};

/**
 * Adds multiple numeric values
 */
export type AddExpression = BaseExpression<'ADD'> & {
  $args: Array<number | bigint | ColumnIdentifier | NumberExpression>;
};

/**
 * Subtracts numeric values from the first value
 */
export type SubtractExpression = BaseExpression<'SUBTRACT'> & {
  $args: Array<number | bigint | ColumnIdentifier | NumberExpression>;
};

/**
 * Multiplies multiple numeric values
 */
export type MultiplyExpression = BaseExpression<'MULTIPLY'> & {
  $args: Array<number | bigint | ColumnIdentifier | NumberExpression>;
};

/**
 * Divides the first value by subsequent values
 */
export type DivideExpression = BaseExpression<'DIVIDE'> & {
  $args: Array<number | bigint | ColumnIdentifier | NumberExpression>;
};

/**
 * Calculates the remainder of division
 */
export type ModuloExpression = BaseExpression<'MODULO'> & {
  $args: Array<number | bigint | ColumnIdentifier | NumberExpression>;
};

/**
 * Returns the absolute value of a number
 */
export type AbsExpression = BaseExpression<'ABS'> & {
  $args: number | bigint | ColumnIdentifier | NumberExpression;
};

/**
 * Rounds a number up to the nearest integer
 */
export type CeilExpression = BaseExpression<'CEIL'> & {
  $args: number | bigint | ColumnIdentifier | NumberExpression;
};

/**
 * Rounds a number down to the nearest integer
 */
export type FloorExpression = BaseExpression<'FLOOR'> & {
  $args: number | bigint | ColumnIdentifier | NumberExpression;
};

/**
 * Returns the length of a string
 */
export type LengthExpression = BaseExpression<'LENGTH'> & {
  $args: string | ColumnIdentifier | StringExpression;
};

export type JSONExpression = BaseExpression<'JSON_VALUE'> & {
  $args: [ColumnIdentifier, string[]];
};

/**
 * Union of all expression types that result in a numeric value
 */
export type NumberExpression =
  | DateDiffExpression
  | AddExpression
  | SubtractExpression
  | MultiplyExpression
  | DivideExpression
  | ModuloExpression
  | AbsExpression
  | CeilExpression
  | FloorExpression
  | LengthExpression;
//#endregion Number Expressions

/**
 * Union of all expression types that can be used in queries
 */
export type Expressions = (
  | StringExpression
  | DateExpression
  | NumberExpression
  | JSONExpression
) extends infer O ? {
    [K in keyof O]: O[K];
  }
  : never;

/**
 * Type inference utility that maps expression types to the return type
 */
export type InferExpressionResultType<T extends Expressions> = T extends
  StringExpression ? string
  : T extends DateExpression ? Date
  : T extends NumberExpression ? number | bigint
  : T extends JSONExpression ? Record<string, unknown>
  : never;

/**
 * Helps in allowing correct Expression types for a column basis type
 */
export type ExpressionDefinition<
  P extends string | number | bigint | Date | boolean | unknown = unknown,
> = P extends string ? StringExpression
  : P extends (number | bigint) ? NumberExpression
  : P extends Date ? DateExpression
  : P extends Record<string, unknown> ? JSONExpression
  : Expressions;
