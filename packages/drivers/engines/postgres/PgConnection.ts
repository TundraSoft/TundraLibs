/**
 * @fileoverview A single Postgres connection wrapped around a TCP socket.
 *
 * Owns the receive buffer, message dispatch loop, auth handshake, and
 * the extended-query protocol used by the engine. One instance per
 * pooled connection.
 *
 * @module
 */

import type { Connection } from '@tundralibs/compat/net';
import { EngineError } from '../../errors/mod.ts';
import { PgServerError } from './PgServerError.ts';
import {
  type AuthRequest,
  type BackendMessage,
  type BoundParam,
  buildBind,
  buildClose,
  buildDescribe,
  buildExecute,
  buildParse,
  buildPasswordMessage,
  buildSASLInitialResponse,
  buildSASLResponse,
  buildStartupMessage,
  buildSync,
  buildTerminate,
  type RowField,
  tryReadMessage,
} from './protocol.ts';
import type { EncodedParam } from './binary.ts';
import { decodeText, decodeValue } from './values.ts';
import {
  scramClientFinal,
  type ScramContext,
  scramStart,
  scramVerifyFinal,
} from './auth.ts';

/**
 * Shape of a single row in a query result. Each value is the raw text
 * bytes of that column (or `null`); engine-level code converts using
 * `decodeValue`.
 */
export type QueryRow = Record<string, unknown>;

/** Result of running one extended-query exchange. */
export type QueryResult = {
  rows: QueryRow[];
  rowCount: number;
  /** Tag from CommandComplete, e.g. `"SELECT 5"`, `"INSERT 0 3"`. */
  commandTag: string;
  /** True if the command was empty. */
  empty: boolean;
};

/**
 * Un-decoded, Neon-shaped result of {@link PgConnection.queryRaw}. Column
 * values are the raw Postgres text (or `null` for SQL NULL) — the exact shape
 * Neon's SQL-over-HTTP `/sql` endpoint returns, so a `NeonHttpEngine` pointed
 * at a proxy that serves this decodes it through the same OID path it uses for
 * real Neon.
 */
export type RawQueryResult = {
  /** Leading command word, e.g. `"SELECT"`, `"INSERT"` (Neon's `command`). */
  command: string;
  /** Number of rows affected/returned, parsed from the command tag. */
  rowCount: number;
  /** Column descriptors: name + Postgres type OID (Neon's `dataTypeID`). */
  fields: Array<{ name: string; dataTypeID: number }>;
  /** Rows as objects keyed by column name; raw Postgres text or `null`. */
  rows: Array<Record<string, string | null>>;
};

/**
 * One Postgres connection over a `compat` TCP `Connection`.
 *
 * Lifecycle:
 *   1. `connect()` runs the startup + auth handshake until ReadyForQuery.
 *   2. `query(sql, params)` runs an extended query exchange.
 *   3. `simpleQuery(sql)` runs a simple Query (no params, multiple statements).
 *   4. `close()` sends Terminate and closes the socket.
 *
 * Server NOTICE messages are emitted via the `onNotice` callback supplied at
 * construction time.
 */
export class PgConnection {
  /**
   * Growable receive buffer. Compacts in place when readOff catches up
   * to writeOff and grows on demand — avoids the O(n²) reallocation
   * pattern of a fresh `Uint8Array(old.length + chunk.length)` per read.
   */
  private __buffer = new Uint8Array(8192);
  private __readOff = 0;
  private __writeOff = 0;
  private __closed = false;
  /** Server-supplied parameters captured during startup. */
  public readonly serverParams: Map<string, string> = new Map();
  /** Process id for cancel-request. */
  public processId = 0;
  /** Secret key for cancel-request. */
  public secretKey = 0;
  /** Last-seen transaction status from ReadyForQuery: I/T/E. */
  public txStatus: 'I' | 'T' | 'E' = 'I';

