/**
 * @fileoverview The stream-body primitives behind the streaming response
 * model: detect a stream body, wrap an async iterable into a
 * `ReadableStream`, frame Server-Sent Events, and open a cross-runtime
 * file read stream (optionally a byte range). The transport already streams
 * a `Response` body chunk-wise on every runtime; these only PRODUCE the body.
 *
 * @module
 */
import { isDeno } from '@tundralibs/compat/runtime';
import { RapidError } from '../errors/mod.ts';
import type { RapidContextResponse } from '../types/mod.ts';

const encoder = new TextEncoder();

/** A body that must be STREAMED, never buffered: a stream or an async iterable. */
export type StreamBody =
  | ReadableStream<Uint8Array>
  | AsyncIterable<
    Uint8Array | string
  >;

/** Whether `content` is a stream body (a `ReadableStream` or async iterable). */
export const isStreamBody = (
  content: RapidContextResponse['content'] | null,
): content is StreamBody =>
  content !== null && typeof content === 'object' &&
  (content instanceof ReadableStream ||
    typeof (content as AsyncIterable<unknown>)[Symbol.asyncIterator] ===
      'function');

/**
 * Normalize a stream body to a `ReadableStream<Uint8Array>`: a stream passes
 * through; an async iterable is pulled chunk-by-chunk (strings UTF-8
 * encoded). Cancelling the stream (client disconnect) returns the iterator,
 * so a generator's `finally` runs.
 */
export function toReadableStream(body: StreamBody): ReadableStream<Uint8Array> {
  if (body instanceof ReadableStream) return body;
  const iterator = body[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(
        typeof value === 'string' ? encoder.encode(value) : value,
      );
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

/** One Server-Sent Event. `data` objects are JSON-serialised. */
export type SseEvent = {
  /** Event payload; a non-string is JSON-serialised. Multi-line strings are framed per line. */
  data: unknown;
  /** The `event:` name (the client's listener key). */
  event?: string;
  /** The `id:` for `Last-Event-ID` resumption. */
  id?: string;
  /** The `retry:` reconnection hint in ms. */
  retry?: number;
};

/** Frame one event per the SSE spec (`text/event-stream`). */
export const frameSseEvent = (e: SseEvent): string => {
  let out = '';
  if (e.event !== undefined) out += `event: ${e.event}\n`;
  if (e.id !== undefined) out += `id: ${e.id}\n`;
  if (e.retry !== undefined) out += `retry: ${e.retry}\n`;
  const data = typeof e.data === 'string' ? e.data : JSON.stringify(e.data);
  for (const line of data.split('\n')) out += `data: ${line}\n`;
  return out + '\n';
};

/**
 * Wrap a source of events into an SSE body stream. Each yielded {@link SseEvent}
 * is framed and written; a client disconnect cancels the stream, which returns
 * the source iterator so a generator's `finally` runs (cleanup / unsubscribe).
 */
export function sseStream(
  events: AsyncIterable<SseEvent>,
): ReadableStream<Uint8Array> {
  const iterator = events[Symbol.asyncIterator]();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(frameSseEvent(value)));
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

/**
 * Open a file as a `ReadableStream<Uint8Array>` without buffering it, on every
 * runtime — `Deno.open(...).readable` on Deno, `fs.createReadStream` converted
 * via `Readable.toWeb` on Bun/Node. `start`/`end` are INCLUSIVE byte offsets
 * for a range read (Range/206). Rejects on a filesystem-less runtime.
 *
 * @throws {@link RapidError} RAPID_UNHANDLED when no file API is available
 *   (Workers / browser) — callers serving files already guard this.
 */
export async function fileStream(
  path: string,
  range?: { start: number; end: number },
): Promise<ReadableStream<Uint8Array>> {
  if (isDeno) {
    // deno-lint-ignore no-explicit-any
    const D = (globalThis as any).Deno;
    const file = await D.open(path, { read: true });
    if (range !== undefined) {
      await file.seek(range.start, D.SeekMode.Start);
      return limitStream(file.readable, range.end - range.start + 1);
    }
    return file.readable;
  }
  // Bun / Node: node:fs + node:stream via the builtin loader.
  // deno-lint-ignore no-explicit-any
  const proc = (globalThis as any).process;
  const fs = proc?.getBuiltinModule?.('node:fs');
  const stream = proc?.getBuiltinModule?.('node:stream');
  if (fs === undefined || stream === undefined) {
    throw new RapidError('RAPID_UNHANDLED', {
      message: 'file streaming is unavailable in this runtime (no filesystem)',
    });
  }
  const nodeStream = fs.createReadStream(
    path,
    range === undefined ? {} : { start: range.start, end: range.end },
  );
  return stream.Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
}

/** Truncate a stream after `limit` bytes (Deno has no `end` on `open`). */
function limitStream(
  source: ReadableStream<Uint8Array>,
  limit: number,
): ReadableStream<Uint8Array> {
  let remaining = limit;
  return source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        if (remaining <= 0) return;
        const take = chunk.byteLength <= remaining
          ? chunk
          : chunk.subarray(0, remaining);
        remaining -= take.byteLength;
        controller.enqueue(take);
        if (remaining <= 0) controller.terminate();
      },
    }),
  );
}
