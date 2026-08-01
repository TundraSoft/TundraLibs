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
 * Base class combining a typed option store with an {@link Events}
 * emitter. Subclasses call `_setOptions(config, defaults)` from their
 * constructor and override {@link _processOption} to validate or
 * transform values before they're stored.
 *
 * Options live in a {@link PrivateObject} — callers read via
 * `getOption`/`getOptions`/`hasOption`, but only the subclass can
 * write (via the protected `_setOption*` methods).
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

  constructor() {
    super();
  }

  public hasOption<K extends keyof O>(key: K): boolean {
    return this.__options.has(key);
  }

  public getOption<K extends keyof O>(key: K): O[K] {
    return this.__options.get(key);
  }

  public getOptions(): O {
    // Return a shallow copy so mutating the result (e.g.
    // `getOptions().port = -1`) cannot write into the internal store and
    // bypass `_processOption` validation. Callers must go through
    // `_setOption` to change stored options.
    return { ...this.__options.asObject() };
  }

  protected _setOption<K extends keyof O>(key: K, value: O[K]): this {
    this.__options.set(key, this._processOption(key, value));
    return this;
  }

  /**
   * Apply `defaults`, override with `options`, then route each entry:
   * `_on<EventName>` keys register listeners, everything else flows
   * through {@link _setOption} (and therefore {@link _processOption}).
   */
  protected _setOptions(
    options: EventOptionKeys<O, E>,
    defaults?: Partial<O>,
  ): this {
    const finalOptions = { ...defaults } as EventOptionKeys<O, E>;
    for (const key in options) {
      if (Object.hasOwn(options, key)) {
        (finalOptions as Record<string, unknown>)[key] = options[key];
      }
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
   * Validation/transformation hook for {@link _setOption}. Override to
   * coerce or reject values; the default returns the input unchanged.
   * Throw to reject.
   */
  protected _processOption(key: keyof O, value: O[typeof key]): O[typeof key] {
    return value;
  }
}