  /**
   * Wrap a raw TCP connection in the Postgres wire protocol.
   *
   * @param __conn - The underlying TCP `Connection`.
   * @param __onNotice - Called for every backend NoticeResponse (NOT errors).
   * @param __instanceId - Engine instance id used in `EngineError` metadata.
   */
  constructor(
    private readonly __conn: Connection,
    private readonly __onNotice: ((message: string) => void) | undefined,
    private readonly __instanceId: string,
  ) {}

  /** Whether this connection has been closed or poisoned. */
  get closed(): boolean {
    return this.__closed;
  }

  /**
   * Run the startup + auth handshake until `ReadyForQuery`.
   *
   * @throws {PgServerError} If the server returns an ErrorResponse during startup.
   * @throws {EngineError} For unsupported auth methods or protocol violations.
   */
  async connect(opts: {
    user: string;
    database: string;
    password?: string;
    applicationName?: string;
    statementTimeoutMs?: number;
    /** Whether the underlying socket is TLS-encrypted. Cleartext-password
     * auth over a non-TLS socket warns (and is refused when
     * `allowCleartextPassword` is explicitly `false`). */
    tlsActive?: boolean;
    /**
     * Permit cleartext-password auth over an unencrypted socket. Defaults to
     * `true` (permissive, with a `notice` warning on every such handshake);
     * pass `false` to refuse instead.
     */
    allowCleartextPassword?: boolean;
  }): Promise<void> {
    const params: Record<string, string> = {
      user: opts.user,
      database: opts.database,
      client_encoding: 'UTF8',
    };
    if (opts.applicationName) params.application_name = opts.applicationName;
    if (opts.statementTimeoutMs !== undefined) {
      params.statement_timeout = String(opts.statementTimeoutMs);
    }
    await this.__write(buildStartupMessage(params));

    // Once SCRAM begins, `scramExpectedSignature` is populated when we send
    // the client-final message and `scramVerified` flips true only after the
    // server's SASLFinal signature is checked. SCRAM is *mutual* auth: the
    // server must prove it knows the stored key by returning ServerSignature.
    // We therefore refuse to reach ReadyForQuery on a SCRAM handshake that
    // was never verified — otherwise a rogue/MITM server could skip SASLFinal
    // and jump straight to AuthenticationOk, and the client would trust a peer
    // that never proved it knows the password.
    let scramExpectedSignature: string | null = null;
    let scramVerified = false;

    while (true) {
      const msg = await this.__read();
      switch (msg.type) {
        case 'R':
          await this.__handleAuth(
            msg.auth,
            opts.password ?? '',
            (_ctx, sig) => {
              scramExpectedSignature = sig;
            },
            opts.tlsActive === true,
            // Permissive by default; only an explicit `false` refuses.
            opts.allowCleartextPassword !== false,
          );
          if (msg.auth.kind === 'sasl-final') {
            if (
              !scramExpectedSignature ||
              !scramVerifyFinal(scramExpectedSignature, msg.auth.data)
            ) {
              throw new EngineError('INVALID_AUTH', {
                instanceId: this.__instanceId,
                reason: 'SCRAM: server signature mismatch',
              });
            }
            scramVerified = true;
          } else if (
            msg.auth.kind === 'ok' && scramExpectedSignature !== null &&
            !scramVerified
          ) {
            // We sent the client-final message but the server answered
            // AuthenticationOk without ever proving it knows the password.
            // Mutual auth is unmet — refuse rather than trust the peer.
            throw new EngineError('INVALID_AUTH', {
              instanceId: this.__instanceId,
              reason:
                'SCRAM: server accepted authentication without sending a ' +
                'verifiable server signature (SASLFinal omitted)',
            });
          }
          break;
        case 'S':
          this.serverParams.set(msg.param, msg.value);
          break;
        case 'K':
          this.processId = msg.processId;
          this.secretKey = msg.secretKey;
          break;
        case 'N':
          this.__emitNotice(msg.fields);
          break;
        case 'E':
          throw _toServerError(msg.fields);
        case 'Z':
          // Catch-all: a server could jump to ReadyForQuery without ever
          // sending SASLFinal (or even AuthenticationOk). If SCRAM began and
          // was never verified, the mutual-auth guarantee is unmet.
          if (scramExpectedSignature !== null && !scramVerified) {
            throw new EngineError('INVALID_AUTH', {
              instanceId: this.__instanceId,
              reason:
                'SCRAM: reached ReadyForQuery without a verified server ' +
                'signature',
            });
          }
          this.txStatus = msg.status;
          return;
        default:
          // ignore unknown startup messages
      }
    }
  }

