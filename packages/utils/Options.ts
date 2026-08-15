/**
 * Typed option-store plus {@link Events} emitter base class — subclasses
 * validate values through `_processOption` and expose specific getters
 * over a private, credential-safe store.
 *
 * @module
 */
import { type EventCallback, Events } from './Events.ts';
import { type PrivateObject, privateObject } from './privateObject.ts';

/**
 * Constructor-args shape for {@link Options} subclasses: every option
 * from `O` (made optional) plus every event in `E` exposed as
 * `_on<EventName>`, taking either a single callback or an array.
 *
 * @typeParam O - Option keys to value types.
 * @typeParam E - Event names to callback signatures.
 */
export type EventOptionKeys<
  O extends Record<string, unknown> = Record<string, unknown>,
  E extends Record<string, EventCallback> = Record<string, EventCallback>,
> =
  & {
    [K in keyof O]?: O[K]; // Make everything optional to allow for defaults
  }
  & {
    [K in keyof E as `_on${string & K}`]?: E[K] | E[K][];
  };

/**
 * Is `value` a plain object (object literal / null-prototype) — as
 * opposed to an array, class instance, function, or primitive?
 * Grouped-option merging and defensive copying apply only to these.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Base class combining a typed option store with an {@link Events}
 * emitter. Subclasses call `_setOptions(config, defaults)` from their
 * constructor and override {@link Options._processOption} to validate
 * or transform values before they're stored.
 *
 * Options live in a {@link PrivateObject}: the store is readable only
 * by the subclass (`_getOption`/`_getOptions`) and writable only via
 * the protected `_setOption*` methods — option bags routinely carry
 * credentials, so nothing is exposed on the public surface beyond
 * {@link Options.hasOption}.
 *
 * @typeParam O - Option keys and their value types.
 * @typeParam E - Event names and their callback signatures.
 *
 * @example
 * ```typescript
 * type Opts = { host: string; port: number };
 * type Evts = { connect: () => void };
 *
 * class Db extends Options<Opts, Evts> {
 *   constructor(c: EventOptionKeys<Opts, Evts>) {
 *     super();
 *     this._setOptions(c, { port: 5432 });
 *   }
 *   get port(): number {
 *     return this._getOption('port');
 *   }
 * }
 *
 * new Db({ host: 'localhost', _onconnect: () => {} });
 * ```
 */
export abstract class Options<
  O extends Record<string, unknown> = Record<string, unknown>,
  E extends Record<string, EventCallback> = Record<string, EventCallback>,
> extends Events<E> {
  private readonly __options: PrivateObject<O> = privateObject<O>();

  /** Whether `key` is present in the option store. */
  public hasOption<K extends keyof O>(key: K): boolean {
    return this.__options.has(key);
  }

  /**
   * Read one option. Protected: option bags routinely carry
   * credentials — expose specific values through purpose-built public
   * getters instead of the raw store.
   */
  protected _getOption<K extends keyof O>(key: K): O[K] {
    return this.__options.get(key);
  }

  /**
   * Read a defensive copy of the whole option bag: the bag itself is
   * copied and every plain-object GROUP value is copied one level
   * deep, so mutating the result (including `result.group.key = x`)
   * cannot write into the internal store and bypass
   * {@link Options._processOption} validation. Non-plain values
   * (class instances, functions, arrays) are returned as-is.
   */
  protected _getOptions(): O {
    const source = this.__options.asObject();
    const copy: Record<string, unknown> = {};
    for (const key in source) {
      const value = source[key];
      copy[key] = isPlainObject(value) ? { ...value } : value;
    }
    return copy as O;
  }

  /**
   * Write one option. The only path into the store, so every value —
   * including those applied by {@link Options._setOptions} — passes
   * through {@link Options._processOption} first; a rejection thrown
   * there surfaces here uncaught.
   */
  protected _setOption<K extends keyof O>(key: K, value: O[K]): this {
    this.__options.set(key, this._processOption(key, value));
    return this;
  }

  /**
   * Apply `defaults`, override with `options`, then route each entry:
   * `_on<EventName>` keys register listeners, everything else flows
   * through {@link Options._setOption} (and therefore
   * {@link Options._processOption}).
   *
   * Merging is GROUP-AWARE: when both the default and the incoming
   * value for a key are plain objects, they are merged one level deep
   * (`{ ...default, ...incoming }`) — a caller passing a partial
   * `server: { port: 8080 }` keeps the other `server` defaults instead
   * of clobbering the whole group. Non-plain values (arrays, class
   * instances) replace wholesale. An explicitly-`undefined` incoming
   * value defers to the default when one exists — and still reaches
   * {@link Options._processOption} when there is none, so required-
   * option validation keeps working.
   */
  protected _setOptions(
    options: EventOptionKeys<O, E>,
    defaults?: Partial<O>,
  ): this {
    const finalOptions = { ...defaults } as Record<string, unknown>;
    for (const key in options) {
      if (!Object.hasOwn(options, key)) continue;
      const incoming = (options as Record<string, unknown>)[key];
      // Explicit undefined defers to the default WHEN one exists;
      // without a default it flows through so _processOption still
      // sees (and can reject) a required-but-missing value.
      if (incoming === undefined && Object.hasOwn(finalOptions, key)) continue;
      const base = finalOptions[key];
      finalOptions[key] = isPlainObject(incoming) && isPlainObject(base)
        ? { ...base, ...incoming }
        : incoming;
    }
    for (const key in finalOptions) {
      if (key.startsWith('_on')) {
        this.on(
          key.slice(3) as keyof E,
          finalOptions[key] as unknown as E[keyof E],
        );
      } else {
        this._setOption(key as keyof O, finalOptions[key] as O[keyof O]);
      }
    }
    return this;
  }

  /**
   * Validation/transformation hook for {@link Options._setOption}.
   * Override to coerce or reject values; the default returns the input
   * unchanged. Throw to reject.
   */
  protected _processOption(key: keyof O, value: O[typeof key]): O[typeof key] {
    return value;
  }
}
