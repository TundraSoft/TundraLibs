/**
 * Core Slogger module for structured logging
 * @module
 */

import {
  SyslogSeverities,
  SyslogSeverity,
  variableReplacer,
} from '@tundralibs/utils';
import { ulid } from '@tundralibs/id';
import { hostname } from '@tundralibs/compat/net';
import { onExit } from '@tundralibs/compat/runtime';
import { AbstractHandler, type HandlerOptions } from './handlers/mod.ts';
import type { SloggerFormatter, SlogObject } from './types/mod.ts';
import { registry } from './Registry.ts';
import { SamplingOptions } from './handlers/AbstractHandler.ts';
import {
  SloggerConfigError,
  SloggerFinalizeError,
  type SloggerFinalizeFailure,
} from './errors/mod.ts';

/**
 * Declarative handler config — one entry per handler in
 * {@link SloggerOptions.handlers}. The `formatter` field accepts
 * either a registered formatter name (string, looked up via
 * `LogManager.getFormatter`) or a formatter function directly.
 * Handler-specific options (e.g. `directory`, `url`) flow through
 * via the index signature.
 */
export type HandlerConfig = {
  name: string;
  type: string;
  level: SyslogSeverities;
  formatter?: string | SloggerFormatter;
  [key: string]: unknown;
};

/**
 * Bag of structured fields attached to a single log call — `{ userId,
 * reqId, ... }`. Use as the type of the `context` argument to
 * `info` / `warn` / `error` / etc., or as the type of a pre-built
 * context you pass around (e.g. in a request middleware).
 *
 * The log methods also accept a `() => LogContext` thunk for cases
 * where you want to defer building the context until you know the
 * log will actually be emitted (after level + handler-level filters).
 */
export type LogContext = Record<string, unknown>;

/** */
export type SloggerOptions = {
  /** Application name for logging context */
  appName: string;
  level: SyslogSeverities;
  /**
   * Handler configurations. Omit to create a Slogger that silently
   * discards all output — useful in tests and as a placeholder when
   * handlers are wired up later.
   */
  handlers?: HandlerConfig[];
  /** Optional global sampling configuration to apply to all handlers */
  sampling?: SamplingOptions;
  /**
   * Interpolate `${path}` placeholders in the log **message** against
   * the call's context (via `variableReplacer`). Defaults to `false`.
   *
   * ⚠️ Security: only enable this when log messages are
   * developer-controlled. With it on, a message that contains a `${...}`
   * placeholder is resolved against the context object, so an
   * attacker-controlled message (e.g. a username echoed into a log line)
   * could exfiltrate sensitive context fields — `${apiKey}`,
   * `${user.password}` — or probe internals. Leave it off and either
   * pass already-formatted strings or rely on structured context, which
   * is never substituted into the message.
   *
   * Note: this controls *message* interpolation only. Structured context
   * is always passed through to handlers/formatters unchanged regardless
   * of this flag.
   */
  interpolateMessage?: boolean;

  /**
   * A logger-level context provider, invoked on every emitted record and
   * merged **under** the call/scope context (explicit fields always win). Use
   * it to fold request-scoped context in automatically — e.g. from
   * `@tundralibs/ambient`:
   *
   * ```ts
   * const log = LogManager.createSlogger({
   *   appName: 'orders',
   *   contextProvider: () => ambient.get() ?? {},
   * });
   * log.info('charging'); // every line carries the ambient context, no thunk
   * ```
   *
   * Called lazily — only for records that pass the level/handler filters, so
   * muted lines never invoke it. Like formatters, the provider is compared by
   * **reference identity** for `LogManager` caching: hoist it to a
   * stable `const`, don't pass a fresh arrow on each `createSlogger` call.
   */
  contextProvider?: () => LogContext;
};

/** */
export class Slogger {
  public readonly appName: string;
  public readonly hostname: string;
  public readonly level: SyslogSeverities;

