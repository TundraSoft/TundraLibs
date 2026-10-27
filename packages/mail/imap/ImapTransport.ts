/**
 * @fileoverview Byte framing over a compat {@link Connection}: CRLF lines
 * and counted literals, with a growable receive buffer so a reply split
 * across `read()` calls is reassembled, and a literal larger than the
 * caller's limit is drained instead of buffered.
 *
 * @module
 */

import type { Connection } from '@tundralibs/compat/net';

const INITIAL_BUFFER = 16 * 1024;

/**
 * Wraps one socket for the IMAP client.
 *
 * @internal
 */
export class ImapTransport {
  private __buffer = new Uint8Array(INITIAL_BUFFER);
  private __readOff = 0;
  private __writeOff = 0;
  private __closed = false;
  private __released = false;

  constructor(private readonly __conn: Connection) {}

  get closed(): boolean {
    return this.__closed;
  }

  /**
   * Read one line without its CRLF (a bare LF also ends a line). Returns
   * `null` when the peer closed before a line was complete.
   */
  async readLine(): Promise<Uint8Array | null> {
    // Bytes already scanned for a newline, relative to the read offset,
    // so a compaction inside __fill does not make us rescan them.
    let scanned = 0;
    for (;;) {
      const nl = this.__buffer.subarray(0, this.__writeOff).indexOf(
        0x0a,
        this.__readOff + scanned,
      );
      if (nl >= 0) {
        const end = nl > this.__readOff && this.__buffer[nl - 1] === 0x0d
          ? nl - 1
          : nl;
        const line = this.__buffer.slice(this.__readOff, end);
        this.__consume(nl + 1);
        return line;
      }
      scanned = this.__writeOff - this.__readOff;
      if (!await this.__fill()) return null;
    }
  }

  /**
   * Read exactly `size` bytes, returning the first `keep` of them and
   * discarding the rest as they arrive. Returns `null` when the peer
   * closed early.
   */
  async readBytes(size: number, keep: number): Promise<Uint8Array | null> {
    const out = new Uint8Array(Math.min(size, keep));
    let kept = 0;
    let consumed = 0;
    while (consumed < size) {
      const available = this.__writeOff - this.__readOff;
      if (available === 0) {
        if (!await this.__fill()) return null;
        continue;
      }
      const take = Math.min(available, size - consumed);
      const toKeep = Math.min(take, out.length - kept);
      if (toKeep > 0) {
        out.set(
          this.__buffer.subarray(this.__readOff, this.__readOff + toKeep),
          kept,
        );
        kept += toKeep;
      }
      this.__consume(this.__readOff + take);
      consumed += take;
    }
    return out;
  }

  async write(data: Uint8Array | string): Promise<void> {
    try {
      await this.__conn.write(data);
    } catch (e) {
      this.__closed = true;
      throw e;
    }
  }

  /**
   * Release the socket. Idempotent, and still needed after EOF or a
   * socket error: those only mark the transport unusable, the
   * descriptor stays open until this runs.
   */
  close(): void {
    this.__closed = true;
    if (this.__released) return;
    this.__released = true;
    try {
      this.__conn.close();
    } catch {
      // already closed at the socket level
    }
  }

  /** Advance the read offset to `to`, resetting the window when empty. */
  private __consume(to: number): void {
    this.__readOff = to;
    if (this.__readOff === this.__writeOff) {
      this.__readOff = 0;
      this.__writeOff = 0;
    }
  }

  /** Append the next chunk from the socket; `false` on EOF. */
  private async __fill(): Promise<boolean> {
    let chunk: Uint8Array | null;
    try {
      chunk = await this.__conn.read();
    } catch (e) {
      this.__closed = true;
      throw e;
    }
    if (chunk === null) {
      this.__closed = true;
      return false;
    }
    const live = this.__writeOff - this.__readOff;
    const needed = live + chunk.length;
    if (needed > this.__buffer.length) {
      let cap = this.__buffer.length;
      while (cap < needed) cap *= 2;
      const grown = new Uint8Array(cap);
      grown.set(this.__buffer.subarray(this.__readOff, this.__writeOff));
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
    return true;
  }
}
