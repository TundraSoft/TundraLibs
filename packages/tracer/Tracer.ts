/**
 * @fileoverview The {@link Tracer} — creates spans, resolves their parents from
 * the ambient active-span store, applies sampling, and hands finished spans to
 * the exporter.
 *
 * @author TundraSoft
 *
 * @module
 *
 * @example
 * ```typescript
 * import { ConsoleExporter, Tracer } from '@tundralibs/tracer';
 *
 * const tracer = new Tracer({
 *   serviceName: 'orders',
 *   exporter: new ConsoleExporter(),
 * });
 *
 * const chargeCard = () => Promise.resolve();
 *
 * await tracer.startActiveSpan('checkout', async (span) => {
 *   span.setAttribute('order.id', 'ord_42');
 *   await chargeCard();          // any span started in here parents to `checkout`
 * });
 * ```
 */

import { Options } from '@tundralibs/utils';
import { activeSpan } from './activeSpan.ts';
import { Span } from './Span.ts';
import { randomIdGenerator } from './ids.ts';
import { alwaysOnSampler } from './samplers.ts';
import { FLAG_SAMPLED, inject } from './propagation.ts';
import { TracerConfigError } from './errors/mod.ts';
import type {
  Attributes,
  IdGenerator,
  Sampler,
  SpanContext,
  SpanData,
  SpanExporter,
  SpanOptions,
  TracerOptions,
} from './types/mod.ts';
import { SpanKind } from './types/mod.ts';

/** Shape a custom {@link IdGenerator} must produce — 32 lowercase hex chars. */
const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/;
/** Shape a custom {@link IdGenerator} must produce — 16 lowercase hex chars. */
const SPAN_ID_PATTERN = /^[0-9a-f]{16}$/;

/**
 * Creates and manages spans for one service.
 *
 * Parenting is automatic: a span created while another is active becomes its
 * child, at any call depth and across every `await`, because the active span
 * lives in an `ambient` async context rather than being threaded through
 * function signatures.
 */
export class Tracer extends Options<TracerOptions> {
  /**
   * Create a tracer for one service.
   *
   * Every option is validated here — including a one-shot smoke test of a
   * custom `idGenerator` — so a misconfiguration surfaces at construction
   * rather than as traces that silently never arrive.
   *
   * @param options - See {@link TracerOptions}.
   * @throws {TracerConfigError} When `serviceName` is not a non-empty string.
   * @throws {TracerConfigError} When `sampler` is not a function.
   * @throws {TracerConfigError} When `exporter` has no `export` method.
   * @throws {TracerConfigError} When `idGenerator` produces ids that are not
   *   W3C-conformant (wrong width, non-hex, uppercase, or all-zero).
   */
  constructor(options: TracerOptions) {
    super();
    this._setOptions({ idGenerator: randomIdGenerator, ...options }, {
      sampler: alwaysOnSampler,
      resource: {},
    });
  }

  /**
   * Validate and normalise options at construction. Nothing here runs on the
   * span hot path.
   *
   * @throws {TracerConfigError} See the constructor.
   */
  protected override _processOption<K extends keyof TracerOptions>(
    key: K,
    value: TracerOptions[K],
  ): TracerOptions[K] {
    switch (key) {
      case 'serviceName':
        if (typeof value !== 'string' || value.trim() === '') {
          throw new TracerConfigError(
            'serviceName must be a non-empty string',
            { key: 'serviceName' },
          );
        }
        break;
      case 'sampler':
        if (typeof value !== 'function') {
          throw new TracerConfigError('sampler must be a function', {
            key: 'sampler',
          });
        }
        break;
      case 'exporter':
        if (
          value === null || typeof value !== 'object' ||
          typeof (value as SpanExporter).export !== 'function'
        ) {
          throw new TracerConfigError(
            'exporter must expose an export() method',
            { key: 'exporter' },
          );
        }
        break;
      case 'idGenerator':
        this.__validateIdGenerator(value as IdGenerator);
        break;
    }
    return value;
  }

