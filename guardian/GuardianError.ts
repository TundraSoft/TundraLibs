import {
  BaseError,
  type BaseErrorJson,
  variableReplacer,
} from '@tundralibs/utils';

// export type GuardianErrorMetaType =
//   | 'string'
//   | 'number'
//   | 'boolean'
//   | 'array'
//   | 'object'
//   | 'null'
//   | 'undefined'
//   | 'function'
//   | 'bigint'
//   | 'symbol'
//   | 'Date'
//   | 'RegExp';

export type GuardianErrorMeta = {
  cause?: Record<string, GuardianError>; // Nested validation errors
  // meta info about this error
  type?: string; // string, number, boolean, array, object, etc.
  got: unknown; // Actual value received
  expected?: unknown; // Expected value/type
  comparison: string; // Type of validation (e.g., 'type', 'min', 'max')
};

export class GuardianError extends BaseError<GuardianErrorMeta> {
  protected override get _messageTemplate(): string {
    return '${message}';
  }

  constructor(
    message: string,
    meta: GuardianErrorMeta,
  ) {
    // Message must be passed
    super(message, meta);
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

  public listCauses(): Record<string, string> {
    if (!this.context.cause) {
      return {};
    }
    const causes: Record<string, string> = {};
    for (const [key, error] of Object.entries(this.context.cause)) {
      const subCauses = error.listCauses();
      if (Object.keys(subCauses).length === 0) {
        causes[key] = error.message;
      } else {
        for (const [subKey, subError] of Object.entries(subCauses)) {
          causes[`${key}.${subKey}`] = subError;
        }
      }
    }
    return causes;
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
      return value === true ? 'TRUE' : 'FALSE';
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
