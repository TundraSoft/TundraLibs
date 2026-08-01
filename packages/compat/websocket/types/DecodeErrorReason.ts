/**
 * Reason an incoming frame failed to reach the message pipeline.
 *
 * - `'oversize'` — raw frame exceeded the configured
 *   `maxFrameSize`; dropped before decode.
 * - `'malformed'` — codec returned `null` (invalid JSON, wrong
 *   shape, binary input on a string codec, etc.).
 */
export type DecodeErrorReason = 'oversize' | 'malformed';
