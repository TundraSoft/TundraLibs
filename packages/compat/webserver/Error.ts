/**
 * @fileoverview Error hierarchy for the cross-runtime HTTP server.
 * All extend {@link CompatError} and serialize via `toJSON()`.
 *
 * @module
 */

import type { ServerMode } from './types/mod.ts';
import { CompatError } from '../Error.ts';

/**
 * Base class for server errors. Carries the server `mode` and the
 * `operation` (e.g. `'start'`, `'stop'`, `'CONFIGURATION'`,
 * `'PERMISSION'`) that triggered the failure.
 */
export class ServerError extends CompatError {
  public readonly operation: string;
  /** `'N/A'` when the failure is mode-independent (e.g. invalid mode itself). */
  public readonly mode: ServerMode | 'N/A';

  constructor(
    message: string,
    mode: ServerMode | 'N/A',
    operation: string,
    cause?: Error,
  ) {
    super(message, cause);
    this.mode = mode;
    this.operation = operation;
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  override toJSON(): Record<string, unknown> {
    const base = super.toJSON();
    return {
      ...base,
      mode: this.mode,
      operation: this.operation,
    };
  }
}

/** Thrown when an op needs the server running but it isn't (e.g. `stop()` on a stopped server). */
export class ServerNotRunningError extends ServerError {
  constructor(mode: ServerMode, operation: string) {
    super('Cannot perform action as server is not running.', mode, operation);
    Object.setPrototypeOf(this, new.target.prototype);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/** Thrown by `start()` if the server is not in `'STOPPED'` state. */
export class ServerAlreadyRunningError extends ServerError {
  constructor(mode: ServerMode, operation: string) {
    super(
      'Cannot perform action as server is already running.',
      mode,
      operation,
    );
    Object.setPrototypeOf(this, new.target.prototype);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Thrown during construction when an option is missing, mistyped,
 * out of range, or references a missing TLS file / UNIX socket dir.
 */
export class ServerConfigurationError extends ServerError {
  /** Option that failed validation (e.g. `'port'`, `'tls.certFile'`). */
  public readonly option: string;
  /** The rejected value, as supplied. */
  public readonly value: unknown;
  /** What a valid value looks like, when the thrower described it. */
  public readonly expected?: string;

  constructor(
    mode: ServerMode | 'N/A',
    option: string,
    value: unknown,
    expected?: string,
  ) {
    let message = `Invalid server configuration for key '${option}': ${value}`;
    if (expected) {
      message += `. Expected: ${expected}`;
    }
    super(message, mode, 'CONFIGURATION');
    this.option = option;
    this.value = value;
    this.expected = expected;
    Object.setPrototypeOf(this, new.target.prototype);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      option: this.option,
      value: this.value,
      expected: this.expected,
    };
  }
}

/**
 * Thrown when the server can't read TLS / CA files or write to the
 * UNIX socket directory.
 */
export class ServerPermissionError extends ServerError {
  constructor(message: string, mode: ServerMode) {
    super(message, mode, 'PERMISSION');
    Object.setPrototypeOf(this, new.target.prototype);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}
