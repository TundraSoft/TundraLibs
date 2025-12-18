import { FlattenEntity } from '@tundralibs/utils';
import { GetColumnByType, TableType } from './Common.ts';

/**
 * Time unit for date/time arithmetic operations.
 *
 * Used in DATE_ADD and DATE_DIFF expressions to specify the unit of time
 * for adding to or calculating differences between dates.
 */
export type TimeUnit =
  | 'DAYS'
  | 'MONTHS'
  | 'YEARS'
  | 'HOURS'
  | 'MINUTES'
  | 'SECONDS';

/**
 * Expression type names categorized by their return/output type.
 *
 * This allows filtering expressions by what type of value they produce,
 * useful for type-safe expression composition and validation.
 */
export type NumericExpressions =
  | 'ADD'
  | 'SUBTRACT'
  | 'MULTIPLY'
  | 'DIVIDE'
  | 'MODULO'
  | 'ABS'
  | 'CEIL'
  | 'FLOOR'
  | 'ROUND'
  | 'POWER'
  | 'SQRT'
  | 'SIGN'
  | 'LENGTH'
  | 'DATE_DIFF';

export type StringExpressions =
  | 'CONCAT'
  | 'LOWER'
  | 'UPPER'
  | 'TRIM'
  | 'LTRIM'
  | 'RTRIM'
  | 'SUBSTR'
  | 'REPLACE'
  | 'LPAD'
  | 'RPAD'
  | 'UUID';

export type DateExpressions =
  | 'NOW'
  | 'CURRENT_DATE'
  | 'CURRENT_TIME'
  | 'CURRENT_TIMESTAMP'
  | 'CURRENT_TIMESTAMPTZ'
  | 'DATE_ADD';

/**
 * Helper type to get expression types that return a specific value type.
 *
 * @template V - The value type to filter by (number, bigint, string, Date, etc.)
 *
 * @example
 * ```typescript
 * // Get only numeric expressions
 * type NumericOnly = GetExpressionByType<number | bigint>;
 * // Returns: 'ADD' | 'SUBTRACT' | 'MULTIPLY' | ... (all numeric operations)
 *
 * // Get only string expressions
 * type StringOnly = GetExpressionByType<string>;
 * // Returns: 'CONCAT' | 'LOWER' | 'UPPER' | ... (all string operations)
 *
 * // Get only date expressions
 * type DateOnly = GetExpressionByType<Date>;
 * // Returns: 'NOW' | 'CURRENT_DATE' | 'DATE_ADD' | ... (all date operations)
 * ```
 */
export type GetExpressionByType<V> = V extends number | bigint
  ? NumericExpressions
  : V extends string ? StringExpressions
  : V extends Date ? DateExpressions
  : never;

/**
 * Type-safe expression definitions for computed values in database queries.
 *
 * Expressions allow you to perform calculations, transformations, and operations
 * on data within queries. They can be used in:
 * - SELECT projections (calculated columns)
 * - WHERE clauses (computed conditions)
 * - ORDER BY (sort by computed values)
 * - UPDATE SET (computed updates)
 *
 * @template T - Table schema type
 * @template FT - Flattened table type with '@' prefix for column references
 *
 * ## Expression Categories
 *
 * ### Numeric Expressions (returns number/bigint)
 * - `ADD`: Sum multiple values
 * - `SUBTRACT`: Subtract values from first argument
 * - `MULTIPLY`: Multiply multiple values
 * - `DIVIDE`: Divide first value by second
 * - `MODULO`: Remainder of division
 * - `ABS`: Absolute value
 * - `CEIL`: Round up to nearest integer
 * - `FLOOR`: Round down to nearest integer
 * - `ROUND`: Round to nearest integer
 * - `POWER`: Exponentiation (base^exponent)
 * - `SQRT`: Square root
 * - `SIGN`: Sign of number (-1, 0, or 1)
 * - `LENGTH`: Get string length
 * - `DATE_DIFF`: Calculate difference between dates
 *
 * ### String Expressions (returns string)
 * - `CONCAT`: Concatenate strings
 * - `LOWER`: Convert to lowercase
 * - `UPPER`: Convert to uppercase
 * - `TRIM`: Remove leading and trailing whitespace
 * - `LTRIM`: Remove leading whitespace
 * - `RTRIM`: Remove trailing whitespace
 * - `SUBSTR`: Extract substring
 * - `REPLACE`: Find and replace text
 * - `LPAD`: Pad string on left to specified length
 * - `RPAD`: Pad string on right to specified length
 *
 * ### Date Expressions (returns Date)
 * - `NOW`: Current timestamp
 * - `CURRENT_DATE`: Current date
 * - `CURRENT_TIME`: Current time
 * - `CURRENT_TIMESTAMP`: Current timestamp (alias for NOW)
 * - `CURRENT_TIMESTAMPTZ`: Current timestamp with timezone (PostgreSQL)
 * - `DATE_ADD`: Add time interval to date
 *
 * ### Cryptographic Functions (Platform Dependent)
 * - `ENCRYPT`: Symmetric encryption
 * - `DECRYPT`: Symmetric decryption
 * - `HASH`: Cryptographic hashing
 *
 * ### Utility Functions
 * - `UUID`: Generate UUID v4
 * - `COALESCE`: Return first non-null value
 * - `NULLIF`: Return null if values are equal
 * - `CAST`: Convert between types
 *
 * ## Usage Examples
 *
 * ```typescript
 * // Arithmetic
 * const total: Expression = {
 *   type: 'ADD',
 *   args: ['@price', '@tax', '@shipping']
 * };
 *
 * // String manipulation
 * const fullName: Expression = {
 *   type: 'CONCAT',
 *   args: ['@firstName', ' ', '@lastName']
 * };
 *
 * // Date arithmetic
 * const futureDate: Expression = {
 *   type: 'DATE_ADD',
 *   unit: 'DAYS',
 *   args: { date: '@createdAt', amount: 30 }
 * };
 *
 * // Conditional
 * const displayName: Expression = {
 *   type: 'COALESCE',
 *   args: ['@nickname', '@firstName', 'Guest']
 * };
 * ```
 *
 * ## Database Compatibility
 *
 * Most expressions are supported across PostgreSQL, MariaDB, SQLite, and MongoDB.
 * The query builder will translate expressions to the appropriate syntax for each database.
 *
 * Platform-specific notes:
 * - ENCRYPT/DECRYPT/HASH: Limited support on SQLite and MongoDB (stores as-is)
 * - UUID: Generated by DAM for SQLite and MongoDB (not database-generated)
 * - CURRENT_TIMESTAMPTZ: PostgreSQL specific, translates to CURRENT_TIMESTAMP on others
 */
