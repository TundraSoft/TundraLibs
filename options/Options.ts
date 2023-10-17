import { privateObject } from '../utils/privateObject.ts';
import type { PrivateObject } from '../utils/privateObject.ts';
import { Events } from '../events/mod.ts';
import { Callback, EventsType } from '../events/mod.ts';
import { OptionKeys } from './types/mod.ts';

/**
 * A core concept in tundralibs is to build reusable modules or libraris which
 * can be easily extended and customized but also provide some consistant
 * functionality such as managing secure options, events and logging.
 * The options class provides an easy and simple way of storing options for
 * the module and also allow creation of events.
 */
export class Options<
  O extends Record<string, unknown> = Record<string, unknown>,
  E extends EventsType = Record<string, Callback>,
> extends Events<E> {
  private _options: PrivateObject<O> = privateObject<O>();

  /**
   * Process the options provided. If the key contains a _on prefix, and is a
   * function, it is assumed to be an event. Defaults can be used to set
   * the default value and will be gracefully overridden by the options.
   *
   * @param options - An object containing the options and events to be set.
   * @param defaults - An optional object containing default values for the options.
   */
  constructor(options: OptionKeys<O, E>, defaults?: Partial<O>) {
    const { options: op, events: ev } = Object.entries(options || {}).reduce(
      (acc: { options: O; events: E }, [key, value]) => {
        if (key.startsWith('_on') && value instanceof Function) {
          // deno-lint-ignore no-explicit-any
          (acc.events as any)[key.slice(3)] = value;
        } else {
          // deno-lint-ignore no-explicit-any
          (acc.options as any)[key] = value;
        }
        return acc;
      },
      { options: {} as O, events: {} as E }, // Initialize options and events with correct types
    );

    super();
    if (defaults) {
      this._setOptions(defaults);
    }

    this._setOptions(op);

    Object.entries(ev).forEach(([key, value]) => {
      this.on(key, value as E[keyof E]);
    });
  }

  /**
   * Checks if the given option name exists and has value in the options object
   *
   * @param name - The name of the option to check.
   * @returns A boolean indicating whether the option exists or not.
   */
  protected _hasOption<K extends keyof O>(name: K): boolean;

  /**
   * Checks if the given option name exists and has value in the options object
   *
   * @param name - The name of the option to check.
   * @returns A boolean indicating whether the option exists or not.
   */
  protected _hasOption(name: string): boolean {
    return this._options.has(name);
  }

  /**
   * Retrieves the value of the specified option from the options object.
   *
   * @param name - The name of the option to retrieve.
   * @returns The value of the specified option, or `undefined` if the option does not exist.
   */
  protected _getOption<K extends keyof O>(name: K): O[K];

  /**
   * Retrieves the value of the specified option from the options object.
   *
   * @param name - The name of the option to retrieve.
   * @returns The value of the specified option, or `undefined` if the option does not exist.
   */
  protected _getOption(name: string): unknown {
    return this._options.get(name);
  }

  /**
   * Sets an option with a specific name and value.
   *
   * @param name - The name of the option.
   * @param value - The value of the option.
   * @returns The instance of the class for method chaining.
   */
  private _setOption<K extends keyof O>(name: K, value: O[K]): this;

  /**
   * Sets an option with a specific name and unknown value.
   *
   * @param name - The name of the option.
   * @param value - The unknown value of the option.
   * @returns The instance of the class for method chaining.
   */
  private _setOption(name: string, value: unknown): this {
    this._options.set(name, value as O[keyof O]);
    return this;
  }

  /**
   * Sets multiple options at once. This is called by the class constructor.
   *
   * @param options - An object containing the options to be set.
   * @returns The instance of the class for method chaining.
   */
  private _setOptions(options: Partial<O>): this {
    for (const [key, value] of Object.entries(options)) {
      this._setOption(key as keyof O, value as O[keyof O]);
    }
    return this;
  }
}
