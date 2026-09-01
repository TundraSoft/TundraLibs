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

/** EOL characters are field delimiters in SSE — never data (see below). */
const stripEol = (value: string): string => value.replace(/[\r\n]/g, '');

/** Frame one event per the SSE spec (`text/event-stream`). */
export const frameSseEvent = (e: SseEvent): string => {
  let out = '';
  // `event`/`id` are single-line by spec, and a bare CR ends a line for
  // EventSource just like LF — left intact, a value could INJECT its own
  // `event:`/`data:` fields into the stream. Data splits on ALL three
  // line endings for the same reason: a lone `\r` mid-value would
  // otherwise ride out unframed.
  if (e.event !== undefined) out += `event: ${stripEol(e.event)}\n`;
  if (e.id !== undefined) out += `id: ${stripEol(e.id)}\n`;
  if (e.retry !== undefined) out += `retry: ${e.retry}\n`;
  const data = typeof e.data === 'string' ? e.data : JSON.stringify(e.data);
  for (const line of data.split(/\r\n|\r|\n/)) out += `data: ${line}\n`;
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