  /**
   * Smoke-test a custom id generator once, at construction.
   *
   * Malformed ids are not rejected by collectors with an error — the spans are
   * silently dropped, so traces simply never appear. Failing loudly here turns
   * that into an immediate, obvious error.
   *
   * @throws {TracerConfigError} When output is not W3C-conformant.
   */
  private __validateIdGenerator(generator: IdGenerator): void {
    if (
      generator === null || typeof generator !== 'object' ||
      typeof generator.traceId !== 'function' ||
      typeof generator.spanId !== 'function'
    ) {
      throw new TracerConfigError(
        'idGenerator must expose traceId() and spanId() methods',
        { key: 'idGenerator' },
      );
    }
    const traceId = generator.traceId();
    if (!TRACE_ID_PATTERN.test(traceId) || /^0+$/.test(traceId)) {
      throw new TracerConfigError(
        'idGenerator.traceId() must return 32 lowercase hex characters, not all-zero',
        { key: 'idGenerator', value: traceId },
      );
    }
    const spanId = generator.spanId();
    if (!SPAN_ID_PATTERN.test(spanId) || /^0+$/.test(spanId)) {
      throw new TracerConfigError(
        'idGenerator.spanId() must return 16 lowercase hex characters, not all-zero',
        { key: 'idGenerator', value: spanId },
      );
    }
  }

  /** The span currently in scope, or `undefined` outside any span. */
  public active(): Span | undefined {
    return activeSpan.get();
  }

  /**
   * Start a span **without** making it active. The caller owns its lifetime and
   * must call {@link Span.end}; spans started inside will *not* parent to it.
   * Prefer {@link Tracer.startActiveSpan} unless the span's scope genuinely
   * does not match a function call.
   *
   * @param name - Operation name.
   * @param options - See {@link SpanOptions}.
   * @returns The new {@link Span}.
   */
  public startSpan(name: string, options: SpanOptions = {}): Span {
    const idGenerator = this._getOption('idGenerator') as IdGenerator;
    const parent = this.__resolveParent(options);
    const kind = options.kind ?? SpanKind.INTERNAL;
    const attributes = options.attributes ?? {};
    const traceId = parent?.traceId ?? idGenerator.traceId();

    // Child spans inherit the parent's decision so a trace is sampled whole;
    // only roots consult the sampler.
    const sampled = parent !== undefined
      ? (parent.traceFlags & FLAG_SAMPLED) !== 0
      : (this._getOption('sampler') as Sampler)({
        traceId,
        name,
        kind,
        attributes,
        parent,
      });

    return new Span({
      name,
      context: {
        traceId,
        spanId: idGenerator.spanId(),
        traceFlags: sampled ? FLAG_SAMPLED : 0,
      },
      kind,
      startTime: options.startTime ?? new Date(),
      parentSpanId: parent?.spanId,
      attributes,
      resource: this.__resourceAttributes(),
      recording: sampled,
      onEnd: (data) => this.__export(data),
    });
  }

  /**
   * Start a span, make it **active** for the duration of `fn`, and end it when
   * `fn` settles. This is the form to reach for: everything `fn` does — at any
   * depth, across any `await` — parents to this span automatically.
   *
   * The span is ended and exceptions recorded even when `fn` throws; the error
   * is re-thrown unchanged.
   *
   * @typeParam R - `fn`'s return type.
   * @param name - Operation name.
   * @param fn - Runs with the span active; the span ends when it settles.
   * @returns Whatever `fn` returns.
   * @throws {TypeError} When the runtime provides no `AsyncLocalStorage`
   *   (`node:async_hooks`) — e.g. a browser. Making a span active needs an
   *   async-context scope, so it fails loudly rather than silently running
   *   `fn` with no active span. {@link Tracer.startSpan} has no such
   *   requirement.
   */
  public startActiveSpan<R>(name: string, fn: (span: Span) => R): R;
  /**
   * {@link Tracer.startActiveSpan} with span options — identical lifetime and
   * error handling, applied to a span configured by `options`.
   *
   * @typeParam R - `fn`'s return type.
   * @param name - Operation name.
   * @param options - See {@link SpanOptions}.
   * @param fn - Runs with the span active; the span ends when it settles.
   * @returns Whatever `fn` returns.
   * @throws {TypeError} Without `AsyncLocalStorage` — see
   *   {@link Tracer.startActiveSpan}.
   */
  public startActiveSpan<R>(
    name: string,
    options: SpanOptions,
    fn: (span: Span) => R,
  ): R;
  public startActiveSpan<R>(
    name: string,
    optionsOrFn: SpanOptions | ((span: Span) => R),
    maybeFn?: (span: Span) => R,
  ): R {
    const options = typeof optionsOrFn === 'function' ? {} : optionsOrFn;
    const fn = typeof optionsOrFn === 'function'
      ? optionsOrFn
      : maybeFn as (span: Span) => R;

    const span = this.startSpan(name, options);
    return activeSpan.run(span, () => {
      let result: R;
      try {
        result = fn(span);
      } catch (error) {
        span.recordException(error);
        span.end();
        throw error;
      }
      // Async `fn`: keep the span open until the promise settles, so its
      // duration reflects the real work rather than just the synchronous head.
      if (result instanceof Promise) {
        return result.then(
          (value) => {
            span.end();
            return value;
          },
          (error: unknown) => {
            span.recordException(error);
            span.end();
            throw error;
          },
        ) as R;
      }
      span.end();
      return result;
    });
  }

