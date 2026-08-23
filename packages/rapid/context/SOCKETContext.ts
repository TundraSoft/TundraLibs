import type { StatusCode } from '@tundralibs/compat/http';
import type { Application } from '../Application.ts';
import { Context } from './Context.ts';
import type {
  RapidContextArgs,
  RapidContextResponse,
  RapidContextState,
} from '../types/mod.ts';
import { RapidError } from '../errors/mod.ts';
import { pagingFromRecord, parsePaging } from '../utils/mod.ts';

/**
 * Is `value` a PLAIN object — an object literal or null-prototype bag,
 * as opposed to an array, `Date`, `Map`, or class instance? Only these
 * can serve as an invocation params bag.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Connection-scope envelope — upgrade-time identity, NOT invocation args. */
export type SOCKETConnection = {
  /** Stable id of the connection (minted at upgrade). */
  id: string;
  /** Query params of the UPGRADE request's URL. */
  query: Readonly<Record<string, string>>;
  /** Headers of the UPGRADE request (auth tokens live here). */
  headers: Headers;
};

/** Construction data for a {@link SOCKETContext}. */
export type SOCKETContextInit = {
  /** Connection-scope envelope (upgrade identity). */
  connection: SOCKETConnection;
  /** The invoked command name (rpc `cmd`). */
  command: string;
  /** The frame's payload, as decoded by the socket transport. */
  payload: unknown;
  /** The client frame id — echoed back so the caller can correlate. */
  frameId?: string;
};

/**
 * The websocket transport context — one per inbound frame/command, NOT
 * per connection (connections are long-lived; invocations are not).
 * The frame id/command mirror the rpc wire protocol so a later
 * `@tundralibs/rpc` composition maps 1:1.
 */
export class SOCKETContext<S extends RapidContextState = RapidContextState>
  extends Context<S, { status: StatusCode; content: unknown }> {
  /** The transport discriminator — always `'SOCKET'`. */
  public readonly type = 'SOCKET';
  /**
   * Connection scope — upgrade-time identity (id, upgrade query,
   * upgrade headers). ENVELOPE, not args: it belongs to the connection,
   * not to this frame.
   */
  public readonly connection: SOCKETConnection;
  /** The invoked command name (rpc `cmd`). */
  public readonly command: string;
  /** The client frame id — echoed back so the caller can correlate. */
  public readonly frameId: string | undefined;
  /** The frame's decoded payload — served via the {@link payload} getter. */
  private readonly __framePayload: unknown;
  /** Lazy args cache — see the base {@link Context.args} contract. */
  private __args: Readonly<RapidContextArgs> | undefined = undefined;

  /** Carry the connection envelope, command, frame payload, and echo id; {@link Context.action} is the command. */
  constructor(app: Application<S>, init: SOCKETContextInit) {
    super(app, { action: init.command });
    this.connection = init.connection;
    this.command = init.command;
    this.__framePayload = init.payload;
    this.frameId = init.frameId;
  }

  /** Stable id of the connection this frame arrived on. */
  public get connectionId(): string {
    return this.connection.id;
  }

  /**
   * The frame's decoded payload, VERBATIM (synchronous — awaiting it is
   * a no-op, which is exactly what keeps `await ctx.payload` uniform
   * across transports). For the object-enforced view use
   * `ctx.args.params`.
   */
  public override get payload(): unknown {
    return this.__framePayload;
  }

  /**
   * SOCKET args: `params` IS the frame payload — commands MUST send
   * object payloads (`{}` when absent). The transport touches `args`
   * before dispatch, so the contract holds even for handlers that
   * never read them. Paging honours `page`/`pagelimit`/`limit` keys in
   * the frame params; query is always empty (frames have no query
   * string).
   *
   * @throws {RapidError} RAPID_VALIDATION_FAILED when the frame
   *   payload is neither an object nor absent — first access only.
   */
  public get args(): Readonly<RapidContextArgs> {
    if (this.__args === undefined) {
      const raw = this.__framePayload;
      let params: Readonly<Record<string, unknown>>;
      if (raw === undefined || raw === null) {
        params = {};
      } else if (isPlainObject(raw)) {
        // A COPY, not `raw` itself — `raw` is `this.__framePayload`,
        // the exact object `ctx.payload` returns. Freezing `params`
        // below must not also freeze `ctx.payload` (undocumented,
        // typed `unknown`, no Readonly promise) out from under a
        // handler that reasonably expects to be able to mutate it.
        params = { ...raw };
      } else {
        // Arrays, Date/Map/Set, class instances — all `typeof
        // 'object'`, none usable as a params bag (they spread to
        // nothing downstream). Only a PLAIN object qualifies.
        throw new RapidError('RAPID_VALIDATION_FAILED', {
          message: 'Socket command payload must be an object',
          details: {
            command: this.command,
            received: Array.isArray(raw)
              ? 'array'
              : (raw as object).constructor?.name ?? typeof raw,
          },
        });
      }
      this.__args = Object.freeze({
        // Frozen — including query/paging's own nested collections, not
        // just params — so the Readonly the type advertises is real at
        // runtime for all of args: `ctx.args.params.x = 'y'` throws
        // instead of silently mutating the decoded frame, same as
        // query.filters/query.sorting/paging.
        params: Object.freeze(params),
        query: Object.freeze({
          filters: Object.freeze({}),
          sorting: Object.freeze([]),
        }),
        paging: Object.freeze(parsePaging(
          this.app.option('server')!.paging ?? {},
          pagingFromRecord(params),
        )),
      });
    }
    return this.__args;
  }

  /**
   * SOCKET consumes `status` as the outcome; `headers` are ignored.
   * A 3xx is REJECTED AT SET TIME — redirects have no meaning on a
   * socket frame, and letting one through would silently launder into
   * the ok envelope (status < 400).
   *
   * @throws {RapidError} RAPID_RESPONSE_INVALID on a 3xx status, or
   *   after {@link respond}.
   */
  public override set response(response: RapidContextResponse | null) {
    this._setEnvelopeResponse(response, 'a socket frame', {
      command: this.command,
    });
  }

  /** The interpreted response — `content` plus the ok/error `status` (no `headers`). */
  public override get response(): Readonly<RapidContextResponse> | null {
    return this._envelopeResponse();
  }

  /** The outbound frame body plus the interpreted outcome. */
  protected _respond(): { status: StatusCode; content: unknown } {
    return { status: this._status, content: this._content };
  }
}