  protected _handlers: Array<AbstractHandler> = [];
  private __exitCleanup?: () => void;
  /**
   * Whether to interpolate `${path}` placeholders in the message against
   * the context. Off by default — see {@link SloggerOptions.interpolateMessage}
   * for the security rationale.
   */
  private readonly __interpolateMessage: boolean;
  /**
   * Optional logger-level context provider merged under every record's
   * call/scope context. See {@link SloggerOptions.contextProvider}.
   */
  private readonly __contextProvider?: () => LogContext;

  /**
   * @param options - Logger configuration. See {@link SloggerOptions}.
   * @throws {SloggerConfigError} When `appName` is not a non-empty
   *   string of at most 30 characters.
   * @throws {SloggerConfigError} When `level` is not a number in 0-7.
   * @throws {SloggerConfigError} When any entry in `handlers` is
   *   invalid or its handler/formatter cannot be resolved.
   */
  constructor(options: SloggerOptions) {
    // Validate basic options
    if (
      !options.appName || typeof options.appName !== 'string' ||
      options.appName.length > 30
    ) {
      throw new SloggerConfigError(
        'appName must be a non-empty string with max length 30',
        { key: 'appName' },
      );
    }
    this.appName = options.appName;
    this.hostname = hostname();

    // Validate log level with more descriptive error
    if (
      typeof options.level !== 'number' || options.level < 0 ||
      options.level > 7
    ) {
      throw new SloggerConfigError(
        `Invalid log level: ${options.level}. Must be a number between 0-7`,
        { key: 'level', value: options.level },
      );
    }
    this.level = options.level ?? SyslogSeverities.ERROR;

    // Message interpolation is opt-in and off by default: interpolating
    // an attacker-controlled message against the context is a
    // log-injection / data-exfiltration vector. See SloggerOptions.
    this.__interpolateMessage = options.interpolateMessage === true;
    this.__contextProvider = options.contextProvider;

    // Initialize handlers if provided
    if (options.handlers) {
      this.__initializeHandlers(options.handlers, options.sampling);
    }

    // Register a best-effort cleanup on process exit.
    //
    // ⚠️ This is NOT a guaranteed flush. Process exit handlers
    // (`process.on('exit')` on Node/Bun, the `unload` event on Deno)
    // run *synchronously* — any Promise returned from them is dropped,
    // so async I/O kicked off here (file writes still in a buffer, an
    // in-flight HTTP batch) may never complete before the process dies.
    // We therefore call `finalize()` synchronously and deliberately do
    // NOT register an `async` callback (its returned Promise would be
    // silently ignored, which is worse — it *looks* awaited but isn't).
    //
    // For a guaranteed flush, call `await logger.finalize()` explicitly
    // before you exit (e.g. in your own shutdown path / signal handler).
    // See {@link Slogger.finalize}.
    this.__exitCleanup = onExit(() => {
      for (const handler of this._handlers) {
        try {
          // Fire-and-forget: best-effort only. Synchronous handler work
          // (and any micro-task that resolves before the event loop is
          // torn down) lands; longer async I/O is not guaranteed.
          void handler.finalize();
        } catch {
          // Ignore errors during cleanup.
        }
      }
    });
  }