  /**
   * Composition-root adapter for the suite's **Witness** convention (norm's
   * `witness` option, and future adopters): runs `fn` inside an active span
   * named `info.name`, so child spans — and driver-event spans created while
   * it runs — parent to it automatically.
   *
   * A bound arrow, so it works detached:
   *
   * ```ts
   * import { Tracer } from '@tundralibs/tracer';
   * import { Norm, type NormConfig } from '@tundralibs/norm';
   *
   * const tracer = new Tracer({ serviceName: 'orders' });
   * declare const engine: NonNullable<NormConfig['engine']>;
   *
   * const norm = new Norm({ engine, witness: tracer.wrap });
   * ```
   *
   * Attribute values outside the OTLP-representable set (strings, numbers,
   * booleans, and arrays of those) are dropped rather than exported malformed.
   * Satisfies the witness contract by construction: `fn` is invoked exactly
   * once, its result returned unchanged, its errors recorded and re-thrown.
   *
   * @throws {TypeError} When the runtime provides no `AsyncLocalStorage` —
   *   see {@link Tracer.startActiveSpan}.
   */
  public readonly wrap = <T>(
    info: { name: string; attributes?: Record<string, unknown> },
    fn: () => Promise<T>,
  ): Promise<T> => {
    return this.startActiveSpan(
      info.name,
      { attributes: this.__witnessAttributes(info) },
      fn,
    );
  };

  /**
   * {@link Tracer.wrap} with `SpanKind.CLIENT` — the Witness-shaped adapter
   * for **outbound** operations (an HTTP request, a call into another
   * service). CLIENT kind is what trace backends use to draw
   * service-dependency edges, so a wrapped outbound call shows up as an edge
   * in the service map rather than internal work.
   *
   * A bound arrow, so it works detached:
   *
   * ```ts
   * import { Tracer } from '@tundralibs/tracer';
   * import type { RESTlerOptions } from '@tundralibs/restler';
   *
   * const tracer = new Tracer({ serviceName: 'orders' });
   * const token = 'secret';
   * declare const GitHubAPI: new (
   *   token: string,
   *   opts: Partial<RESTlerOptions>,
   * ) => unknown;
   *
   * const api = new GitHubAPI(token, {
   *   witness: tracer.wrapClient, // span per outbound request
   *   headerProvider: tracer.propagation, // traceparent per request
   * });
   * ```
   *
   * Same contract and attribute sanitisation as {@link Tracer.wrap}.
   *
   * @throws {TypeError} When the runtime provides no `AsyncLocalStorage` —
   *   see {@link Tracer.startActiveSpan}.
   */
  public readonly wrapClient = <T>(
    info: { name: string; attributes?: Record<string, unknown> },
    fn: () => Promise<T>,
  ): Promise<T> => {
    return this.startActiveSpan(
      info.name,
      { kind: SpanKind.CLIENT, attributes: this.__witnessAttributes(info) },
      fn,
    );
  };

  /**
   * Attribute values outside the OTLP-representable set (strings, numbers,
   * booleans, and arrays of those) are dropped rather than exported
   * malformed — witness callers pass `Record<string, unknown>`.
   */
  private __witnessAttributes(
    info: { attributes?: Record<string, unknown> },
  ): Attributes {
    const attributes: Attributes = {};
    for (const [key, value] of Object.entries(info.attributes ?? {})) {
      if (
        typeof value === 'string' || typeof value === 'number' ||
        typeof value === 'boolean' ||
        (Array.isArray(value) &&
          value.every((v) =>
            typeof v === 'string' || typeof v === 'number' ||
            typeof v === 'boolean'
          ))
      ) {
        attributes[key] = value as Attributes[string];
      }
    }
    return attributes;
  }