  /**
   * Handle a single AuthenticationXxx message. For SCRAM, this drives the
   * exchange in-place — we may write multiple messages to the server before
   * returning.
   */
  private async __handleAuth(
    auth: AuthRequest,
    password: string,
    saveScramCtx: (ctx: ScramContext, expectedSignature: string) => void,
    tlsActive: boolean,
    allowCleartextPassword: boolean,
  ): Promise<void> {
    switch (auth.kind) {
      case 'ok':
      case 'sasl-final':
        return;
      case 'cleartext':
        // Over an unencrypted socket, cleartext auth hands the password to
        // any on-path attacker, and a rogue/MITM server can request it
        // *instead of* SCRAM to defeat the mutual-auth guarantee.
        //
        // It is not refused by default, though: `pg_hba` `password` and
        // PgBouncer's `auth_type = plain` are real, working deployments (and
        // libpq itself sends the password unless `require_auth` is pinned), so
        // refusing out of the box would break them on a routine upgrade. The
        // default is instead permissive-but-loud — a `notice` on every
        // plaintext cleartext auth, matching how this package reports the
        // `ssl.enforce: false` downgrade — and operators who want the
        // hardening pin `allowCleartextPassword: false`. TLS satisfies it
        // outright: the transport is already encrypted.
        if (!tlsActive) {
          if (!allowCleartextPassword) {
            throw new EngineError('INVALID_AUTH', {
              instanceId: this.__instanceId,
              reason: 'server requested cleartext-password auth over an ' +
                'unencrypted connection and `allowCleartextPassword` is set ' +
                'to false; sending the password would leak it to any on-path ' +
                'attacker. Enable TLS (`ssl`), or drop the ' +
                '`allowCleartextPassword: false` pin to permit it.',
            });
          }
          this.__onNotice?.(
            'WARNING: server requested cleartext-password auth over an ' +
              'unencrypted connection — the password is being sent in the ' +
              'clear, readable by any on-path attacker, and a rogue server ' +
              'can use this to downgrade away from SCRAM mutual auth. ' +
              'Enable TLS (`ssl`), or set `allowCleartextPassword: false` ' +
              'to refuse instead.',
          );
        }
        await this.__write(buildPasswordMessage(password));
        return;
      case 'md5':
        throw new EngineError('INVALID_AUTH', {
          instanceId: this.__instanceId,
          reason:
            'MD5 password auth is not supported by this driver; configure pg_hba.conf to use scram-sha-256 instead',
        });
      case 'sasl': {
        if (!auth.mechanisms.includes('SCRAM-SHA-256')) {
          throw new EngineError('INVALID_AUTH', {
            instanceId: this.__instanceId,
            reason: `server requires SASL mechanism not supported: ${
              auth.mechanisms.join(', ')
            }`,
          });
        }
        const { clientFirstMessage, ctx } = scramStart('', password);
        await this.__write(
          buildSASLInitialResponse('SCRAM-SHA-256', clientFirstMessage),
        );
        const cont = await this.__read();
        if (cont.type !== 'R' || cont.auth.kind !== 'sasl-continue') {
          if (cont.type === 'E') throw _toServerError(cont.fields);
          throw new EngineError('INVALID_AUTH', {
            instanceId: this.__instanceId,
            reason: 'SCRAM: expected SASLContinue',
          });
        }
        const { clientFinalMessage, expectedServerSignature } =
          await scramClientFinal(ctx, cont.auth.data);
        await this.__write(buildSASLResponse(clientFinalMessage));
        saveScramCtx(ctx, expectedServerSignature);
        return;
      }
      case 'unsupported':
        throw new EngineError('INVALID_AUTH', {
          instanceId: this.__instanceId,
          reason: `unsupported authentication method (code ${auth.code})`,
        });
    }
  }

