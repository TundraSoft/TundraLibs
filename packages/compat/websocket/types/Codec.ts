import type { WebSocketData } from '../../webserver/types/mod.ts';

/**
 * Codec contract — pluggable serialiser for messages flowing through
 * {@link WebSocketServer}. `encode` produces wire-format payload;
 * `decode` parses incoming frames and returns `null` to signal a
 * malformed message (routed to `onDecodeError` rather than surfaced
 * as a regular message).
 *
 * Built-in implementations: {@link StringCodec}, {@link JsonCodec},
 * {@link BinaryCodec}. For custom wire formats, implement this
 * contract yourself.
 *
 * @typeParam M - Decoded message type.
 */
export type Codec<M> = {
  encode(message: M): WebSocketData;
  decode(raw: WebSocketData): M | null;
};
