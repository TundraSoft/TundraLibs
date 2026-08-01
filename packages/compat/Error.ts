/**
 * @fileoverview Error classes for `@tundrasoft/compat`. All extend
 * {@link CompatError}, which captures `runtime` and `os` automatically
 * and exposes a `toJSON()` for structured logging.
 *
 * @module
 */

import { type OperatingSystem, OS, RUNTIME, type Runtime } from './runtime.ts';

type CompatErrorLike = Error & { runtime: Runtime; os: OperatingSystem };

/**
 * Shared finaliser for the compat error classes: sets `name`, repairs the
 * prototype chain (so `instanceof` survives transpilation), and captures a
 * clean stack. `CompatError` extends `Error` and `CompatTypeError` extends
 * `TypeError`, so they can't share via inheritance — hence the free helper.
 */
const finalizeCompatError = (
  self: CompatErrorLike,
  // deno-lint-ignore no-explicit-any
  target: new (...args: any[]) => unknown,
): void => {
  self.name = self.constructor.name;
  Object.setPrototypeOf(self, target.prototype);
  if (Error.captureStackTrace) {
    Error.captureStackTrace(self, self.constructor);
  }
};

/** Shared structured-logging shape for the compat error classes. */
const compatErrorToJSON = (self: CompatErrorLike): Record<string, unknown> => ({
  name: self.name,
  message: self.message,
  runtime: self.runtime,
  os: self.os,
  stack: self.stack,
  cause: self.cause instanceof Error
    ? { name: self.cause.name, message: self.cause.message }
    : self.cause,
});

/** Base error for compat operations. Captures `runtime` and `os` at throw time. */
export class CompatError extends Error {
  public readonly runtime: Runtime;
  public readonly os: OperatingSystem;

  constructor(message: string, cause?: Error) {
    super(message, { cause });
    this.runtime = RUNTIME;
    this.os = OS;
    finalizeCompatError(this, new.target);
  }

  toJSON(): Record<string, unknown> {
    return compatErrorToJSON(this);
  }
}

/** `TypeError` flavour of {@link CompatError}. Same fields, same `toJSON()`. */
export class CompatTypeError extends TypeError {
  public readonly runtime: Runtime;
  public readonly os: OperatingSystem;

  constructor(message: string, cause?: Error) {
    super(message, { cause });
    this.runtime = RUNTIME;
    this.os = OS;
    finalizeCompatError(this, new.target);
  }

  toJSON(): Record<string, unknown> {
    return compatErrorToJSON(this);
  }
}

/**
 * Network connect didn't complete in time. Carries either
 * `hostname`/`port` (TCP/TLS) or `path` (UNIX), plus the configured
 * `timeoutMs`.
 */
export class ConnectionTimeoutError extends CompatError {
  public readonly hostname?: string;
  public readonly port?: number;
  public readonly path?: string;
  public readonly timeoutMs?: number;

  constructor(
    hostname?: string,
    port?: number,
    path?: string,
    timeoutMs?: number,
  ) {
    const location = path ? `path ${path}` : `${hostname}:${port}`;
    const timeoutInfo = timeoutMs ? ` after ${timeoutMs}ms` : '';
    super(`Connection to ${location} timed out${timeoutInfo}`);
    this.hostname = hostname;
    this.port = port;
    this.path = path;
    this.timeoutMs = timeoutMs;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      hostname: this.hostname,
      port: this.port,
      path: this.path,
      timeoutMs: this.timeoutMs,
    };
  }
}

/**
 * The current runtime can't service `operation` (e.g. a Deno-only
 * feature called from Node). Carries the attempted operation and the
 * detected runtime for diagnostics.
 */
export class UnsupportedRuntimeError extends CompatError {
  public readonly operation: string;
  public readonly detectedRuntime: Runtime;

  constructor(
    operation: string,
    detectedRuntime: Runtime = RUNTIME,
    additionalDetails?: string,
    cause?: Error,
  ) {
    const message = additionalDetails
      ? `Operation '${operation}' is not supported in ${detectedRuntime} runtime: ${additionalDetails}`
      : `Operation '${operation}' is not supported in ${detectedRuntime} runtime`;
    super(message, cause);
    this.operation = operation;
    this.detectedRuntime = detectedRuntime;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      operation: this.operation,
      detectedRuntime: this.detectedRuntime,
    };
  }
}
