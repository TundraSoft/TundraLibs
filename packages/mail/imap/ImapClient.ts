/**
 * @fileoverview {@link ImapClient} — an IMAP4rev1/rev2 client over
 * `@tundralibs/compat`'s sockets: one connection, one command at a time,
 * every command under a deadline.
 *
 * @module
 */

import { connect, type Connection, upgradeTls } from '@tundralibs/compat/net';
import {
  ImapAuthError,
  ImapConnectionError,
  ImapMessageTooLargeError,
  ImapParseError,
  ImapResponseError,
  MailError,
} from '../errors/mod.ts';
import { decodeEncodedWords, parseMessageIds } from '../mime/mod.ts';
import type {
  ImapClientOptions,
  ImapEnvelope,
  ImapFetchItem,
  ImapFetchOptions,
  ImapFlagMode,
  ImapMailbox,
  ImapMailboxStatus,
  ImapMessage,
  ImapSearchCriteria,
  ImapUidSet,
  MailAddress,
} from '../types/mod.ts';
import { Deadline } from './Deadline.ts';
import {
  astring,
  encodeAuthPlain,
  formatSearch,
  formatUidSet,
  type ImapArg,
  mailboxArg,
  parseInternalDate,
} from './format.ts';
import { ImapTransport } from './ImapTransport.ts';
import { type ImapToken, tokenList, tokenNumber, tokenText } from './parser.ts';
import { type ImapResponse, readResponse } from './responses.ts';
import { decodeUtf7 } from './utf7.ts';

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX_SIZE = 16 * 1024 * 1024;
const FLAG = /^\\?[^\s(){}%*"\\\]\[]+$/;
const FETCH_ITEMS: Record<ImapFetchItem, string> = {
  flags: 'FLAGS',
  internalDate: 'INTERNALDATE',
  size: 'RFC822.SIZE',
  envelope: 'ENVELOPE',
  body: 'BODY.PEEK[]',
  header: 'BODY.PEEK[HEADER]',
};
const UTF8 = new TextEncoder();

type CommandResult = {
  untagged: ImapResponse[];
  code?: ImapToken[];
  text: string;
};

type CommandOptions = {
  /** Run under an outer deadline (connect) instead of a per-command one. */
  deadline?: Deadline;
  maxLiteral?: number;
  /** Answer to a `+` continuation request (AUTHENTICATE). */
  onContinue?: () => string;
};

/**
 * IMAP client for Deno, Bun, Node.js and Cloudflare Workers.
 *
 * Commands run one at a time: a second call while one is in flight
 * throws. A timeout, an abort, EOF or a parse error closes the
 * connection, because the protocol state is unknown after any of them;
 * a NO or BAD reply leaves it open.
 *
 * @example
 * ```typescript
 * const client = new ImapClient({
 *   hostname: 'imap.example.com',
 *   auth: { user: 'help@example.com', pass: '…' },
 *   timeout: 20_000,
 * });
 * await client.connect();
 * await client.select('INBOX');
 * const uids = await client.search({ seen: false });
 * for (const uid of uids) {
 *   const [message] = await client.fetch(uid, ['body']);
 *   // store message.body, then:
 *   await client.move(uid, 'Processed');
 * }
 * await client.logout();
 * ```
 */
export class ImapClient {
  private readonly __hostname: string;
  private readonly __port: number;
  private readonly __security: 'tls' | 'starttls' | 'none';
  private readonly __tls: ImapClientOptions['tls'];
  private readonly __auth: ImapClientOptions['auth'];
  private readonly __timeout: number;
  private readonly __connectTimeout: number;
  private readonly __signal: AbortSignal | undefined;
  private readonly __maxSize: number;

  private __transport?: ImapTransport;
  private __conn?: Connection;
  private __capabilities = new Set<string>();
  private __tagCounter = 0;
  private __inFlight = false;
  private __mailbox?: ImapMailboxStatus;
  private __bye?: string;

  constructor(options: ImapClientOptions) {
    this.__hostname = options.hostname;
    this.__security = options.security ?? 'tls';
    this.__port = options.port ?? (this.__security === 'tls' ? 993 : 143);
    this.__tls = options.tls;
    this.__auth = options.auth;
    this.__timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.__connectTimeout = options.connectTimeout ?? this.__timeout;
    this.__signal = options.signal;
    this.__maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
  }

  /** Capabilities the server advertised, uppercased (`MOVE`, `UIDPLUS`, `AUTH=PLAIN`). */
  get capabilities(): ReadonlySet<string> {
    return this.__capabilities;
  }

  get connected(): boolean {
    return this.__transport !== undefined && !this.__transport.closed;
  }

  /** The mailbox currently selected, as SELECT / EXAMINE reported it. */
  get mailbox(): ImapMailboxStatus | undefined {
    return this.__mailbox;
  }

  /** Whether `capability` (case-insensitive) was advertised. */
  has(capability: string): boolean {
    return this.__capabilities.has(capability.toUpperCase());
  }

  /**
   * Open the socket, read the greeting, upgrade with STARTTLS when asked,
   * and authenticate. The whole sequence runs under `connectTimeout`.
   *
   * @throws {ImapTimeoutError} When `connectTimeout` passes.
   * @throws {ImapAuthError} When the credentials are refused, or LOGIN is
   *   disabled with no PLAIN offered.
   * @throws {ImapConnectionError} When the server greets with BYE, when
   *   `security` is `starttls` and the server does not offer it, when the
   *   socket closes, or when `signal` aborts.
   * @throws {UnsupportedRuntimeError} In a browser, where there are no
   *   sockets (thrown by compat's `connect`).
   */
  async connect(): Promise<void> {
    if (this.__transport) {
      throw new ImapConnectionError('connect', 'already connected');
    }
    const deadline = this.__deadline('connect', this.__connectTimeout);
    try {
      // The deadline, not compat's `timeout`/`signal`, bounds the dial, so
      // dial, greeting, STARTTLS and auth share one clock. It also keeps
      // older compat releases safe: through 2.8.0 those options reached
      // `net.connect` on Bun and Node, which destroys the socket when they
      // fire even after it connected.
      const dialing = connect({
        hostname: this.__hostname,
        port: this.__port,
        tls: this.__security === 'tls' ? (this.__tls ?? true) : undefined,
      });
      let conn: Connection;
      try {
        conn = await deadline.guard(dialing);
      } catch (e) {
        // A socket that arrives after the deadline would otherwise leak.
        dialing.then((late) => late.close(), () => {});
        throw e;
      }
      this.__conn = conn;
      this.__transport = new ImapTransport(conn);

      const greeting = await this.__read('connect', deadline, this.__maxSize);
      if (greeting.tag !== '*' || !greeting.status) {
        throw new ImapParseError('greeting is not a status', greeting.text);
      }
      if (greeting.status.status === 'BYE') {
        throw new ImapConnectionError(
          'connect',
          `server refused the connection: ${greeting.status.text}`,
        );
      }
      if (!this.__applyCapabilityCode(greeting.status.code)) {
        await this.__capability(deadline);
      }

      if (this.__security === 'starttls') {
        if (!this.has('STARTTLS')) {
          throw new ImapConnectionError(
            'connect',
            'server does not offer STARTTLS',
          );
        }
        await this.__command('STARTTLS', [], { deadline });
        const secured = await deadline.guard(upgradeTls(conn, {
          hostname: this.__hostname,
          tls: this.__tls ?? true,
        }));
        this.__conn = secured;
        this.__transport = new ImapTransport(secured);
        this.__capabilities.clear();
        await this.__capability(deadline);
      }

      if (greeting.status.status !== 'PREAUTH') {
        await this.__authenticate(deadline);
      }
    } catch (e) {
      this.close();
      throw e;
    } finally {
      deadline.dispose();
    }
  }

  /** Re-read the capability list from the server. */
  async capability(): Promise<string[]> {
    await this.__capability();
    return [...this.__capabilities];
  }

  /**
   * Send NOOP: a keep-alive that also lets the server report new mail.
   *
   * @throws {ImapResponseError} On NO or BAD.
   */
  async noop(): Promise<void> {
    await this.__command('NOOP', []);
  }

  /**
   * LIST mailboxes. The defaults list every mailbox.
   *
   * @param reference - Hierarchy prefix, usually empty.
   * @param pattern - `*` and `%` wildcards, as IMAP defines them.
   * @throws {ImapResponseError} On NO or BAD.
   */
  async list(reference = '', pattern = '*'): Promise<ImapMailbox[]> {
    const result = await this.__command('LIST', [
      mailboxArg(reference),
      mailboxArg(pattern),
    ]);
    const out: ImapMailbox[] = [];
    for (const r of result.untagged) {
      const t = r.tokens;
      if (!t || tokenText(t[0])?.toUpperCase() !== 'LIST') continue;
      const mailbox: ImapMailbox = {
        name: decodeUtf7(tokenText(t[3]) ?? ''),
        attributes: tokenList(t[1]).map(tokenText).filter(
          (a): a is string => a !== undefined,
        ),
      };
      const delimiter = tokenText(t[2]);
      if (delimiter !== undefined) mailbox.delimiter = delimiter;
      out.push(mailbox);
    }
    return out;
  }

  /**
   * CREATE a mailbox. Fails with NO (`ALREADYEXISTS` on servers that say
   * so) when it exists; check with {@link list} first to make the call
   * idempotent.
   *
   * @throws {ImapResponseError} On NO or BAD.
   */
  async create(name: string): Promise<void> {
    await this.__command('CREATE', [mailboxArg(name)]);
  }

  /**
   * SELECT a mailbox (or EXAMINE it with `readOnly`), making it the
   * target of the UID commands.
   *
   * @throws {ImapResponseError} On NO (no such mailbox) or BAD.
   */
  async select(
    name: string,
    options: { readOnly?: boolean } = {},
  ): Promise<ImapMailboxStatus> {
    const command = options.readOnly ? 'EXAMINE' : 'SELECT';
    let result: CommandResult;
    try {
      result = await this.__command(command, [mailboxArg(name)]);
    } catch (e) {
      // A failed SELECT leaves no mailbox selected.
      this.__mailbox = undefined;
      throw e;
    }
    const status: ImapMailboxStatus = {
      name,
      readOnly: command === 'EXAMINE',
      exists: 0,
      flags: [],
    };
    for (const r of result.untagged) {
      if (r.status?.code) {
        const code = r.status.code;
        switch (tokenText(code[0])?.toUpperCase()) {
          case 'UIDVALIDITY':
            status.uidValidity = tokenNumber(code[1]);
            break;
          case 'UIDNEXT':
            status.uidNext = tokenNumber(code[1]);
            break;
          case 'UNSEEN':
            status.unseen = tokenNumber(code[1]);
            break;
          case 'PERMANENTFLAGS':
            status.permanentFlags = tokenList(code[1]).map(tokenText).filter(
              (f): f is string => f !== undefined,
            );
            break;
        }
        continue;
      }
      const t = r.tokens;
      if (!t) continue;
      if (tokenText(t[0])?.toUpperCase() === 'FLAGS') {
        status.flags = tokenList(t[1]).map(tokenText).filter(
          (f): f is string => f !== undefined,
        );
        continue;
      }
      const n = tokenNumber(t[0]);
      if (n === undefined) continue;
      switch (tokenText(t[1])?.toUpperCase()) {
        case 'EXISTS':
          status.exists = n;
          break;
        case 'RECENT':
          status.recent = n;
          break;
      }
    }
    const taggedCode = tokenText(result.code?.[0])?.toUpperCase();
    if (taggedCode === 'READ-ONLY') status.readOnly = true;
    else if (taggedCode === 'READ-WRITE') status.readOnly = false;
    this.__mailbox = status;
    return status;
  }

  /** EXAMINE: {@link select} without the ability to change flags. */
  examine(name: string): Promise<ImapMailboxStatus> {
    return this.select(name, { readOnly: true });
  }

  /**
   * UID SEARCH the selected mailbox. Returns matching UIDs in ascending
   * order; `{}` matches everything.
   *
   * @throws {ImapResponseError} On NO or BAD (no mailbox selected, an
   *   unknown key in `raw`).
   * @throws {MailError} For an invalid `uid` set.
   */
  async search(criteria: ImapSearchCriteria = {}): Promise<number[]> {
    const result = await this.__command('UID SEARCH', formatSearch(criteria));
    const uids: number[] = [];
    for (const r of result.untagged) {
      const t = r.tokens;
      if (!t) continue;
      const kind = tokenText(t[0])?.toUpperCase();
      if (kind === 'SEARCH') {
        for (const tok of t.slice(1)) {
          const n = tokenNumber(tok);
          if (n !== undefined) uids.push(n);
        }
      } else if (kind === 'ESEARCH') {
        // IMAP4rev2 form: ESEARCH (TAG "A1") UID ALL 1:3,5 COUNT 4
        for (let i = 1; i < t.length; i++) {
          if (tokenText(t[i])?.toUpperCase() !== 'ALL') continue;
          const set = tokenText(t[i + 1]) ?? '';
          for (const range of set.split(',')) {
            const [lo, hi = lo] = range.split(':').map(Number);
            if (!Number.isInteger(lo) || !Number.isInteger(hi)) {
              throw new ImapParseError('bad ESEARCH set', r.text);
            }
            for (let u = lo!; u <= hi!; u++) uids.push(u);
          }
        }
      }
    }
    return uids.sort((a, b) => a - b);
  }

  /**
   * UID FETCH the given items. Bodies and headers are peeked, so `\Seen`
   * is not set. Messages the server did not report (expunged UIDs) are
   * simply absent from the result.
   *
   * @throws {ImapMessageTooLargeError} When a body or header is larger
   *   than `maxSize`. The reply was consumed in full, so the connection
   *   stays usable, but no messages are returned: fetch one UID at a
   *   time to isolate the large one.
   * @throws {ImapResponseError} On NO or BAD.
   * @throws {MailError} For an invalid UID set.
   */
  async fetch(
    uids: ImapUidSet,
    items: ImapFetchItem[],
    options: ImapFetchOptions = {},
  ): Promise<ImapMessage[]> {
    const maxSize = options.maxSize ?? this.__maxSize;
    const wire = ['UID', ...new Set(items.map((i) => FETCH_ITEMS[i]))];
    const result = await this.__command('UID FETCH', [
      formatUidSet(uids),
      `(${wire.join(' ')})`,
    ], { maxLiteral: maxSize });

    const out: ImapMessage[] = [];
    let tooLarge: { uid: number; size: number } | undefined;
    for (const r of result.untagged) {
      const t = r.tokens;
      if (!t || tokenText(t[1])?.toUpperCase() !== 'FETCH') continue;
      const seq = tokenNumber(t[0]);
      if (seq === undefined) continue;
      const message: Partial<ImapMessage> = { seq };
      let truncated: number | undefined;
      const list = tokenList(t[2]);
      for (let i = 0; i < list.length;) {
        let key = tokenText(list[i])?.toUpperCase() ?? '';
        i++;
        const section = list[i];
        if (key === 'BODY' && section?.kind === 'section') {
          key += `[${section.items.map(tokenText).join(' ')}]`;
          i++;
        }
        const value = list[i];
        i++;
        switch (key) {
          case 'UID':
            message.uid = tokenNumber(value);
            break;
          case 'FLAGS':
            message.flags = tokenList(value).map(tokenText).filter(
              (f): f is string => f !== undefined,
            );
            break;
          case 'INTERNALDATE': {
            const date = parseInternalDate(tokenText(value) ?? '');
            if (date) message.internalDate = date;
            break;
          }
          case 'RFC822.SIZE':
            message.size = tokenNumber(value);
            break;
          case 'ENVELOPE':
            message.envelope = this.__envelope(value);
            break;
          case 'BODY[]':
          case 'BODY[HEADER]': {
            const bytes = this.__bytes(value);
            if (value?.kind === 'literal' && value.truncated) {
              truncated = value.size;
            }
            if (bytes) {
              message[key === 'BODY[]' ? 'body' : 'header'] = bytes;
            }
            break;
          }
        }
      }
      if (message.uid === undefined) continue; // unsolicited flag update
      if (truncated !== undefined && !tooLarge) {
        tooLarge = { uid: message.uid, size: truncated };
      }
      out.push(message as ImapMessage);
    }
    if (tooLarge) {
      throw new ImapMessageTooLargeError(tooLarge.uid, tooLarge.size, maxSize);
    }
    return out;
  }

  /**
   * UID STORE flags, silently (the server's FLAGS echo is not requested).
   *
   * @throws {ImapResponseError} On NO (read-only mailbox) or BAD.
   * @throws {MailError} For an invalid UID set or a flag with illegal
   *   characters.
   */
  async store(
    uids: ImapUidSet,
    flags: string[],
    mode: ImapFlagMode = 'add',
  ): Promise<void> {
    for (const flag of flags) {
      if (!FLAG.test(flag)) {
        throw new MailError('Invalid IMAP flag: ${flag}', { flag });
      }
    }
    const item = (mode === 'add' ? '+' : mode === 'remove' ? '-' : '') +
      'FLAGS.SILENT';
    await this.__command('UID STORE', [
      formatUidSet(uids),
      item,
      `(${flags.join(' ')})`,
    ]);
  }

  /**
   * UID COPY messages to another mailbox.
   *
   * @throws {ImapResponseError} On NO (`TRYCREATE` when the target does
   *   not exist) or BAD.
   */
  async copy(uids: ImapUidSet, mailbox: string): Promise<void> {
    await this.__command('UID COPY', [formatUidSet(uids), mailboxArg(mailbox)]);
  }

  /**
   * Move messages to another mailbox. Uses UID MOVE (RFC 6851) when the
   * server advertises `MOVE`; otherwise COPY, STORE `\Deleted`, then
   * {@link expunge} of those UIDs. That fallback is atomic on neither
   * side: a failure between the steps can leave the message in both
   * mailboxes, or flagged `\Deleted` in the source.
   *
   * @throws {ImapResponseError} On NO or BAD.
   */
  async move(uids: ImapUidSet, mailbox: string): Promise<void> {
    if (this.has('MOVE')) {
      await this.__command('UID MOVE', [
        formatUidSet(uids),
        mailboxArg(mailbox),
      ]);
      return;
    }
    await this.copy(uids, mailbox);
    await this.store(uids, ['\\Deleted'], 'add');
    await this.expunge(uids);
  }

  /**
   * Permanently remove `\Deleted` messages. With `uids` and the `UIDPLUS`
   * capability this is UID EXPUNGE, limited to those messages; otherwise
   * it is a plain EXPUNGE, which removes every `\Deleted` message in the
   * mailbox, whoever flagged it.
   *
   * @returns How many messages the server reported expunged.
   * @throws {ImapResponseError} On NO (read-only mailbox) or BAD.
   */
  async expunge(uids?: ImapUidSet): Promise<number> {
    const result = uids !== undefined && this.has('UIDPLUS')
      ? await this.__command('UID EXPUNGE', [formatUidSet(uids)])
      : await this.__command('EXPUNGE', []);
    let count = 0;
    for (const r of result.untagged) {
      if (tokenText(r.tokens?.[1])?.toUpperCase() === 'EXPUNGE') count++;
    }
    return count;
  }

  /**
   * Send LOGOUT and close the socket. Safe to call when not connected; a
   * server that drops the connection on BYE without the tagged OK is not
   * an error.
   */
  async logout(): Promise<void> {
    if (!this.__transport) return;
    try {
      await this.__command('LOGOUT', []);
    } catch (e) {
      if (!(e instanceof ImapConnectionError)) throw e;
    } finally {
      this.close();
    }
  }

  /** Close the socket without LOGOUT. */
  close(): void {
    this.__transport?.close();
    this.__transport = undefined;
    this.__conn = undefined;
    this.__capabilities.clear();
    this.__mailbox = undefined;
    this.__bye = undefined;
  }

  // ---------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------

  private __deadline(operation: string, ms: number): Deadline {
    return new Deadline(operation, ms, this.__signal, () => this.close());
  }

  private async __authenticate(deadline: Deadline): Promise<void> {
    const { user, pass } = this.__auth;
    const method = this.__auth.method ??
      (this.has('LOGINDISABLED') ? 'PLAIN' : 'LOGIN');
    if (method === 'LOGIN' && this.has('LOGINDISABLED')) {
      throw new ImapAuthError(this.__hostname, user, 'LOGIN is disabled');
    }
    if (
      method === 'PLAIN' && !this.__auth.method && !this.has('AUTH=PLAIN')
    ) {
      throw new ImapAuthError(
        this.__hostname,
        user,
        'LOGIN is disabled and AUTH=PLAIN is not offered',
      );
    }
    let result: CommandResult;
    try {
      result = method === 'LOGIN'
        ? await this.__command('LOGIN', [astring(user), astring(pass)], {
          deadline,
        })
        : await this.__command('AUTHENTICATE', ['PLAIN'], {
          deadline,
          onContinue: () => encodeAuthPlain(user, pass),
        });
    } catch (e) {
      if (e instanceof ImapResponseError) {
        throw new ImapAuthError(this.__hostname, user, e.context.text);
      }
      throw e;
    }
    if (!this.__applyCapabilityCode(result.code)) {
      await this.__capability(deadline);
    }
  }

  private async __capability(deadline?: Deadline): Promise<void> {
    const result = await this.__command('CAPABILITY', [], { deadline });
    for (const r of result.untagged) {
      const t = r.tokens;
      if (!t || tokenText(t[0])?.toUpperCase() !== 'CAPABILITY') continue;
      this.__capabilities = new Set(
        t.slice(1).map(tokenText).filter((c): c is string => c !== undefined)
          .map((c) => c.toUpperCase()),
      );
    }
  }

  /** Apply a `[CAPABILITY …]` response code; `true` when one was there. */
  private __applyCapabilityCode(code: ImapToken[] | undefined): boolean {
    if (!code || tokenText(code[0])?.toUpperCase() !== 'CAPABILITY') {
      return false;
    }
    this.__capabilities = new Set(
      code.slice(1).map(tokenText).filter((c): c is string => c !== undefined)
        .map((c) => c.toUpperCase()),
    );
    return true;
  }

  /**
   * Send one command and collect its replies up to the tagged line.
   *
   * @throws {ImapResponseError} On a tagged NO or BAD.
   * @throws {ImapConnectionError} When not connected, when another
   *   command is in flight, or when the socket closes.
   * @throws {ImapTimeoutError} When the deadline passes.
   * @throws {ImapParseError} On a line the client cannot read.
   */
  private async __command(
    name: string,
    args: ImapArg[],
    options: CommandOptions = {},
  ): Promise<CommandResult> {
    const transport = this.__transport;
    if (!transport || transport.closed) {
      throw new ImapConnectionError(name, 'not connected');
    }
    if (this.__inFlight) {
      throw new ImapConnectionError(name, 'another command is in flight');
    }
    this.__inFlight = true;
    const own = options.deadline === undefined;
    const deadline = options.deadline ?? this.__deadline(name, this.__timeout);
    const maxLiteral = options.maxLiteral ?? this.__maxSize;
    const tag = `A${++this.__tagCounter}`;
    const untagged: ImapResponse[] = [];
    try {
      let line = `${tag} ${name}`;
      for (const arg of args) {
        if (typeof arg === 'string') {
          line += ' ' + arg;
          continue;
        }
        await deadline.guard(
          transport.write(`${line} {${arg.literal.length}}\r\n`),
        );
        line = '';
        const reply = await this.__readUntil(
          name,
          tag,
          untagged,
          deadline,
          maxLiteral,
        );
        if (reply.tag !== '+') return this.__finish(name, reply, untagged);
        await deadline.guard(transport.write(arg.literal));
      }
      await deadline.guard(transport.write(line + '\r\n'));
      for (;;) {
        const reply = await this.__readUntil(
          name,
          tag,
          untagged,
          deadline,
          maxLiteral,
        );
        if (reply.tag !== '+') return this.__finish(name, reply, untagged);
        if (!options.onContinue) {
          throw new ImapParseError(
            'unexpected continuation request',
            reply.text,
          );
        }
        await deadline.guard(transport.write(options.onContinue() + '\r\n'));
      }
    } catch (e) {
      if (e instanceof ImapResponseError) throw e;
      this.close();
      if (e instanceof MailError) throw e;
      throw new ImapConnectionError(
        name,
        e instanceof Error ? e.message : String(e),
        e instanceof Error ? e : undefined,
      );
    } finally {
      if (own) deadline.dispose();
      this.__inFlight = false;
    }
  }

  /** Read responses, collecting untagged ones, until `tag` or a `+`. */
  private async __readUntil(
    operation: string,
    tag: string,
    untagged: ImapResponse[],
    deadline: Deadline,
    maxLiteral: number,
  ): Promise<ImapResponse> {
    for (;;) {
      const r = await this.__read(operation, deadline, maxLiteral);
      if (r.tag === '*') {
        if (r.status?.status === 'BYE') this.__bye = r.status.text;
        untagged.push(r);
        continue;
      }
      if (r.tag === '+' || r.tag === tag) return r;
      throw new ImapParseError(`unexpected tag ${r.tag}`, r.text);
    }
  }

  private async __read(
    operation: string,
    deadline: Deadline,
    maxLiteral: number,
  ): Promise<ImapResponse> {
    const r = await deadline.guard(readResponse(this.__transport!, maxLiteral));
    if (r === null) {
      throw new ImapConnectionError(
        operation,
        this.__bye ? `server said BYE: ${this.__bye}` : 'connection closed',
      );
    }
    return r;
  }

  private __finish(
    name: string,
    tagged: ImapResponse,
    untagged: ImapResponse[],
  ): CommandResult {
    const status = tagged.status;
    if (!status) {
      throw new ImapParseError('tagged line is not a status', tagged.text);
    }
    if (status.status !== 'OK') {
      throw new ImapResponseError(
        name,
        status.status === 'BAD' ? 'BAD' : 'NO',
        status.text,
        tokenText(status.code?.[0])?.toUpperCase(),
      );
    }
    const result: CommandResult = { untagged, text: status.text };
    if (status.code) result.code = status.code;
    return result;
  }

  private __bytes(token: ImapToken | undefined): Uint8Array | undefined {
    if (!token) return undefined;
    if (token.kind === 'literal') return token.value;
    if (token.kind === 'string') return UTF8.encode(token.value);
    return undefined;
  }

  private __envelope(token: ImapToken | undefined): ImapEnvelope {
    const items = tokenList(token);
    const addresses = (t: ImapToken | undefined): MailAddress[] => {
      const out: MailAddress[] = [];
      for (const entry of tokenList(t)) {
        const parts = tokenList(entry);
        const mailbox = tokenText(parts[2]);
        const host = tokenText(parts[3]);
        // (NIL NIL "group" NIL) opens a group, (NIL NIL NIL NIL) closes it.
        if (host === undefined) continue;
        const address: MailAddress = { address: `${mailbox ?? ''}@${host}` };
        const name = tokenText(parts[0]);
        if (name) address.name = decodeEncodedWords(name);
        out.push(address);
      }
      return out;
    };
    const envelope: ImapEnvelope = {
      from: addresses(items[2]),
      sender: addresses(items[3]),
      replyTo: addresses(items[4]),
      to: addresses(items[5]),
      cc: addresses(items[6]),
      bcc: addresses(items[7]),
    };
    const date = tokenText(items[0]);
    if (date !== undefined) envelope.date = date;
    const subject = tokenText(items[1]);
    if (subject !== undefined) envelope.subject = decodeEncodedWords(subject);
    const inReplyTo = tokenText(items[8]);
    if (inReplyTo !== undefined) envelope.inReplyTo = inReplyTo;
    const messageId = parseMessageIds(tokenText(items[9]))[0];
    if (messageId !== undefined) envelope.messageId = messageId;
    return envelope;
  }
}
