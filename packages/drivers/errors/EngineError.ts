/**
 * @fileoverview {@link EngineError} — connection / pool / query
 * failures from any engine, tagged with a code from
 * {@link EngineErrorCodes} so callers can branch without parsing
 * messages.
 *
 * @module
 */

import { variableReplacer } from '@tundralibs/utils/variableReplacer';
import { DriverError } from './Base.ts';
import { type EngineErrorCode, EngineErrorCodes } from './EngineErrorCodes.ts';

/**
 * Engine error metadata. `instanceId` is always present in the form
 * `"<Engine>::<Name>"` (e.g. `"PostgresEngine::main-db"`); other
 * fields are populated per-code (`timeoutMs`, `query`, etc).
 */
export type EngineErrorMeta = {
  instanceId: string;
  /** When the supplied code wasn't in {@link EngineErrorCodes}, the original string lands here. */
  originalCode?: string;
} & Record<string, unknown>;

/**
 * Thrown by `BaseEngine` and subclasses. `code` is one of the values
 * from {@link EngineErrorCodes} (unknown codes are coerced to
 * `'UNKNOWN_ERROR'` with the original stored in `meta.originalCode`);
 * `engine` and `connectionName` are extracted from `meta.instanceId`.
 *
 * @typeParam M - Metadata shape, extends {@link EngineErrorMeta}.
 *
 * @example
 * ```typescript
 * import { EngineError } from '@tundralibs/drivers/errors';
 * import { PostgresEngine } from '@tundralibs/drivers/postgres';
 *
 * const engine = new PostgresEngine('app', {
 *   host: 'localhost',
 *   database: 'app',
 * });
 * const sql = 'INSERT INTO users (email) VALUES (:email:)';
 * const params = { email: 'ada@example.dev' };
 *
 * try {
 *   await engine.execute({ sql, params });
 * } catch (err) {
 *   if (err instanceof EngineError && err.code === 'DUPLICATE_KEY') {
 *     // handle…
 *   }
 * }
 * ```
 */
export class EngineError<M extends EngineErrorMeta = EngineErrorMeta>
  extends DriverError<M> {
  /** Branch on this rather than the message text. */
  public readonly code: EngineErrorCode;
  /** Engine class name, e.g. `'PostgresEngine'`. */
  public readonly engine: string;
  /** Connection name from `instanceId`. */
  public readonly connectionName: string;

  /**
   * Emits the resolved code template verbatim — engine errors add no wrapper
   * around it, since `instanceId` is already spelled out inside the template.
   *
   * @internal
   */
  protected override get _messageTemplate(): string {
    return '${message}';
  }

  /**
   * Builds an error from a code, resolving its message template against
   * `meta`. A code missing from {@link EngineErrorCodes} is downgraded to
   * `'UNKNOWN_ERROR'` and preserved at `meta.originalCode` rather than
   * throwing, so a driver mapping an unfamiliar server error still produces a
   * usable error.
   *
   * @param code - Key into {@link EngineErrorCodes}.
   * @param meta - Template variables; `instanceId` must be `"<Engine>::<Name>"`.
   * @param cause - Underlying error to chain.
   */
  constructor(code: EngineErrorCode, meta: M, cause?: Error) {
    if (!EngineErrorCodes[code]) {
      meta.originalCode = code;
      code = 'UNKNOWN_ERROR';
    }
    super(EngineErrorCodes[code], meta, cause);
    const [engine, name] = meta.instanceId.split('::');
    this.engine = engine!;
    this.connectionName = name!;
    this.code = code;
  }

  /**
   * Substitutes the template, additionally exposing `engine` and `name` (the
   * two halves of `instanceId`) on top of the inherited variables.
   *
   * @internal
   */
  protected override _makeMessage(): string {
    const vars = {
      ...this.context,
      timeStamp: this.timeStamp.toISOString(),
      message: this._baseMessage,
      engine: this.engine,
      name: this.connectionName,
    };
    return variableReplacer(this._messageTemplate, vars);
  }
}
