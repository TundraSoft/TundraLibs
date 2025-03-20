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
  protected _messageTemplate = '[${timeStamp}] ${message}';
  protected _baseMessage: string = '';

  constructor(
    message: string,
    context: M = {} as M,
    cause?: Error,
  ) {
    // Generate the error message
    super(
      variableReplacer(message, context),
    );
    // Pass the original message to super - we'll format it after child class initialization
    this._baseMessage = variableReplacer(message, context);
    this.name = this.constructor.name;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
    this.context = context;
    this.cause = cause;

    // Now format the message after child properties (like _messageTemplate) are initialized
    this.message = this._makeMessage();

    // Call onInit hook
    this.onInit();
  }

  /**
   * Call an onInit hook. This can be used to call any additional
   * operations, send the error event to an external service, etc.
   */
  public async onInit(): Promise<void> {
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
    const stackLines = (this.cause ? (this.cause as Error).stack : this.stack)
      ?.split('\n');
    let snippet = '';
    if (stackLines && stackLines.length > 1) {
      const match = stackLines[1]!.trim().match(
        // /at\s+(?:[^(\s]+ \()?file:\/\/(.*):(\d+):(\d+)/i,
        /at\s+(?:[^@]*\@)?(?:file:\/\/)?(.*):(\d+):(\d+)/i,
      );
      if (match) {
        const [, filePath, line] = match;
        try {
          const fileContent = Deno.readTextFileSync(path.toFileUrl(filePath!));
          const lines = fileContent.split('\n');
          const errorLine = parseInt(line!) - 1;
          const startLine = Math.max(0, errorLine - contextLines);
          const endLine = Math.min(lines.length, errorLine + contextLines + 1);

          snippet = lines.slice(startLine, endLine)
            .map((codeLine, index) => {
              const currentLine = startLine + index + 1;
              const lineIndicator = currentLine === errorLine + 1 ? '>' : ' ';
              return `${lineIndicator} ${
                currentLine.toString().padStart(4)
              } | ${codeLine}`;
            })
            .join('\n');
        } catch {
          // Unable to read file
          snippet = 'Could not fetch code snippet';
        }
      }
    }
    return snippet.trim();
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
    return {
      name: this.name,
      message: this._baseMessage,
      context: this.context,
      timeStamp: this.timeStamp.toISOString(),
      stack: this.stack,
      cause: this.cause
        ? this.cause instanceof BaseError
          ? this.cause.toJSON()
          : this.cause.toString()
        : undefined,
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
