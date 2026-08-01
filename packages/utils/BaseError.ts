import { readTextFileSync } from '@tundralibs/compat/file';
import { variableReplacer } from './variableReplacer.ts';

/** JSON shape produced by {@link BaseError.toJSON}. */
export type BaseErrorJson = {
  name: string;
  /** Pre-template message — the raw string passed to the constructor (after context substitution). */
  message: string;
  /**
   * Fully-rendered message including any subclass-defined template
   * wrapping (`_messageTemplate`). Mirrors `error.message` at runtime —
   * exposed on the JSON form so downstream consumers don't have to
   * re-implement the template render.
   */
  formattedMessage: string;
  context: Record<string, unknown>;
  timeStamp: string;
  stack?: string;
  /** Recursive JSON for `BaseError` causes; `name: message` string for plain `Error`s. */
  cause?: BaseErrorJson | string;
} & Record<string, unknown>;

/**
 * `Error` subclass with: typed context, `${var}` substitution in
 * messages (via {@link variableReplacer}), JSON serialization, root-
 * cause traversal, and a `getCodeSnippet()` helper that reads the
 * file referenced in the stack trace.
 *
 * Subclasses override the {@link _messageTemplate} getter to wrap the
 * raw message in a fixed format (e.g. `"VALIDATION: ${message}"`).
 *
 * @typeParam M - Shape of the context record.
 *
 * @example
 * ```typescript
 * const e = new BaseError(
 *   'User ${id} not found',
 *   { id: 42 },
 *   networkError,
 * );
 * e.message;          // 'User 42 not found'
 * e.getRootCause();   // → networkError
 * ```
 */
export class BaseError<
  M extends Record<string, unknown> = Record<string, unknown>,
> extends Error {
  public readonly timeStamp: Date = new Date();
  declare public readonly context: M;
  /** Message after `${var}` substitution but before {@link _messageTemplate} wrapping. */
  protected _baseMessage: string = '';

  /**
   * @param message - Error text; `${ctxKey}` placeholders are substituted from `context`.
   * @param context - Values for substitution and to attach as `error.context`.
   * @param cause - Underlying error for chaining (walked by {@link getRootCause}).
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
   * Wrapping template applied to the raw message. Subclasses override
   * to inject a fixed prefix/suffix; supported variables are
   * `${message}`, `${timeStamp}`, and any key in `context`.
   */
  protected get _messageTemplate(): string {
    return '${message}';
  }

  /** Strongly-typed accessor for an entry in `context`. */
  public getContextValue<K extends keyof M>(key: K): M[K] {
    return this.context[key];
  }

  /**
   * Read the source file referenced in the stack trace and return
   * `±contextLines` lines around the throw site, with the offending
   * line marked `>`. Walks into a `BaseError` cause (so the deepest
   * source frame is shown).
   *
   * Returns a human-readable error string instead of throwing if the
   * stack can't be parsed or the file can't be read.
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
    // Match V8 (`at fn (file:///...:L:C)`), Deno (`at file:///...:L:C`),
    // and Bun (`at D:/...:L:C`) frame formats with one regex.
    const regex = /at\s+(?:.*?\s+\()?(?:file:\/\/\/?)?(.+?):(\d+):(\d+)\)?/i; // NOSONAR - complexity will be there.
    const match = regex.exec(stackLine);
    if (!match?.[1] || !match?.[2]) {
      return 'Could not parse stack trace';
    }
    const [, rawPath, lineStr] = match;
    try {
      let filePath = decodeURIComponent(rawPath);
      if (!filePath.startsWith('/') && !/^[A-Za-z]:/.test(filePath)) {
        filePath = '/' + filePath;
      }

      const errorLine = Number.parseInt(lineStr, 10) - 1;
      if (Number.isNaN(errorLine) || errorLine <= 0) {
        return 'Invalid line number in stack trace';
      }

      const fileContent = readTextFileSync(filePath);
      const lines = fileContent.split('\n');

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

  /** Walk `cause` chains and return the deepest error (or `this` if none). */
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
   * Plain {@link BaseErrorJson} for serialization. `BaseError` causes
   * are nested recursively; non-`BaseError` causes become a
   * `"Name: message"` string.
   */
  public toJSON<T extends BaseErrorJson = BaseErrorJson>(): T {
    let causeValue: T | string | undefined = undefined;

    if (this.cause) {
      if (this.cause instanceof BaseError) {
        causeValue = this.cause.toJSON<T>();
      } else if (this.cause instanceof Error) {
        causeValue = `${this.cause.name}: ${this.cause.message}`;
      } else {
        causeValue = JSON.stringify(this.cause);
      }
    }

    return {
      name: this.name,
      message: this._baseMessage,
      formattedMessage: this.message,
      context: this.context,
      timeStamp: this.timeStamp.toISOString(),
      stack: this.stack,
      cause: causeValue,
    } as T;
  }

  protected _makeMessage(): string {
    const vars = {
      ...this.context,
      timeStamp: this.timeStamp.toISOString(),
      message: this._baseMessage,
    };
    return variableReplacer(this._messageTemplate, vars);
  }
}