  /**
   * Run a parameterized query via Parse → Bind → Describe → Execute → Sync.
   *
   * Each `params` entry carries its OID and binary/text format — the
   * driver picks binary for the cases where it pays off (numerics,
   * timestamps, jsonb, bytea) and text otherwise. See `binary.ts`.
   *
   * Statement and portal both use the unnamed slot, so prepared-statement
   * caching is left to a higher layer.
   */
  async query(
    sql: string,
    params: ReadonlyArray<EncodedParam> = [],
  ): Promise<QueryResult> {
    const paramTypes = params.map((p) => p.oid);
    const bind = params.map<BoundParam>((p) => ({
      format: p.format,
      bytes: p.bytes,
    }));
    // Decode each cell to a JS value by OID — the engine's typed-result path.
    const { rows, commandTag, empty } = await this.__runExtendedQuery(
      sql,
      paramTypes,
      bind,
      (fields, values) => {
        const row: QueryRow = {};
        for (let i = 0; i < fields.length; i++) {
          const field = fields[i]!;
          const raw = values[i] ?? null;
          row[field.name] = decodeValue(raw, field.typeOid);
        }
        return row;
      },
    );
    return { rows, rowCount: _parseRowCount(commandTag), commandTag, empty };
  }

  /**
   * Run a parameterized query and return the **un-decoded, Neon-shaped** result
   * ({@link RawQueryResult}): column values as raw Postgres text (or `null`),
   * `fields` as `{ name, dataTypeID }`, plus the leading command word.
   *
   * This is the exact shape Neon's SQL-over-HTTP `/sql` endpoint returns, so a
   * test-only proxy can serve it and a `NeonHttpEngine` decodes it through the
   * same OID path it uses against real Neon.
   *
   * It mirrors {@link query} on the wire, differing only in that (a) `params`
   * are bound as Postgres **text-format** parameters — matching how Neon
   * forwards each JSON param as its text representation — with an unspecified
   * OID so the server infers the type from context, and (b) each cell is
   * UTF-8-decoded rather than coerced by OID.
   *
   * @param sql - SQL text with positional (`$1`, `$2`, …) placeholders.
   * @param params - JSON-native param values (string / number / boolean /
   *   `null` / object), each sent as its text representation.
   */
  async queryRaw(
    sql: string,
    params: ReadonlyArray<unknown> = [],
  ): Promise<RawQueryResult> {
    // Every param goes over as text with an unspecified OID (0) — the server
    // infers the type from context, exactly as Neon forwards JSON params.
    const paramTypes = params.map(() => 0);
    const bind = params.map<BoundParam>(_toTextParam);
    const { rows, fields, commandTag } = await this.__runExtendedQuery<
      Record<string, string | null>
    >(
      sql,
      paramTypes,
      bind,
      (fields, values) => {
        const row: Record<string, string | null> = {};
        for (let i = 0; i < fields.length; i++) {
          const raw = values[i] ?? null;
          row[fields[i]!.name] = raw === null ? null : decodeText(raw);
        }
        return row;
      },
    );
    return {
      command: _commandWord(commandTag),
      rowCount: _parseRowCount(commandTag),
      fields: fields.map((f) => ({ name: f.name, dataTypeID: f.typeOid })),
      rows,
    };
  }

  /**
   * Shared Parse → Bind → Describe → Execute → Close → Sync exchange and
   * message loop for {@link query} / {@link queryRaw}. The only thing that
   * varies between them is how a Data row (`'D'`) is turned into a JS row, so
   * that step is a `decodeRow` callback; the wire handling is identical.
   *
   * @typeParam TRow - Shape produced by `decodeRow` for each result row.
   * @returns The decoded rows plus the raw `fields`, command tag, and
   *   empty-query flag; callers derive `rowCount` / `command` as needed.
   * @throws {PgServerError} If the server returns an ErrorResponse.
   */
  private async __runExtendedQuery<TRow>(
    sql: string,
    paramTypes: number[],
    bind: BoundParam[],
    decodeRow: (
      fields: RowField[],
      values: ReadonlyArray<Uint8Array | null>,
    ) => TRow,
  ): Promise<{
    rows: TRow[];
    fields: RowField[];
    commandTag: string;
    empty: boolean;
  }> {
    const chunks = [
      buildParse('', sql, paramTypes),
      buildBind('', '', bind),
      buildDescribe('P', ''),
      buildExecute('', 0),
      buildClose('S', ''),
      buildSync(),
    ];
    let total = 0;
    for (const c of chunks) total += c.length;
    const writes = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      writes.set(c, off);
      off += c.length;
    }
    await this.__write(writes);

