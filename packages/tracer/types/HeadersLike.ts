/**
 * @fileoverview {@link HeadersLike} — the minimal header surface propagation
 * accepts, so it works with any framework's request representation.
 *
 * @author TundraSoft
 *
 * @module
 */

/**
 * Anything headers can be read from. Deliberately structural so propagation
 * never depends on a framework: a Web-standard `Headers`, Node's
 * `IncomingHttpHeaders`, a plain object, or an RPC envelope's metadata all
 * satisfy it.
 */
export type HeadersLike =
  | { get(name: string): string | null | undefined }
  | Record<string, string | string[] | undefined>;
