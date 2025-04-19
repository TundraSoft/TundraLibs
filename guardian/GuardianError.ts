import { BaseError, variableReplacer } from '@tundralibs/utils';

export type GuardianErrorMeta = {
  // Value got
  got?: unknown;
  // Expected value
  expected?: unknown;
  // Comparison type
  comparison?: string;
  // Key (if in object or array)
  key?: string;
  // Path if part of nested object or array
  path?: string;
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
      let location = '';
      if (meta.path || meta.key) {
        location = meta.path && meta.key
          ? `${meta.path}.${meta.key}`
          : meta.path || meta.key || '';
      }
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
      message = `${message}${
        location.trim().length > 0 ? ` (at '${location}')` : ''
      }`;
    }
    super(message!, meta);
  }

  get path(): string | undefined {
    return this.context.path;
  }

  get key(): string | undefined {
    return this.context.key;
  }

  get location(): string | undefined {
    return this.context.path && this.context.key
      ? `${this.context.path}.${this.context.key}`
      : this.context.path || this.context.key;
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