    const rows: TRow[] = [];
    let fields: RowField[] = [];
    let commandTag = '';
    let empty = false;
    let serverError: Map<string, string> | null = null;

    while (true) {
      const msg = await this.__read();
      switch (msg.type) {
        case '1':
        case '2':
        case '3':
        case 'n':
          break;
        case 'T':
          fields = msg.fields;
          break;
        case 'D':
          rows.push(decodeRow(fields, msg.values));
          break;
        case 'C':
          commandTag = msg.tag;
          break;
        case 'I':
          empty = true;
          break;
        case 'N':
          this.__emitNotice(msg.fields);
          break;
        case 'E':
          serverError = msg.fields;
          break;
        case 'Z':
          this.txStatus = msg.status;
          if (serverError) throw _toServerError(serverError);
          return { rows, fields, commandTag, empty };
        default:
          // ignore
      }
    }
  }

  /**
   * Run a simple-query (no parameters; may contain multiple statements).
   *
   * Used for one-shot DDL and `BEGIN`/`COMMIT`/`ROLLBACK`. Does not return
   * row data — only the final command tag.
   */
  async simpleQuery(sql: string): Promise<string> {
    const buf = new Uint8Array(_buildSimpleQuery(sql));
    await this.__write(buf);
    let lastTag = '';
    let serverError: Map<string, string> | null = null;
    while (true) {
      const msg = await this.__read();
      switch (msg.type) {
        case 'T':
        case 'D':
        case '1':
        case '2':
        case '3':
        case 'n':
          break;
        case 'C':
          lastTag = msg.tag;
          break;
        case 'I':
          break;
        case 'N':
          this.__emitNotice(msg.fields);
          break;
        case 'E':
          serverError = msg.fields;
          break;
        case 'Z':
          this.txStatus = msg.status;
          if (serverError) throw _toServerError(serverError);
          return lastTag;
      }
    }
  }

  /** Send Terminate and close the underlying socket. Idempotent. */
  async close(): Promise<void> {
    if (this.__closed) return;
    this.__closed = true;
    try {
      await this.__conn.write(buildTerminate());
    } catch {
      // socket may already be gone
    }
    try {
      this.__conn.close();
    } catch {
      // already closed
    }
  }

  //#region IO helpers

  /** Write raw bytes; marks the connection closed on transport failure. */
  private async __write(bytes: Uint8Array): Promise<void> {
    if (this.__closed) {
      throw new EngineError('NO_CONNECTION', { instanceId: this.__instanceId });
    }
    try {
      await this.__conn.write(bytes);
    } catch (e) {
      // A rejected socket write (ECONNRESET, EPIPE, broken TLS) leaves this
      // connection unusable. Mark it closed so `_validateResource`
      // (`!conn.closed`) rejects it and the pool destroys it instead of
      // recycling a poisoned socket — otherwise the flag only ever flips on a
      // clean EOF (null read below) and a transport error would silently
      // permanently poison the pool.
      this.__closed = true;
      throw e;
    }
  }

  /** Read and decode the next backend message, buffering partial reads. */
  private async __read(): Promise<BackendMessage> {
    while (true) {
      if (this.__writeOff > this.__readOff) {
        const view = this.__buffer.subarray(0, this.__writeOff);
        const r = tryReadMessage(view, this.__readOff);
        if (r) {
          this.__readOff += r.consumed;
          if (this.__readOff === this.__writeOff) {
            this.__readOff = 0;
            this.__writeOff = 0;
          }
          return r.message;
        }
      }
      let chunk: Uint8Array | null;
      try {
        chunk = await this.__conn.read();
      } catch (e) {
        // A rejected read (transport reset, timeout abort) — same reasoning as
        // `__write`: mark closed so the poisoned connection fails validation
        // and is destroyed rather than handed back out mid-protocol.
        this.__closed = true;
        throw e;
      }
      if (chunk === null) {
        this.__closed = true;
        throw new EngineError('CONNECTION_LOST', {
          instanceId: this.__instanceId,
          reason: 'Postgres connection closed',
        });
      }
      this.__appendChunk(chunk);
    }
  }

  /**
   * Append `chunk` to the receive buffer. Compacts in-place when readOff
   * has consumed enough to fit the new data, grows (2x) only when neither
   * fits — keeps allocations infrequent on streaming reads.
   */
  private __appendChunk(chunk: Uint8Array): void {
    const live = this.__writeOff - this.__readOff;
    const needed = live + chunk.length;
    if (needed > this.__buffer.length) {
      let cap = this.__buffer.length;
      while (cap < needed) cap *= 2;
      const grown = new Uint8Array(cap);
      grown.set(this.__buffer.subarray(this.__readOff, this.__writeOff), 0);
      this.__buffer = grown;
      this.__writeOff = live;
      this.__readOff = 0;
    } else if (this.__readOff > 0) {
      this.__buffer.copyWithin(0, this.__readOff, this.__writeOff);
      this.__writeOff = live;
      this.__readOff = 0;
    }
    this.__buffer.set(chunk, this.__writeOff);
    this.__writeOff += chunk.length;
  }

  /** Forward a backend NoticeResponse to the notice callback. */
  private __emitNotice(fields: Map<string, string>): void {
    if (!this.__onNotice) return;
    const severity = fields.get('S') ?? 'NOTICE';
    const message = fields.get('M') ?? '';
    this.__onNotice(`${severity}: ${message}`);
  }

  //#endregion IO helpers
}

