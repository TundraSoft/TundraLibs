import * as path from '$path';
import { variableReplacer } from './variableReplacer.ts';

/**
 * JSON representation of a BaseError instance.
 *
 * @template T - Additional properties that can be included in the JSON output
 *
 * @example
 * ```typescript
 * const errorJson: BaseErrorJson = {
 *   name: "ValidationError",
 *   message: "Invalid user input",
 *   context: { field: "email", value: "invalid-email" },
 *   timeStamp: "2023-06-26T10:30:00.000Z",
 *   stack: "Error: Invalid user input\n    at ...",
 *   cause: undefined
 * };
 * ```
 */
export type BaseErrorJson = {
  /** The name of the error class */
  name: string;
  /** The original error message before template processing */
  message: string;
  /** Context data associated with the error */
  context: Record<string, unknown>;
  /** ISO string representation of when the error occurred */
  timeStamp: string;
  /** Stack trace of the error (optional) */
  stack?: string;
  /** Nested cause error (optional) */
  cause?: BaseErrorJson | string;
} & Record<string, unknown>;

/**
 * BaseError is an enhanced Error class that provides additional functionality
 * for error handling, including context data, error chaining, message templating,
 * and code snippet extraction.
 *
 * @template M - Type of the context object, defaults to Record<string, unknown>
 *
 * Features:
 * - Context-aware error messages with variable substitution
 * - Error chaining with cause tracking
 * - Code snippet extraction from stack traces
 * - Customizable message templates
 * - JSON serialization support
 * - Root cause analysis
 *
 * @example Basic usage:
 * ```typescript
 * const error = new BaseError("User ${userId} not found", { userId: 123 });
 * console.log(error.message); // "[2023-06-26T10:30:00.000Z] User 123 not found"
 * ```
 *
 * @example With typed context:
 * ```typescript
 * interface UserContext {
 *   userId: number;
 *   action: string;
 * }
 *
 * const error = new BaseError<UserContext>(
 *   "User ${userId} failed ${action}",
 *   { userId: 123, action: "login" }
 * );
 * ```
 *
 * @example Error chaining:
 * ```typescript
 * const cause = new Error("Network timeout");
 * const error = new BaseError("Failed to fetch user data", { userId: 123 }, cause);
 * console.log(error.getRootCause()); // Returns the network timeout error
 * ```
 *
 * @example Custom error class:
 * ```typescript
 * class ValidationError extends BaseError<{ field: string; value: unknown }> {
 *   protected override get _messageTemplate(): string {
 *     return "VALIDATION ERROR: ${message} (Field: ${field})";
 *   }
 * }
 * ```
 */
export class BaseError<
  M extends Record<string, unknown> = Record<string, unknown>,