  /**
   * Initialize handlers from configuration
   *
   * @throws {SloggerConfigError} When a handler entry is missing a
   *   valid `name`, `type`, or `level`, when its formatter cannot be
   *   resolved, or when the handler constructor itself rejects the
   *   options (the underlying error is preserved as `cause`).
   * @private
   */
  private __initializeHandlers(
    handlers: SloggerOptions['handlers'],
    sampling?: SamplingOptions,
  ): void {
    // Handle both array (new) and object (legacy) formats
    if (Array.isArray(handlers)) {
      // New simplified format
      for (const handlerConfig of handlers) {
        try {
          const { name, type, ...options } = handlerConfig;

          // Validate handler options
          if (!name || typeof name !== 'string') {
            throw new SloggerConfigError(
              'Handler requires a valid name string',
              { key: 'name' },
            );
          }

          if (typeof type !== 'string' || !type) {
            throw new SloggerConfigError(
              `Handler '${name}' requires a valid type string`,
              { key: 'type' },
            );
          }

          if (typeof options.level !== 'number') {
            throw new SloggerConfigError(
              `Handler '${name}' requires a valid log level`,
              { key: 'level' },
            );
          }

          // Resolve formatter if provided as string
          if (options.formatter) {
            if (typeof options.formatter === 'string') {
              const formatter = registry.getFormatter(options.formatter);
              if (!formatter) {
                throw new SloggerConfigError(
                  `Formatter '${options.formatter}' not found`,
                  { key: 'formatter' },
                );
              }
              options.formatter = formatter;
            } else if (typeof options.formatter !== 'function') {
              throw new SloggerConfigError(
                `Formatter for handler '${name}' must be a string or function`,
                { key: 'formatter' },
              );
            }
          }

          // Apply global sampling configuration if provided and not overridden at handler level
          if (sampling && !options.sampling) {
            options.sampling = sampling;
          }

          // Create and register the handler
          const handler = registry.createHandler(
            type,
            name,
            options as HandlerOptions,
          );
          this.registerHandler(handler);
        } catch (error) {
          throw new SloggerConfigError(
            `Failed to initialize handler '${handlerConfig.name}': ${
              (error as Error).message
            }`,
            { key: 'handlers' },
            error instanceof Error ? error : undefined,
          );
        }
      }
    }
  }

  /**
   * Register a handler with this logger instance
   *
   * @param handler - The handler to register
   * @throws {SloggerConfigError} When `handler` is not an
   *   {@link AbstractHandler} instance.
   */
  public registerHandler(handler: AbstractHandler): void {
    if (!(handler instanceof AbstractHandler)) {
      throw new SloggerConfigError(
        'Handler must be an instance of AbstractHandler',
        { key: 'handler' },
      );
    }
    this._handlers.push(handler);
  }