function _toServerError(fields: Map<string, string>): PgServerError {
  return new PgServerError(fields.get('C') ?? '', fields);
}

function _parseRowCount(tag: string): number {
  const parts = tag.split(' ');
  const last = parts.length > 0 ? parts[parts.length - 1]! : '';
  const n = Number.parseInt(last, 10);
  return Number.isInteger(n) ? n : 0;
}

const _enc = new TextEncoder();

/** Leading word of a command tag — Neon's `command` (`"INSERT 0 3"` → `"INSERT"`). */
function _commandWord(tag: string): string {
  const sp = tag.indexOf(' ');
  return sp === -1 ? tag : tag.slice(0, sp);
}

/**
 * Bind one JSON-native value as a Postgres **text-format** parameter with an
 * unspecified OID (`0`) — the server infers the type from context. This mirrors
 * how Neon forwards each JSON param as its text representation, so a value the
 * engine's `_encodeValue` produced round-trips through Postgres.
 */
function _toTextParam(value: unknown): BoundParam {
  if (value === null || value === undefined) return { format: 0, bytes: null };
  let text: string;
  if (typeof value === 'string') text = value;
  else if (typeof value === 'boolean') text = value ? 'true' : 'false';
  else if (typeof value === 'object') text = JSON.stringify(value);
  else text = String(value); // number, bigint
  return { format: 0, bytes: _enc.encode(text) };
}

function _buildSimpleQuery(sql: string): Uint8Array {
  const sqlBytes = _enc.encode(sql);
  const payload = new Uint8Array(sqlBytes.length + 1);
  payload.set(sqlBytes, 0);
  payload[sqlBytes.length] = 0;
  const out = new Uint8Array(1 + 4 + payload.length);
  out[0] = 'Q'.charCodeAt(0);
  const length = payload.length + 4;
  out[1] = (length >>> 24) & 0xff;
  out[2] = (length >>> 16) & 0xff;
  out[3] = (length >>> 8) & 0xff;
  out[4] = length & 0xff;
  out.set(payload, 5);
  return out;
}
