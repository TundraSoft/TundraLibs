/**
 * `Options` + `Events` + `BaseError` + `Singleton`, composed into one
 * class: a connection pool with validated config, lifecycle events, and
 * exactly one shared instance for the whole process.
 * @module
 */
import { type EventOptionKeys, Options, Singleton } from '@tundralibs/utils';
import { PoolConfigError } from './PoolErrors.ts';

export type PoolOptions = {
  host: string;
  maxConnections: number;
};

export type PoolEvents = {
  connect: (activeCount: number) => void;
  exhausted: () => void;
};

@Singleton
export class ConnectionPool extends Options<PoolOptions, PoolEvents> {
  private __active = 0;

  constructor(config: EventOptionKeys<PoolOptions, PoolEvents>) {
    super();
    this._setOptions(config, { maxConnections: 10 });
  }

  /**
   * Validation hook: every option write — from the constructor AND from
   * `resize()` below — passes through here first, so there is exactly
   * one place that can reject a bad `maxConnections`.
   */
  protected override _processOption(
    key: keyof PoolOptions,
    value: PoolOptions[typeof key],
  ): PoolOptions[typeof key] {
    if (key === 'maxConnections' && (value as number) < 1) {
      throw new PoolConfigError('', {
        option: key,
        value,
        rule: 'must be >= 1',
      });
    }
    return value;
  }

  get host(): string {
    return this._getOption('host');
  }

  get maxConnections(): number {
    return this._getOption('maxConnections');
  }

  get activeConnections(): number {
    return this.__active;
  }

  /**
   * Acquire a connection slot, emitting `connect`. Once the pool is
   * full this emits `exhausted` (for a listener that just wants a
   * signal) and THEN throws a `PoolConfigError` (for the caller, who
   * needs the request to actually fail) — the two are complementary,
   * not alternatives.
   */
  connect(): number {
    if (this.__active >= this.maxConnections) {
      this._emit('exhausted');
      throw new PoolConfigError('', {
        option: 'maxConnections',
        value: this.maxConnections,
        rule: 'pool exhausted — call release() or resize() first',
      });
    }
    this.__active += 1;
    this._emit('connect', this.__active);
    return this.__active;
  }

  release(): void {
    this.__active = Math.max(0, this.__active - 1);
  }

  /**
   * Change the pool size after construction. Routes through
   * `_processOption` exactly like the constructor path does, so an
   * invalid resize is rejected the same way an invalid constructor
   * option would be.
   */
  resize(maxConnections: number): void {
    this._setOption('maxConnections', maxConnections);
  }
}
