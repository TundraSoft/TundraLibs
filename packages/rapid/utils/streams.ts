/**
 * @fileoverview The stream-body primitives behind the streaming response
 * model: detect a stream body, wrap an async iterable into a
 * `ReadableStream`, and frame Server-Sent Events. (File streams come from
 * compat's `readFileStream`.) The transport already streams a `Response`
 * body chunk-wise on every runtime; these only PRODUCE the body.
 *
 * @module
 */
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
