/**
 * @fileoverview A small in-memory IMAP server for the client tests, run
 * over compat's `listen()`. It speaks exactly the subset the client
 * sends, keeps mailboxes as arrays, and exposes hooks to delay, hang,
 * chunk or cut a reply.
 *
 * Test fixture only — not published.
 *
 * @module
 */

import type { TLSOptions } from '@tundralibs/compat/common';
import { type Connection, listen, type Listener } from '@tundralibs/compat/net';

export type FakeMessage = {
  uid: number;
  flags: string[];
  /** `DD-Mon-YYYY HH:MM:SS +0000` */
  internalDate: string;
  body: string;
  /** Raw ENVELOPE list text, when a test asks for `envelope`. */
  envelope?: string;
};

export type FakeCommand = {
  tag: string;
  name: string;
  args: string;
  line: string;
};

export type FakeContext = {
  conn: Connection;
  write: (text: string | Uint8Array) => Promise<void>;
  close: () => void;
};

export type FakeImapOptions = {
  capabilities?: string[];
  mailboxes?: Record<string, FakeMessage[]>;
  user?: string;
  pass?: string;
  greeting?: string;
  tls?: TLSOptions;
  /** Reply to UID SEARCH in IMAP4rev2 ESEARCH form. */
  esearch?: boolean;
  /** Write FETCH literals in pieces of this many bytes, yielding between. */
  literalChunk?: number;
  /**
   * Runs before each command is answered. Return `false` to skip the
   * built-in reply (after writing your own, or nothing).
   */
  before?: (
    cmd: FakeCommand,
    ctx: FakeContext,
  ) => Promise<boolean | void> | boolean | void;
};

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();
const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

let nextPort = 14300;

/** Parse the fixture's own INTERNALDATE form to epoch ms (UTC day). */
function dateOf(text: string): number {
  const [day, mon, year] = text.split(' ')[0]!.split('-');
  return Date.UTC(
    Number(year),
    MONTHS.indexOf(mon!.toLowerCase()),
    Number(day),
  );
}

/** `DD-Mon-YYYY` from the client to epoch ms (UTC day). */
function dayOf(text: string): number {
  return dateOf(text.replace(/"/g, ''));
}

/** Split command arguments on spaces, keeping quoted strings and (lists) whole. */
export function splitArgs(text: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (c === ' ') {
      i++;
      continue;
    }
    if (c === '"') {
      let s = '';
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\') i++;
        s += text[i];
        i++;
      }
      i++;
      out.push(s);
      continue;
    }
    if (c === '(') {
      let depth = 0;
      let s = '';
      while (i < text.length) {
        if (text[i] === '(') depth++;
        if (text[i] === ')') depth--;
        s += text[i];
        i++;
        if (depth === 0) break;
      }
      out.push(s);
      continue;
    }
    let s = '';
    while (i < text.length && text[i] !== ' ') s += text[i++];
    out.push(s);
  }
  return out;
}

/** Expand `1:3,5,7:*` against the mailbox's UIDs. */
function expandSet(set: string, uids: number[]): Set<number> {
  const out = new Set<number>();
  const max = Math.max(0, ...uids);
  for (const range of set.split(',')) {
    const [a, b = a] = range.split(':');
    const lo = a === '*' ? max : Number(a);
    const hi = b === '*' ? max : Number(b);
    for (const u of uids) {
      if (u >= Math.min(lo, hi) && u <= Math.max(lo, hi)) out.add(u);
    }
  }
  return out;
}

export class FakeImapServer {
  readonly commands: FakeCommand[] = [];
  readonly mailboxes: Record<string, FakeMessage[]>;
  readonly port: number;
  private __uidNext: number;
  private __closed = false;
  private readonly __conns = new Set<Connection>();

  private constructor(
    private readonly __listener: Listener,
    port: number,
    private readonly __options: FakeImapOptions,
  ) {
    this.port = port;
    this.mailboxes = __options.mailboxes ?? { INBOX: [] };
    this.__uidNext = 1 +
      Math.max(0, ...Object.values(this.mailboxes).flat().map((m) => m.uid));
    this.__accept();
  }

  static async start(options: FakeImapOptions = {}): Promise<FakeImapServer> {
    for (let attempt = 0; attempt < 20; attempt++) {
      const port = nextPort++;
      try {
        const listener = await listen({
          port,
          hostname: '127.0.0.1',
          ...(options.tls ? { tls: options.tls } : {}),
        });
        return new FakeImapServer(listener, port, options);
      } catch (e) {
        if (attempt === 19) throw e;
      }
    }
    throw new Error('unreachable');
  }

