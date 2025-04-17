import * as path from '$path';
import { variableReplacer } from './variableReplacer.ts';

export type BaseErrorJson = {
  name: string;
  message: string;
  context: Record<string, unknown>;
  timeStamp: string;
  stack?: string;
  cause?: BaseErrorJson | string | undefined;
} & Record<string, unknown>;

/**
 * BaseError is a simple class which extends the Error class and adds a few
 * additional properties and methods to it.
 */
export class BaseError<
  M extends Record<string, unknown> = Record<string, unknown>,
> extends Error {
  public readonly timeStamp: Date = new Date();
  declare public readonly context: M;
  protected _baseMessage: string = '';

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
   */
  protected get _messageTemplate(): string {
    return '[${timeStamp}] ${message}';
  }

  /**
   * Get a meta value by key.
   */
  public getContextValue<K extends keyof M>(key: K): M[K] {
    return this.context[key];
  }

  /**
   * Get the code snippet where the error occurred.
   *
   * @returns string The code snippet where the error occurred.
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

    const match = stackLine.match(
      /at\s+(?:[^@]*@)?(?:file:\/\/)?(.*):(\d+):(\d+)/i,
    );
    if (!match || !match[1] || !match[2]) {
      return 'Could not parse stack trace';
    }

    const [, filePath, lineStr] = match;
    try {
      const fileContent = Deno.readTextFileSync(path.toFileUrl(filePath));
      const lines = fileContent.split('\n');
      const errorLine = parseInt(lineStr, 10) - 1;
      if (isNaN(errorLine) || errorLine < 0) {
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
   * Get the root cause of the Error
   *
   * @returns string The root cause of the error
   */
  public getRootCause(): BaseError | Error {
    if (this.cause === undefined || this.cause === null) {
      return this;
    } else {
      return this.cause instanceof BaseError
        ? this.cause.getRootCause()
        : this.cause as Error;
    }
  }

  /**
   * Convert the error to a JSON object.
   *
   * @returns Record<string, unknown> The JSON representation of the error.
   */
  public toJSON(): BaseErrorJson {
    let causeValue: BaseErrorJson | string | undefined = undefined;

    if (this.cause) {
      causeValue = this.cause instanceof BaseError
        ? this.cause.toJSON()
        : String(this.cause);
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
   * Generate the actual error message as per the template
   *
   * @returns string The Actual error message as per template
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
