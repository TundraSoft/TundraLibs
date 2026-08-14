/**
 * @fileoverview Error classes for `@tundralibs/compat`. All extend
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
  /** Runtime detected when the error was constructed. */
  public readonly runtime: Runtime;
  /** Operating system detected when the error was constructed. */
  public readonly os: OperatingSystem;

  /** Snapshots the detected runtime and OS onto the instance. */
  constructor(message: string, cause?: Error) {
    super(message, { cause });
    this.runtime = RUNTIME;
    this.os = OS;
    finalizeCompatError(this, new.target);
  }

  /** Structured form for logging. Flattens `cause` to `name`/`message`. */
  toJSON(): Record<string, unknown> {
    return compatErrorToJSON(this);
  }
}

/** `TypeError` flavour of {@link CompatError}. Same fields, same `toJSON()`. */
export class CompatTypeError extends TypeError {
  /** Runtime detected when the error was constructed. */
  public readonly runtime: Runtime;
  /** Operating system detected when the error was constructed. */
  public readonly os: OperatingSystem;

  /** Snapshots the detected runtime and OS onto the instance. */
  constructor(message: string, cause?: Error) {
    super(message, { cause });
    this.runtime = RUNTIME;
    this.os = OS;
    finalizeCompatError(this, new.target);
  }

  /** Structured form for logging. Flattens `cause` to `name`/`message`. */
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
  /** Target host. Absent for UNIX-socket connects. */
  public readonly hostname?: string;
  /** Target port. Absent for UNIX-socket connects. */
  public readonly port?: number;
  /** UNIX socket path. Absent for TCP and TLS connects. */
  public readonly path?: string;
  /** Timeout that elapsed, in milliseconds. */
  public readonly timeoutMs?: number;

  /**
   * Pass `hostname`/`port` for TCP and TLS, or `path` for UNIX sockets — the
   * message renders whichever is present, preferring `path`.
   */
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

  /** Adds the connect target and `timeoutMs` to the base payload. */
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
  /** The call that could not be serviced, as named by the throw site. */
  public readonly operation: string;
  /** Runtime that lacked the feature. */
  public readonly detectedRuntime: Runtime;

  /**
   * Builds the message from `operation` and `detectedRuntime`.
   *
   * @param detectedRuntime - Defaults to the runtime detected at import time.
   * @param additionalDetails - Appended after a colon to explain the gap.
   */
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

  /** Adds `operation` and `detectedRuntime` to the base payload. */
  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      operation: this.operation,
      detectedRuntime: this.detectedRuntime,
    };
  }
}