  get capabilities(): string[] {
    return this.__options.capabilities ??
      ['IMAP4rev1', 'MOVE', 'UIDPLUS', 'AUTH=PLAIN'];
  }

  close(): void {
    if (this.__closed) return;
    this.__closed = true;
    for (const c of this.__conns) {
      try {
        c.close();
      } catch { /* already closed */ }
    }
    this.__listener.close();
  }

  private async __accept(): Promise<void> {
    while (!this.__closed) {
      let conn: Connection;
      try {
        conn = await this.__listener.accept();
      } catch {
        return;
      }
      this.__conns.add(conn);
      this.__serve(conn).catch(() => {}).finally(() => {
        this.__conns.delete(conn);
        try {
          conn.close();
        } catch { /* already closed */ }
      });
    }
  }

  private async __serve(conn: Connection): Promise<void> {
    let buf = new Uint8Array(0);
    const fill = async (): Promise<boolean> => {
      const chunk = await conn.read();
      if (chunk === null) return false;
      const grown = new Uint8Array(buf.length + chunk.length);
      grown.set(buf);
      grown.set(chunk, buf.length);
      buf = grown;
      return true;
    };
    const readLine = async (): Promise<string | null> => {
      for (;;) {
        const nl = buf.indexOf(0x0a);
        if (nl >= 0) {
          const line = DECODER.decode(buf.subarray(0, nl)).replace(/\r$/, '');
          buf = buf.subarray(nl + 1);
          return line;
        }
        if (!await fill()) return null;
      }
    };
    const readBytes = async (n: number): Promise<Uint8Array | null> => {
      while (buf.length < n) if (!await fill()) return null;
      const out = buf.slice(0, n);
      buf = buf.subarray(n);
      return out;
    };
    const write = async (text: string | Uint8Array) => {
      await conn.write(text);
    };
    const ctx: FakeContext = { conn, write, close: () => conn.close() };

    const greeting = this.__options.greeting ??
      `* OK [CAPABILITY ${this.capabilities.join(' ')}] fake ready\r\n`;
    if (greeting !== '') await write(greeting);

    let selected: string | undefined;
    for (;;) {
      let line = await readLine();
      if (line === null) return;
      // Client literal: acknowledge, take the bytes, then the rest of the line.
      let lit = /\{(\d+)\}$/.exec(line);
      while (lit) {
        await write('+ go ahead\r\n');
        const bytes = await readBytes(Number(lit[1]));
        if (bytes === null) return;
        const rest = await readLine();
        if (rest === null) return;
        line = line.slice(0, lit.index) + DECODER.decode(bytes) + rest;
        lit = /\{(\d+)\}$/.exec(line);
      }
      const m = /^(\S+)\s+(UID\s+\S+|\S+)\s*(.*)$/i.exec(line);
      if (!m) {
        await write(`* BAD malformed\r\n`);
        continue;
      }
      const cmd: FakeCommand = {
        tag: m[1]!,
        name: m[2]!.toUpperCase().replace(/\s+/, ' '),
        args: m[3]!,
        line,
      };
      this.commands.push(cmd);
      if ((await this.__options.before?.(cmd, ctx)) === false) continue;

      const ok = (text = 'done') => write(`${cmd.tag} OK ${text}\r\n`);
      const no = (text: string) => write(`${cmd.tag} NO ${text}\r\n`);
      const bad = (text: string) => write(`${cmd.tag} BAD ${text}\r\n`);
      const args = splitArgs(cmd.args);
      const box = () => selected === undefined ? undefined : this.mailboxes[selected];

      switch (cmd.name) {
        case 'CAPABILITY':
          await write(`* CAPABILITY ${this.capabilities.join(' ')}\r\n`);
          await ok();
          break;
        case 'NOOP':
          await ok();
          break;
        case 'LOGOUT':
          await write('* BYE logging out\r\n');
          await ok();
          return;
        case 'STARTTLS':
          await no('not in this fake');
          break;
        case 'LOGIN': {
          if (
            args[0] === (this.__options.user ?? 'user') &&
            args[1] === (this.__options.pass ?? 'pass')
          ) {
            await ok(`[CAPABILITY ${this.capabilities.join(' ')}] logged in`);
          } else {
            await no('[AUTHENTICATIONFAILED] Authentication failed.');
          }
          break;
        }
        case 'AUTHENTICATE': {
          if (args[0]?.toUpperCase() !== 'PLAIN') {
            await no('unsupported mechanism');
            break;
          }
          await write('+ \r\n');
          const answer = await readLine();
          if (answer === null) return;
          const [, user, pass] = atob(answer).split('\0');
          if (
            user === (this.__options.user ?? 'user') &&
            pass === (this.__options.pass ?? 'pass')
          ) {
            await ok('authenticated');
          } else {
            await no('[AUTHENTICATIONFAILED] Authentication failed.');
          }
          break;
        }
        case 'LIST': {
          for (const name of Object.keys(this.mailboxes)) {
            await write(`* LIST (\\HasNoChildren) "/" "${name}"\r\n`);
          }
          await ok();
          break;
        }
        case 'CREATE': {
          const name = args[0]!;
          if (this.mailboxes[name]) {
            await no('[ALREADYEXISTS] Mailbox already exists');
          } else {
            this.mailboxes[name] = [];
            await ok();
          }
          break;
        }
        case 'SELECT':
        case 'EXAMINE': {
          const name = args[0]!;
          const msgs = this.mailboxes[name];
          if (!msgs) {
            selected = undefined;
            await no(`[NONEXISTENT] Mailbox doesn't exist: ${name}`);
            break;
          }
          selected = name;
          await write(`* ${msgs.length} EXISTS\r\n`);
          await write(`* 0 RECENT\r\n`);
          await write(`* FLAGS (\\Answered \\Flagged \\Deleted \\Seen \\Draft)\r\n`);
          await write(`* OK [UIDVALIDITY 1761500000] UIDs valid\r\n`);
          await write(`* OK [UIDNEXT ${this.__uidNext}] Predicted next UID\r\n`);
          await write(`* OK [PERMANENTFLAGS (\\Seen \\Deleted \\*)] Flags permitted.\r\n`);
          const unseen = msgs.findIndex((m) => !m.flags.includes('\\Seen'));
          if (unseen >= 0) await write(`* OK [UNSEEN ${unseen + 1}] First unseen.\r\n`);
          await ok(cmd.name === 'EXAMINE' ? '[READ-ONLY] Examine completed' : '[READ-WRITE] Select completed');
          break;
        }
        case 'UID SEARCH': {
          const msgs = box();
          if (!msgs) {
            await bad('No mailbox selected');
            break;
          }
          let matches = [...msgs];
          const keys = splitArgs(cmd.args);
          let i = 0;
          if (keys[0]?.toUpperCase() === 'CHARSET') i = 2;
          let unknown: string | undefined;
          for (; i < keys.length; i++) {
            const key = keys[i]!.toUpperCase();
            if (key === 'ALL') continue;
            else if (key === 'SEEN') matches = matches.filter((m) => m.flags.includes('\\Seen'));
            else if (key === 'UNSEEN') matches = matches.filter((m) => !m.flags.includes('\\Seen'));
            else if (key === 'DELETED') matches = matches.filter((m) => m.flags.includes('\\Deleted'));
            else if (key === 'UNDELETED') matches = matches.filter((m) => !m.flags.includes('\\Deleted'));
            else if (key === 'SINCE') {
              const day = dayOf(keys[++i]!);
              matches = matches.filter((m) => dateOf(m.internalDate) >= day);
            } else if (key === 'BEFORE') {
              const day = dayOf(keys[++i]!);
              matches = matches.filter((m) => dateOf(m.internalDate) < day);
            } else if (key === 'UID') {
              const set = expandSet(keys[++i]!, msgs.map((m) => m.uid));
              matches = matches.filter((m) => set.has(m.uid));
            } else if (key === 'SUBJECT' || key === 'FROM') {
              const needle = keys[++i]!.toLowerCase();
              matches = matches.filter((m) => m.body.toLowerCase().includes(needle));
            } else {
              unknown = key;
            }
          }
          if (unknown) {
            await bad(`Unknown search key: ${unknown}`);
            break;
          }
          const uids = matches.map((m) => m.uid);
          if (this.__options.esearch) {
            await write(`* ESEARCH (TAG "${cmd.tag}") UID ALL ${uids.join(',')}\r\n`);
          } else {
            await write(`* SEARCH${uids.map((u) => ` ${u}`).join('')}\r\n`);
          }
          await ok();
          break;
        }
        case 'UID FETCH': {
          const msgs = box();
          if (!msgs) {
            await bad('No mailbox selected');
            break;
          }
          const set = expandSet(args[0]!, msgs.map((m) => m.uid));
          const items = args[1]!.slice(1, -1).toUpperCase().split(/\s+/);
          for (const [index, msg] of msgs.entries()) {
            if (!set.has(msg.uid)) continue;
            const parts: (string | Uint8Array)[] = [];
            const header = msg.body.slice(0, msg.body.indexOf('\r\n\r\n') + 4);
            for (const item of items) {
              if (item === 'UID') parts.push(`UID ${msg.uid}`);
              else if (item === 'FLAGS') parts.push(`FLAGS (${msg.flags.join(' ')})`);
              else if (item === 'INTERNALDATE') parts.push(`INTERNALDATE "${msg.internalDate}"`);
              else if (item === 'RFC822.SIZE') parts.push(`RFC822.SIZE ${ENCODER.encode(msg.body).length}`);
              else if (item === 'ENVELOPE') parts.push(`ENVELOPE ${msg.envelope ?? '(NIL NIL NIL NIL NIL NIL NIL NIL NIL NIL)'}`);
              else if (item === 'BODY.PEEK[]') parts.push('BODY[]', ENCODER.encode(msg.body));
              else if (item === 'BODY.PEEK[HEADER]') parts.push('BODY[HEADER]', ENCODER.encode(header));
            }
            let text = `* ${index + 1} FETCH (`;
            let first = true;
            for (const part of parts) {
              if (typeof part === 'string') {
                text += (first ? '' : ' ') + part;
                first = false;
                continue;
              }
              text += ` {${part.length}}\r\n`;
              await write(text);
              text = '';
              const chunk = this.__options.literalChunk ?? part.length;
              for (let off = 0; off < part.length; off += chunk) {
                await write(part.subarray(off, off + chunk));
                if (chunk < part.length) {
                  await new Promise((r) => setTimeout(r, 1));
                }
              }
            }
            await write(text + ')\r\n');
          }
          await ok('Fetch completed');
          break;
        }
        case 'UID STORE': {
          const msgs = box();
          if (!msgs) {
            await bad('No mailbox selected');
            break;
          }
          const set = expandSet(args[0]!, msgs.map((m) => m.uid));
          const op = args[1]!.toUpperCase();
          const flags = args[2]!.slice(1, -1).split(/\s+/).filter(Boolean);
          for (const [index, msg] of msgs.entries()) {
            if (!set.has(msg.uid)) continue;
            if (op.startsWith('+')) msg.flags = [...new Set([...msg.flags, ...flags])];
            else if (op.startsWith('-')) msg.flags = msg.flags.filter((f) => !flags.includes(f));
            else msg.flags = [...flags];
            if (!op.endsWith('.SILENT')) {
              await write(`* ${index + 1} FETCH (UID ${msg.uid} FLAGS (${msg.flags.join(' ')}))\r\n`);
            }
          }
          await ok('Store completed');
          break;
        }
        case 'UID COPY':
        case 'UID MOVE': {
          const msgs = box();
          if (!msgs) {
            await bad('No mailbox selected');
            break;
          }
          if (cmd.name === 'UID MOVE' && !this.capabilities.includes('MOVE')) {
            await bad('Unknown command');
            break;
          }
          const target = this.mailboxes[args[1]!];
          if (!target) {
            await no('[TRYCREATE] Mailbox does not exist');
            break;
          }
          const set = expandSet(args[0]!, msgs.map((m) => m.uid));
          const moved = msgs.filter((m) => set.has(m.uid));
          for (const msg of moved) {
            target.push({ ...msg, uid: this.__uidNext++ });
          }
          if (cmd.name === 'UID MOVE') {
            // Expunge from the highest sequence number down.
            for (let index = msgs.length - 1; index >= 0; index--) {
              if (set.has(msgs[index]!.uid)) {
                msgs.splice(index, 1);
                await write(`* ${index + 1} EXPUNGE\r\n`);
              }
            }
          }
          await ok(`[COPYUID 1761500000 ${args[0]} ${moved.map((_, i) => this.__uidNext - moved.length + i).join(',')}] done`);
          break;
        }
        case 'UID EXPUNGE':
        case 'EXPUNGE': {
          const msgs = box();
          if (!msgs) {
            await bad('No mailbox selected');
            break;
          }
          if (cmd.name === 'UID EXPUNGE' && !this.capabilities.includes('UIDPLUS')) {
            await bad('Unknown command');
            break;
          }
          const set = cmd.name === 'UID EXPUNGE'
            ? expandSet(args[0]!, msgs.map((m) => m.uid))
            : new Set(msgs.map((m) => m.uid));
          for (let index = msgs.length - 1; index >= 0; index--) {
            const msg = msgs[index]!;
            if (set.has(msg.uid) && msg.flags.includes('\\Deleted')) {
              msgs.splice(index, 1);
              await write(`* ${index + 1} EXPUNGE\r\n`);
            }
          }
          await ok('Expunge completed');
          break;
        }
        default:
          await bad(`Unknown command: ${cmd.name}`);
      }
    }
  }
}
