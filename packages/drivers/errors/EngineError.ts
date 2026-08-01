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
  public readonly code: EngineErrorCode;
  /** Engine class name, e.g. `'PostgresEngine'`. */
  public readonly engine: string;
  /** Connection name from `instanceId`. */
  public readonly connectionName: string;

  protected override get _messageTemplate(): string {
    return '${message}';
  }

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