  /**
   * Create a scoped view of this logger with pre-bound context fields.
   *
   * Every log emitted via the returned instance has `bindings` merged
   * into its context (per-call context wins on key collision). Scopes
   * compose — `log.scope({a:1}).scope({b:2})` carries `{a:1, b:2}`.
   *
   * The returned object is a thin closure-based wrapper, not a new
   * `Slogger` instance: it exposes the same logging methods (`info`,
   * `warn`, …), the public read-only fields (`appName`, `hostname`,
   * `level`), and a nested `scope()` for composition. Resource-owning
   * methods (`registerHandler`, `finalize`) are intentionally absent
   * — scopes are views over the root logger, not separate destinations.
   *
   * Root loggers pay zero overhead for this feature; the merge code
   * lives on the wrapper, not on `log()`.
   *
   * @param bindings - Pre-bound context fields for the returned wrapper.
   * @returns A scoped logger surface — assignable to `Slogger` for
   *   logging purposes.
   *
   * @example
   * ```typescript
   * const reqLog = log.scope({ reqId, userId });
   * reqLog.info('handled request');               // ctx: { reqId, userId }
   * reqLog.info('slow', { latencyMs: 1247 });      // ctx: { reqId, userId, latencyMs }
   * reqLog.info('override', { reqId: 'other' });   // ctx: { reqId: 'other', userId }
   * ```
   */
  public scope(bindings: Record<string, unknown>): Slogger {
    // Freeze so a caller can't mutate the merged set under our feet.
    const frozen = Object.freeze({ ...bindings });
    // Arrow functions capture `this` from the enclosing method, so no
    // `parent` alias is needed; `this` inside any arrow below is the
    // outer Slogger instance.
    // Common-case fast path: no per-call context. Just shallow-clone
    // the frozen bindings (so handlers see a mutable object) and pass
    // it through. Saves the closure call + merge spread on every
    // `reqLog.info('msg')` style call site.
    const cloneFrozen = (): Record<string, unknown> => ({ ...frozen });
    const merge = (
      ctx: LogContext | (() => LogContext),
    ): Record<string, unknown> => {
      const resolved = typeof ctx === 'function' ? ctx() : ctx;
      return { ...frozen, ...resolved };
    };
    const logAt = (level: SyslogSeverities) =>
    (
      msg: string,
      ctx?: LogContext | (() => LogContext),
    ): void => {
      this.log(level, msg, ctx === undefined ? cloneFrozen() : merge(ctx));
    };
    const info = logAt(SyslogSeverities.INFO);
    const warn = logAt(SyslogSeverities.WARNING);
    const err = logAt(SyslogSeverities.ERROR);
    const crit = logAt(SyslogSeverities.CRITICAL);
    const emerg = logAt(SyslogSeverities.EMERGENCY);

    return {
      // Read-through public fields.
      appName: this.appName,
      hostname: this.hostname,
      level: this.level,
      // Generic level-aware method.
      log: (
        level: SyslogSeverities,
        msg: string,
        ctx?: LogContext | (() => LogContext),
      ): void => {
        this.log(level, msg, ctx === undefined ? cloneFrozen() : merge(ctx));
      },
      // Severity shorthands.
      debug: logAt(SyslogSeverities.DEBUG),
      info,
      information: info,
      notice: logAt(SyslogSeverities.NOTICE),
      warn,
      warning: warn,
      err,
      error: err,
      crit,
      critical: crit,
      alert: logAt(SyslogSeverities.ALERT),
      emerg,
      emergency: emerg,
      // Composes — nested scope merges on top of this one.
      scope: (more: Record<string, unknown>): Slogger =>
        this.scope({ ...frozen, ...more }),
    } as unknown as Slogger;
  }

  public log(
    level: SyslogSeverities,
    message: string,
    context: LogContext | (() => LogContext) = {},
  ): void {
    // Pre-filter based on logger level. Cheapest possible early-exit.
    if (level > this.level) return;

    // Are there any handlers willing to keep this severity? If not,
    // skip every byte of remaining work (id, date, context, format).
    let hasActiveHandlers = false;
    for (const h of this._handlers) {
      if (level <= h.level) {
        hasActiveHandlers = true;
        break;
      }
    }
    if (!hasActiveHandlers) return;

    // Lazy context resolution — only call the thunk if we'll actually use it.
    const callContext = typeof context === 'function' ? context() : context;

    // Fold in the logger-level context provider (e.g. an ambient request
    // context) UNDER the call/scope context — explicit fields always win.
    // Also lazy: the provider only runs for records that reach here (past the
    // level/handler early-exits above).
    const providerContext = this.__contextProvider?.();
    const resolvedContext = providerContext === undefined
      ? callContext
      : { ...providerContext, ...callContext };

    // Message interpolation is opt-in (see SloggerOptions.interpolateMessage).
    // When disabled (the default), the message is emitted verbatim — a
    // `${secret}` in an attacker-controlled message stays literal and can
    // never resolve against the context. When enabled, skip
    // `variableReplacer` entirely unless the message actually contains a
    // `${` so the common path (`logger.info('user logged in')`) avoids the
    // regex flatten+replace cost.
    const processedMessage = this.__interpolateMessage && message.includes('${')
      ? variableReplacer(message, resolvedContext)
      : message;

    // One Date construction → derive epoch / ISO from it. `isoDate` and
    // `id` are lazy getters on the SlogObject: handlers/formatters that
    // don't reference them never pay `toISOString()` / `ulid()`.
    const d = new Date();
    const ts = d.getTime();
    let isoCache: string | undefined;
    let idCache: string | undefined;

    const logObject: SlogObject = {
      get id(): string {
        idCache ??= ulid();
        return idCache;
      },
      appName: this.appName,
      hostname: this.hostname,
      levelName: SyslogSeverities[level] as SyslogSeverity,
      level,
      context: resolvedContext,
      message: processedMessage,
      date: d,
      get isoDate(): string {
        isoCache ??= d.toISOString();
        return isoCache;
      },
      timestamp: ts,
    };

    // Synchronous dispatch — handlers buffer internally for async I/O.
    // `handle()` returns Promise<void>; we attach a `.catch` so a
    // failing handler doesn't crash the process. Handlers own their
    // own error handling beyond that.
    for (const handler of this._handlers) {
      handler.handle(logObject).catch(() => {/* swallowed */});
    }
  }