  /**
   * Composition-root adapter for slogger's `contextProvider`: the active
   * span's identity under the **canonical key names** — `traceId` / `spanId`,
   * the exact keys slogger's `otelLogFormatter` hoists into the OTel log
   * record's first-class TraceId/SpanId fields (its `traceFields` defaults).
   * Those names are load-bearing; this adapter exists so they live in code
   * rather than in documentation.
   *
   * Returns `{}` outside any span. Unsampled spans still report their ids —
   * correlation keeps working even when nothing is exported. A bound arrow,
   * so it works detached:
   *
   * ```ts
   * import { ambient } from '@tundralibs/ambient';
   * import { LogManager, SyslogSeverities } from '@tundralibs/slogger';
   * import { Tracer } from '@tundralibs/tracer';
   *
   * const tracer = new Tracer({ serviceName: 'orders' });
   * const appName = 'orders';
   * const level = SyslogSeverities.INFO;
   *
   * // tracer only:
   * LogManager.createSlogger({
   *   appName,
   *   level,
   *   contextProvider: tracer.logContext,
   * });
   * // composed with the ambient request bag:
   * LogManager.createSlogger({
   *   appName,
   *   level,
   *   contextProvider: () => ({ ...ambient.get(), ...tracer.logContext() }),
   * });
   * ```
   */
  public readonly logContext = (): Record<string, unknown> => {
    const span = activeSpan.get();
    return span === undefined
      ? {}
      : { traceId: span.context.traceId, spanId: span.context.spanId };
  };

  /**
   * Composition-root adapter for **outbound propagation** (restler's
   * `headerProvider`, or any per-request header seam): the active span's
   * context as a W3C `traceparent` header, so the downstream service joins
   * this trace instead of starting its own.
   *
   * Returns `{}` outside any span — the request simply goes out
   * unpropagated. An **unsampled** span still serialises (with the sampled
   * flag clear), so downstream learns the sampling decision rather than
   * re-deciding for itself. A bound arrow, so it works detached:
   *
   * ```ts
   * import { Tracer } from '@tundralibs/tracer';
   * import type { RESTlerOptions } from '@tundralibs/restler';
   *
   * const tracer = new Tracer({ serviceName: 'orders' });
   * const token = 'secret';
   * declare const GitHubAPI: new (
   *   token: string,
   *   opts: Partial<RESTlerOptions>,
   * ) => unknown;
   *
   * // restler (>= 1.1): every outbound request carries traceparent
   * const api = new GitHubAPI(token, { headerProvider: tracer.propagation });
   *
   * // pairs with the per-request CLIENT span from `witness: tracer.wrapClient`
   * // — the provider runs inside the witnessed window, so the header carries
   * // that request's own span id.
   * ```
   */
  public readonly propagation = (): Record<string, string> => {
    const span = activeSpan.get();
    return span === undefined ? {} : { traceparent: inject(span.context) };
  };

  /**
   * Flush and release the exporter. Call before process exit so buffered spans
   * are not lost.
   */
  public async shutdown(): Promise<void> {
    await Promise.allSettled(this.__pending);
    const exporter = this._getOption('exporter') as SpanExporter | undefined;
    await exporter?.shutdown?.();
  }

  /** In-flight export promises, awaited by {@link Tracer.shutdown}. */
  private readonly __pending: Set<Promise<void>> = new Set();

  /**
   * Resolve the parent context: an explicit one, else the active span's, else
   * none (making this a trace root). `parent: null` forces a root.
   */
  private __resolveParent(options: SpanOptions): SpanContext | undefined {
    if (options.parent === null) return undefined;
    return options.parent ?? activeSpan.get()?.context;
  }

  /** `service.name` merged with any user-supplied resource attributes. */
  private __resourceAttributes(): Attributes {
    return {
      ...(this._getOption('resource') as Attributes),
      'service.name': this._getOption('serviceName') as string,
    };
  }

  /**
   * Hand a finished span to the exporter. Export failures are swallowed: a
   * broken collector must never surface as an application error.
   */
  private __export(data: SpanData): void {
    const exporter = this._getOption('exporter') as SpanExporter | undefined;
    if (exporter === undefined) return;
    let promise: Promise<void>;
    // The two failure modes need two different guards, and both are load-bearing:
    //   - `.catch()` absorbs a REJECTED export, without an `await` that would
    //     make ending a span asynchronous.
    //   - the try/catch absorbs a SYNCHRONOUS throw from a misbehaving
    //     exporter, which happens before a promise exists and so can never
    //     reach `.catch()`. `Tracer.test.ts` covers this path.
    // S4822 reads the `.catch()` and concludes the try is redundant; removing
    // it would let a synchronous throw escape into the caller's `span.end()`,
    // which is exactly what this method exists to prevent. Wrapping the call in
    // `Promise.resolve().then(...)` would satisfy the rule but defer the export
    // to a microtask, breaking synchronous-export semantics.
    try { //NOSONAR - see above: guards a sync throw, which .catch() cannot
      promise = exporter.export([data]).catch(() => {
        /* observability must not break the application */
      });
    } catch {
      return;
    }
    this.__pending.add(promise);
    void promise.finally(() => this.__pending.delete(promise));
  }
}