export type Expressions<
  T extends TableType = TableType,
  FT extends FlattenEntity<T, '', '@'> = FlattenEntity<T, '', '@'>,
> = {
  /** Addition: sum of all numeric arguments */
  type: 'ADD';
  args: Array<GetColumnByType<FT, number | bigint> | number | bigint>;
} | {
  /** Subtraction: subtract remaining arguments from first argument */
  type: 'SUBTRACT';
  args: Array<GetColumnByType<FT, number | bigint> | number | bigint>;
} | {
  /** Multiplication: product of all numeric arguments */
  type: 'MULTIPLY';
  args: Array<GetColumnByType<FT, number | bigint> | number | bigint>;
} | {
  /** Division: divide first argument by second argument */
  type: 'DIVIDE';
  args: Array<GetColumnByType<FT, number | bigint> | number | bigint>;
} | {
  /** Modulo: remainder after dividing first argument by second argument */
  type: 'MODULO';
  args: Array<GetColumnByType<FT, number | bigint> | number | bigint>;
} | {
  /** Absolute value: returns non-negative value of argument */
  type: 'ABS';
  args: Array<GetColumnByType<FT, number | bigint> | number | bigint>;
} | {
  /** Ceiling: rounds up to nearest integer */
  type: 'CEIL';
  args: Array<GetColumnByType<FT, number | bigint> | number | bigint>;
} | {
  /** Floor: rounds down to nearest integer */
  type: 'FLOOR';
  args: Array<GetColumnByType<FT, number | bigint> | number | bigint>;
} | {
  /** Round: rounds to nearest integer */
  type: 'ROUND';
  args: Array<GetColumnByType<FT, number | bigint> | number | bigint>;
} | {
  /** Power: raises base to the power of exponent (base^exponent) */
  type: 'POWER';
  args: {
    base: GetColumnByType<FT, number | bigint> | number | bigint;
    exponent: GetColumnByType<FT, number | bigint> | number | bigint;
  };
} | {
  /** Square root: returns the square root of argument */
  type: 'SQRT';
  args: Array<GetColumnByType<FT, number | bigint> | number | bigint>;
} | {
  /** Length: returns the number of characters in a string */
  type: 'LENGTH';
  args: GetColumnByType<FT, string> | string;
} | {
  /**
   * Date difference: calculates the difference between two dates in specified units.
   * Returns the number of complete time units between 'from' and 'to' dates.
   */
  type: 'DATE_DIFF';
  args: {
    from: GetColumnByType<FT, Date> | Date;
    to: GetColumnByType<FT, Date> | Date;
    unit: TimeUnit;
  };
} | {
  /**
   * Date addition: adds a specified number of time units to a date.
   * Can add or subtract (use negative amount) time from a date.
   */
  type: 'DATE_ADD';
  args: {
    date: GetColumnByType<FT, Date> | Date;
    amount: GetColumnByType<FT, number> | number;
    unit: TimeUnit;
  };
} | {
  /** Current timestamp: returns current date and time */
  type: 'NOW';
} | {
  /** Current date: returns current date without time component */
  type: 'CURRENT_DATE';
} | {
  /** Current time: returns current time without date component */
  type: 'CURRENT_TIME';
} | {
  /** Current timestamp: alias for NOW */
  type: 'CURRENT_TIMESTAMP';
} | {
  /**
   * Current timestamp with timezone: returns current timestamp with timezone info.
   * PostgreSQL specific - translates to CURRENT_TIMESTAMP on other databases.
   */
  type: 'CURRENT_TIMESTAMPTZ';
} | {
  /**
   * UUID generation: generates a UUID v4.
   * For SQLite and MongoDB, UUID is generated by DAM before query execution.
   */
  type: 'UUID';
} | {
  /** Concatenate: joins multiple strings together */
  type: 'CONCAT';
  args: Array<GetColumnByType<FT, string> | string>;
} | {
  /** Lowercase: converts string to lowercase */
  type: 'LOWER';
  args: GetColumnByType<FT, string> | string;
} | {
  /** Uppercase: converts string to uppercase */
  type: 'UPPER';
  args: GetColumnByType<FT, string> | string;
} | {
  /** Trim: removes leading and trailing whitespace */
  type: 'TRIM';
  args: GetColumnByType<FT, string> | string;
} | {
  /** Left trim: removes leading whitespace only */
  type: 'LTRIM';
  args: GetColumnByType<FT, string> | string;
} | {
  /** Right trim: removes trailing whitespace only */
  type: 'RTRIM';
  args: GetColumnByType<FT, string> | string;
} | {
  /**
   * Substring: extracts a portion of a string.
   * Start position is 0-based. Length is optional (extracts to end if omitted).
   */
  type: 'SUBSTR';
  args: {
    string: GetColumnByType<FT, string> | string;
    start: GetColumnByType<FT, number> | number;
    length?: GetColumnByType<FT, number> | number;
  };
} | {
  /**
   * Replace: finds all occurrences of search string and replaces with replacement string.
   */
  type: 'REPLACE';
  args: {
    string: GetColumnByType<FT, string> | string;
    search: GetColumnByType<FT, string> | string;
    replace: GetColumnByType<FT, string> | string;
  };
} | {
  /**
   * Left pad: pads string on the left to reach specified length.
   * Default fill character is space if not provided.
   */
  type: 'LPAD';
  args: {
    string: GetColumnByType<FT, string> | string;
    length: GetColumnByType<FT, number> | number;
    fill?: GetColumnByType<FT, string> | string;
  };
} | {
  /**
   * Right pad: pads string on the right to reach specified length.
   * Default fill character is space if not provided.
   */
  type: 'RPAD';
  args: {
    string: GetColumnByType<FT, string> | string;
    length: GetColumnByType<FT, number> | number;
    fill?: GetColumnByType<FT, string> | string;
  };
} | {
  /**
   * ENCRYPT - Symmetric encryption (platform dependent)
   *
   * Database support:
   * - PostgreSQL: Requires pgcrypto extension, uses AES encryption
   * - MariaDB: Native AES_ENCRYPT function
   * - SQLite: No built-in support, stores as-is without encryption
   * - MongoDB: No built-in support, stores as-is without encryption
   *
   * Note: For SQLite and MongoDB, implement application-level encryption
   * before passing data to DAM if encryption is required.
   */
  type: 'ENCRYPT';
  args: {
    secret: keyof FT | string;
    data: keyof FT | string | number | bigint | Date | boolean;
  };
} | {
  /**
   * DECRYPT - Symmetric decryption (platform dependent)
   *
   * Database support:
   * - PostgreSQL: Requires pgcrypto extension, uses AES decryption
   * - MariaDB: Native AES_DECRYPT function
   * - SQLite: No built-in support, returns value as-is
   * - MongoDB: No built-in support, returns value as-is
   *
   * Note: Only works on data encrypted by the corresponding database.
   */
  type: 'DECRYPT';
  args: {
    secret: keyof FT | string;
    data: keyof FT | string | number | bigint | Date | boolean;
  };
} | {
  /**
   * HASH - Cryptographic hashing (platform dependent)
   *
   * Database support:
   * - PostgreSQL: digest() function with configurable algorithm
   * - MariaDB: SHA2() function
   * - SQLite: No built-in support, stores as-is without hashing
   * - MongoDB: No built-in support, stores as-is without hashing
   *
   * Note: For SQLite and MongoDB, implement application-level hashing
   * before passing data to DAM if hashing is required.
   */
  type: 'HASH';
  args: keyof FT | string | number | bigint | Date | boolean;
} | {
  /**
   * Coalesce: returns the first non-null value from the list of arguments.
   * Useful for providing default values.
   */
  type: 'COALESCE';
  args: Array<keyof FT | string | number | bigint | Date | boolean | null>;
} | {
  /**
   * Null if: returns null if both arguments are equal, otherwise returns first argument.
   * Useful for converting specific values to null.
   */
  type: 'NULLIF';
  args: [
    keyof FT | string | number | bigint | Date | boolean,
    keyof FT | string | number | bigint | Date | boolean,
  ];
} | {
  /**
   * Cast: converts a value to a different type.
   * Supported target types: STRING, NUMBER, BIGINT, DATE, BOOLEAN
   */
  type: 'CAST';
  args: {
    value: keyof FT | string | number | bigint | Date | boolean;
    targetType: 'STRING' | 'NUMBER' | 'BIGINT' | 'DATE' | 'BOOLEAN';
  };
};