  public debug(
    message: string,
    context: LogContext | (() => LogContext) = {},
  ): void {
    this.log(SyslogSeverities.DEBUG, message, context);
  }

  public info(
    message: string,
    context: LogContext | (() => LogContext) = {},
  ): void {
    this.log(SyslogSeverities.INFO, message, context);
  }

  public information = this.info;

  public notice(
    message: string,
    context: LogContext | (() => LogContext) = {},
  ): void {
    this.log(SyslogSeverities.NOTICE, message, context);
  }

  public warn(
    message: string,
    context: LogContext | (() => LogContext) = {},
  ): void {
    this.log(SyslogSeverities.WARNING, message, context);
  }

  public warning = this.warn;

  public err(
    message: string,
    context: LogContext | (() => LogContext) = {},
  ): void {
    this.log(SyslogSeverities.ERROR, message, context);
  }

  public error = this.err;

  public crit(
    message: string,
    context: LogContext | (() => LogContext) = {},
  ): void {
    this.log(SyslogSeverities.CRITICAL, message, context);
  }

  public critical = this.crit;

  public alert(
    message: string,
    context: LogContext | (() => LogContext) = {},
  ): void {
    this.log(SyslogSeverities.ALERT, message, context);
  }

  public emerg(
    message: string,
    context: LogContext | (() => LogContext) = {},
  ): void {
    this.log(SyslogSeverities.EMERGENCY, message, context);
  }

  public emergency = this.emerg;

  /**
   * Finalizes the logger, cleaning up all handlers.
   * Removes the exit handler and finalizes all handlers.
   *
   * **Call this explicitly before your process exits** if you need a
   * guaranteed flush of buffered data (file write buffers, pending
   * HTTP batches). The automatic on-exit cleanup registered in the
   * constructor is *best-effort only* — exit handlers run
   * synchronously and cannot await async I/O, so anything still
   * buffered at exit may be lost. Awaiting `finalize()` from your own
   * shutdown / signal path is the only reliable flush.
   *
   * Every handler is finalized even when an earlier one fails:
   * aborting at the first rejection would skip the remaining
   * handlers' flush/close, losing their buffered data and leaking
   * their resources (a file handle, a socket). Failures are collected
   * and surfaced together once all handlers have run — mirroring the
   * per-handler isolation of the constructor's on-exit path.
   *
   * @throws {SloggerFinalizeError} When one or more handlers'
   *   `finalize()` rejected. `context.failures` lists each failing
   *   handler with its rejection reason; all other handlers have
   *   still been finalized by the time this throws.
   */
  async finalize(): Promise<void> {
    // Remove exit handler to prevent it from running
    this.__exitCleanup?.();
    this.__exitCleanup = undefined;

    // Finalize ALL handlers, isolating each one so a failing handler
    // (e.g. an HTTPHandler whose endpoint is down) cannot prevent the
    // later handlers from flushing their buffers and releasing their
    // resources.
    const failures: SloggerFinalizeFailure[] = [];
    for (const handler of this._handlers) {
      try {
        await handler.finalize();
      } catch (error) {
        failures.push({ handler: handler.name, error });
      }
    }
    if (failures.length > 0) {
      throw new SloggerFinalizeError(failures);
    }
  }
}
