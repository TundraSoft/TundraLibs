/**
 * @fileoverview Single-socket RESP3/RESP2 connection wrapper.
 *
 * Each pooled `RedisEngine` resource is one of these. The wrapper
 * carries the receive buffer between successive commands on the same
 * connection, so partial frames split across `read()` calls are
 * reassembled correctly.
 *
 * @module
 */

import type { Connection } from '@tundralibs/compat';
import { EngineError } from '../../errors/mod.ts';
import { encodeCommand, parseReply, type RespValue } from './resp.ts';

/**
 * Wrapper around a single TCP connection that handles RESP framing.
 *
 * @internal
 */
export class RedisConnection {
  /**
   * Growable receive buffer. `__readOff` and `__writeOff` track the live
   * window; we compact in place when readOff catches up. Avoids the
   * O(n²) reallocate-and-copy of `new Uint8Array(old.length + chunk)`
   * per chunk on big replies.
   */
  private __buffer = new Uint8Array(8192);
  private __readOff = 0;
  private __writeOff = 0;
  private __closed = false;

  constructor(
    public readonly conn: Connection,
    private readonly __maxBufferBytes: number,
    private readonly __instanceId: string,
  ) {}

  get closed(): boolean {
    return this.__closed;
  }

  /** Send a RESP command and return the parsed reply (skipping push frames). */
  async send(parts: ReadonlyArray<string | number>): Promise<RespValue> {
    if (this.__closed) {
      throw new EngineError('NO_CONNECTION', { instanceId: this.__instanceId });
    }
    try {
      await this.conn.write(encodeCommand(parts));
    } catch (e) {
      // A rejected write (ECONNRESET, EPIPE, broken TLS) leaves this socket
      // unusable — on Node/Bun permanently so, since compat's
      // `wrapNodeSocket` stores the error and rejects every later call. Mark
      // it closed so `_validateResource` (`!conn.closed`) rejects it and the
      // pool destroys it. Without this the flag only ever flipped on a clean
      // EOF or a buffer overflow, so any caller that releases rather than
      // destroys — `BaseEngine.ping()` always does — would put the corpse
      // back in the idle list, where it validates true forever.
      this.__closed = true;
      throw e;
    }
    return await this.readReply();
  }

  /** Read until a complete frame is available; returns it. */
  async readReply(): Promise<RespValue> {
    while (true) {
      if (this.__writeOff > this.__readOff) {
        const window = this.__buffer.subarray(this.__readOff, this.__writeOff);
        const result = parseReply(window);
        if (result) {
          this.__readOff += result.consumed;
          if (this.__readOff === this.__writeOff) {
            this.__readOff = 0;
            this.__writeOff = 0;
          }
          if (result.value.kind === 'push') continue;
          return result.value;
        }
      }
      let chunk: Uint8Array | null;
      try {
        chunk = await this.conn.read();
      } catch (e) {
        // A rejected read (transport reset, aborted timeout) — same reasoning
        // as the write above: mark closed so the poisoned connection fails
        // validation and is destroyed instead of being handed back out
        // mid-protocol.
        this.__closed = true;
        throw e;
      }
      if (chunk === null) {
        this.__closed = true;
        throw new EngineError('CONNECTION_LOST', {
          instanceId: this.__instanceId,
          reason: 'Redis connection closed mid-reply',
        });
      }
      this.__appendChunk(chunk);
      if (this.__writeOff - this.__readOff > this.__maxBufferBytes) {
        // The reply outgrew the cap. The frame is only partially received (or
        // fully buffered but unconsumable) and the tail is still streaming in,
        // so this socket is permanently desynced — there is no buffer-reset
        // path. Close it BEFORE throwing so `closed` reflects reality: the
        // pool's `_validateResource` (`!conn.closed`) then rejects it and it
        // is destroyed instead of being recycled mid-frame, which would hand
        // the leftover bytes to the next command as its own reply (silent
        // cross-request data leakage).
        this.close();
        throw new EngineError('OPERATION_FAILED', {
          instanceId: this.__instanceId,
          operation: 'readReply',
          reason:
            `reply exceeds max buffer size (${this.__maxBufferBytes} bytes)`,
        });
      }
    }
  }

  close(): void {
    if (this.__closed) return;
    this.__closed = true;
    try {
      this.conn.close();
    } catch {
      // already closed at the socket level — ignore
    }
  }

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
}
