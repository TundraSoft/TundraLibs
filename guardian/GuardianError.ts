import {
  BaseError,
  type BaseErrorJson,
  variableReplacer,
} from '@tundralibs/utils';

export type GuardianErrorMeta = {
  // Value got
  got?: unknown;
  // Expected value
  expected?: unknown;
  // Comparison type
  comparison?: string;
  // Used by array and object guardians to store the source of the error
  cause?: Record<string, GuardianError>;
};

export class GuardianError extends BaseError<GuardianErrorMeta> {
  protected override get _messageTemplate(): string {
    return '${message}';
  }

  constructor(
    meta:
      & GuardianErrorMeta
      & { cause?: [GuardianError] }
      & Record<string, unknown>,
    message?: string,
  ) {
    if (message === undefined) {
      if (meta.got !== undefined && meta.expected !== undefined) {
        message = `Expected value ${
          meta.comparison && meta.comparison.startsWith('not') ? 'not ' : ''
        }to be ${GuardianError.__formatValue(meta.expected)}, but got ${
          GuardianError.__formatValue(meta.got)
        }`;
      } else if (meta.expected !== undefined) {
        message = `Expected value to ${
          meta.comparison && meta.comparison.startsWith('not') ? 'not ' : ''
        }be ${
          GuardianError.__formatValue(
            meta.expected,
          )
        }`;
      } else if (meta.got) {
        message = `Unexpected value: ${GuardianError.__formatValue(meta.got)}`;
      } else {
        message = 'Validation failed';
      }
    }
    super(message!, meta);
  }

  get got(): string | undefined {
    return this.context.got
      ? GuardianError.__formatValue(this.context.got)
      : undefined;
  }

  get expected(): string | undefined {
    return this.context.expected
      ? GuardianError.__formatValue(this.context.expected)
      : undefined;
  }

  public override toJSON(): BaseErrorJson {
    let causeValue: Record<string, string> | undefined = undefined;

    if (this.context.cause) {
      // Loop through causes and convert them to JSON
      causeValue = {};
      for (const [key, error] of Object.entries(this.context.cause)) {
        causeValue[key] = error.message;
      }
    }

    return {
      name: this.name,
      message: this._baseMessage,
      context: this.context,
      timeStamp: this.timeStamp.toISOString(),
      stack: this.stack,
      causes: causeValue,
    };
  }
  public addCause(key: string, error: GuardianError): void {
    if (this.context.cause === undefined) {
      this.context.cause = {};
    }
    this.context.cause[key] = error;
  }

  public listCauses(): Array<string> {
    return this.context.cause ? Object.keys(this.context.cause) : [];
  }

  public causeSize(): number {
    return this.context.cause ? Object.keys(this.context.cause).length : 0;
  }

  private static __formatValue(value: unknown): string {
    if (Array.isArray(value)) {
      return `(${value.map((v) => GuardianError.__formatValue(v)).join(', ')})`;
    } else if (value instanceof Date) {
      return value.toISOString();
    } else if (value instanceof RegExp) {
      return value.toString();
    } else if (typeof value === 'object') {
      return JSON.stringify(value);
    } else if (value === undefined) {
      return 'undefined';
    } else if (value === null) {
      return 'null';
    } else if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    } else {
      return value.toString();
    }
  }

  protected override _makeMessage(): string {
    const vars = {
      ...this.context,
      timeStamp: this.timeStamp.toISOString(),
      message: this._baseMessage,
    };
    vars.got = GuardianError.__formatValue(this.context.got);
    vars.expected = GuardianError.__formatValue(this.context.expected);
    vars.message = variableReplacer(vars.message, vars);
    return variableReplacer(this._messageTemplate, vars);
  }
}