> extends Error {
  /** Timestamp when the error was created */
  public readonly timeStamp: Date = new Date();

  /** Context data associated with this error */
  declare public readonly context: M;

  /** The original message before template processing */
  protected _baseMessage: string = '';

  /**
   * Creates a new BaseError instance.
   *
   * @param message - The error message, supports variable substitution using ${key} syntax
   * @param context - Context object containing data for variable substitution and metadata
   * @param cause - Optional cause error for error chaining
   *
   * @example
   * ```typescript
   * // Simple error
   * const error = new BaseError("Something went wrong");
   *
   * // Error with context
   * const error = new BaseError(
   *   "User ${userId} not found in ${database}",
   *   { userId: 123, database: "users_db" }
   * );
   *
   * // Error with cause
   * const cause = new Error("Connection failed");
   * const error = new BaseError("Database operation failed", {}, cause);
   * ```
   */
  constructor(
    message: string,
    context: M = {} as M,
    cause?: Error,
  ) {
    message = variableReplacer(message, context);
    super(message);

    // Fix the prototype chain for Error subclassing
    Object.setPrototypeOf(this, new.target.prototype);

    this._baseMessage = message;
    this.name = this.constructor.name;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
    this.context = context;
    this.cause = cause;

    // Now format the message using the template method pattern
    this.message = this._makeMessage();
  }

  /**
   * Get the message template to use for this error.
   * Override this in derived classes to customize the template.
   *
   * The template supports variable substitution using ${key} syntax.
   * Available variables include:
   * - ${message} - The original error message
   * - ${timeStamp} - ISO timestamp when error occurred
   * - Any properties from the context object
   *
   * @returns The message template string
   *
   * @example
   * ```typescript
   * class CustomError extends BaseError {
   *   protected override get _messageTemplate(): string {
   *     return "ERROR [${timeStamp}]: ${message} | Context: ${userId}";
   *   }
   * }
   * ```
   */
  protected get _messageTemplate(): string {
    return '${message}';
  }

  /**
   * Get a specific context value by key with full type safety.
   *
   * @param key - The key of the context property to retrieve
   * @returns The value associated with the key, or undefined if not found
   *
   * @example
   * ```typescript
   * interface UserContext {
   *   userId: number;
   *   username: string;
   * }
   *
   * const error = new BaseError<UserContext>("Error", { userId: 123, username: "john" });
   * const userId = error.getContextValue("userId"); // Type: number
   * const missing = error.getContextValue("nonexistent"); // Type: undefined
   * ```
   */
  public getContextValue<K extends keyof M>(key: K): M[K] {
    return this.context[key];
  }

  /**
   * Get the code snippet where the error occurred.
   *
   * Extracts code from the file indicated in the stack trace and provides
   * context lines around the error location. If this error has a BaseError
   * cause, it will recursively get the snippet from the root cause.
   *
   * @param contextLines - Number of lines to show before and after the error line (default: 3)
   * @returns A formatted string showing the code snippet with line numbers and error indication
   *
   * @example
   * ```typescript
   * const error = new BaseError("Validation failed");
   * console.log(error.getCodeSnippet(2));
   * // Output:
   * //   12 | function validateUser(user) {
   * //   13 |   if (!user.email) {
   * // > 14 |     throw new BaseError("Email required");
   * //   15 |   }
   * //   16 | }
   * ```
   */
  public getCodeSnippet(contextLines: number = 3): string {
    if (this.cause instanceof BaseError) {
      return this.cause.getCodeSnippet(contextLines);
    }

    const stackTrace = this.cause ? (this.cause as Error).stack : this.stack;
    if (!stackTrace) {
      return 'No stack trace available';
    }

    const stackLines = stackTrace.split('\n');
    if (stackLines.length <= 1) {
      return 'Insufficient stack trace information';
    }

    const stackLine = stackLines[1]?.trim();
    if (!stackLine) {
      return 'Invalid stack trace format';
    }

    const regex = /at\s+(?:[^@]*@)?(?:file:\/\/)?(.*):(\d+):(\d+)/i;
    const match = regex.exec(stackLine);
    if (!match?.[1] || !match?.[2]) {
      return 'Could not parse stack trace';
    }

    const [, filePath, lineStr] = match;
    try {
      const fileContent = Deno.readTextFileSync(path.toFileUrl(filePath));
      const lines = fileContent.split('\n');
      const errorLine = Number.parseInt(lineStr, 10) - 1;
      if (Number.isNaN(errorLine) || errorLine < 0) {
        return 'Invalid line number in stack trace';
      }

      const startLine = Math.max(0, errorLine - contextLines);
      const endLine = Math.min(lines.length, errorLine + contextLines + 1);

      const snippet = lines.slice(startLine, endLine)
        .map((codeLine, index) => {
          const currentLine = startLine + index + 1;
          const lineIndicator = currentLine === errorLine + 1 ? '>' : ' ';
          return `${lineIndicator} ${
            currentLine.toString().padStart(4)
          } | ${codeLine}`;
        })
        .join('\n');

      return snippet.trim();
    } catch (error) {
      return `Could not fetch code snippet: ${(error as Error).message}`;
    }
  }

  /**
   * Get the root cause of the error by traversing the cause chain.
   *
   * Recursively follows the cause chain until it finds an error without
   * a cause, which is considered the root cause of the problem.
   *
   * @returns The root cause error (either this error if no cause, or the deepest cause)
   *
   * @example
   * ```typescript
   * const networkError = new Error("Connection timeout");
   * const dbError = new BaseError("Database query failed", {}, networkError);
   * const appError = new BaseError("User operation failed", {}, dbError);
   *
   * console.log(appError.getRootCause()); // Returns the networkError
   * console.log(appError.getRootCause().message); // "Connection timeout"
   * ```
   */
  public getRootCause(): this | Error {
    if (this.cause === undefined || this.cause === null) {
      return this;
    } else {
      return this.cause instanceof BaseError
        ? this.cause.getRootCause()
        : this.cause as Error;
    }
  }

  /**
   * Convert the error to a JSON object for serialization.
   *
   * Creates a plain object representation of the error that can be
   * safely serialized to JSON. Handles nested BaseError causes by
   * recursively converting them to JSON as well.
   *
   * @returns A JSON-serializable object containing all error information
   *
   * @example
   * ```typescript
   * const error = new BaseError(
   *   "User ${userId} not found",
   *   { userId: 123, action: "login" }
   * );
   *
   * const json = error.toJSON();
   * console.log(JSON.stringify(json, null, 2));
   * // {
   * //   "name": "BaseError",
   * //   "message": "User ${userId} not found",
   * //   "context": { "userId": 123, "action": "login" },
   * //   "timeStamp": "2023-06-26T10:30:00.000Z",
   * //   "stack": "BaseError: [2023-06-26T10:30:00.000Z] User 123 not found\n    at ...",
   * //   "cause": undefined
   * // }
   * ```
   */
  public toJSON(): BaseErrorJson {
    let causeValue: BaseErrorJson | string | undefined = undefined;

    if (this.cause) {
      if (this.cause instanceof BaseError) {
        causeValue = this.cause.toJSON();
      } else if (this.cause instanceof Error) {
        causeValue = `${this.cause.name}: ${this.cause.message}`;
      } else if (typeof this.cause === 'object') {
        causeValue = JSON.stringify(this.cause);
      } else {
        causeValue = String(this.cause);
      }
    }

    return {
      name: this.name,
      message: this._baseMessage,
      context: this.context,
      timeStamp: this.timeStamp.toISOString(),
      stack: this.stack,
      cause: causeValue,
    };
  }

  /**
   * Generate the actual error message using the template method pattern.
   *
   * Combines the context data with built-in variables (message, timeStamp)
   * and applies them to the message template using variable substitution.
   * This method is called automatically during construction and when the
   * message needs to be regenerated.
   *
   * @returns The formatted error message with all variables substituted
   *
   * @internal This is a protected method used internally by the class
   */
  protected _makeMessage(): string {
    const vars = {
      ...this.context,
      timeStamp: this.timeStamp.toISOString(),
      message: this._baseMessage,
    };
    return variableReplacer(this._messageTemplate, vars);
  }
}
