/**
 * @fileoverview Cross-runtime UDP datagram sender.
 *
 * Sender-only abstraction — opens a UDP socket bound to an ephemeral
 * local port, fires `send(data, host, port)` at any remote address,
 * and `close()` when done. Receive paths are not exposed by design;
 * the use cases that drove this shim (syslog UDP, metrics sinks,
 * fire-and-forget telemetry) are all one-way.
 *
 * UDP is best-effort: a successful `send` only means the kernel
 * accepted the bytes, not that the datagram was delivered.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { udpSocket } from '@tundralibs/compat/udp';
 *
 * const sock = await udpSocket();
 * await sock.send('hello', '127.0.0.1', 514);
 * sock.close();
 * ```
 */
import { isBun, isDeno, isNode } from './runtime.ts';
import { UnsupportedRuntimeError } from './Error.ts';
import { Bun } from './_runtime-globals.ts';

let nodeDgram: typeof import('node:dgram');
if (isNode) {
  nodeDgram = await import('node:dgram');
}

/**
 * Open UDP socket abstraction.
 *
 * `send` resolves when the kernel accepts the datagram; with UDP
 * there's no acknowledgement, so success here does **not** mean the
 * peer received it.
 */
export type UdpSocket = {
  /**
   * Fire one datagram at the given remote address. `data` is either
   * UTF-8-encoded text (passed as `string`) or raw bytes.
   *
   * @returns Number of bytes the kernel accepted.
   */
  send(data: Uint8Array | string, host: string, port: number): Promise<number>;
  /** Close the socket. Idempotent — safe to call repeatedly. */
  close(): void;
};

/**
 * Options for {@link udpSocket}. All fields optional — defaults bind
 * an IPv4 socket on a kernel-assigned ephemeral port, which is the
 * common case for sender-only sockets.
 */
export type UdpSocketOptions = {
  /**
   * Local hostname to bind to. Defaults to `'0.0.0.0'` (all IPv4
   * interfaces). Pass `'::'` for IPv6.
   */
  hostname?: string;
  /**
   * Local port to bind to. Defaults to `0` — the kernel picks an
   * ephemeral port. Rarely needs to be set for sender-only sockets.
   */
  port?: number;
};

/**
 * Open a UDP socket and return a sender-only handle. The local
 * binding (hostname/port) is incidental — most callers just want
 * `udpSocket()` and then `socket.send(...)`.
 */
export async function udpSocket(
  options: UdpSocketOptions = {},
): Promise<UdpSocket> {
  const encoder = new TextEncoder();
  const toBytes = (data: Uint8Array | string): Uint8Array =>
    typeof data === 'string' ? encoder.encode(data) : data;
  const hostname = options.hostname ?? '0.0.0.0';
  const port = options.port ?? 0;

  /* c8 ignore start */
  if (isDeno) {
    const sock = Deno.listenDatagram({
      transport: 'udp',
      hostname,
      port,
    });
    let closed = false;
    return {
      send: (data, host, remotePort) => {
        const bytes = toBytes(data);
        return sock.send(bytes, {
          transport: 'udp',
          hostname: host,
          port: remotePort,
        });
      },
      close: () => {
        if (closed) return;
        closed = true;
        try {
          sock.close();
        } catch {
          // Already closed.
        }
      },
    };
  }

  if (isBun) {
    const sock = await Bun.udpSocket({
      hostname,
      port,
      // Sender-only — the receive callback is required by the API
      // but never fires in practice.
      socket: {
        data: () => {},
        drain: () => {},
      },
    });
    let closed = false;
    return {
      // deno-lint-ignore require-await
      send: async (data, host, remotePort) => {
        const bytes = toBytes(data);
        const ok = sock.send(bytes, remotePort, host);
        if (!ok) {
          throw new Error(
            `UDP send failed (socket buffer full or peer unreachable): ${host}:${remotePort}`,
          );
        }
        return bytes.length;
      },
      close: () => {
        if (closed) return;
        closed = true;
        try {
          sock.close();
        } catch {
          // Already closed.
        }
      },
    };
  }

  if (isNode) {
    // Pick the socket family from the bind address: an IPv6 literal
    // (contains ':', e.g. '::') needs 'udp6', else 'udp4'. Hardcoding
    // 'udp4' made the documented '::' IPv6 hostname fail on Node.
    const socketType = hostname && hostname.includes(':') ? 'udp6' : 'udp4';
    const sock = nodeDgram.createSocket(socketType);
    // Bind before first send — kernel picks an ephemeral local port
    // when `port: 0`. We surface bind errors as promise rejection
    // (e.g. port-in-use when the caller pins a local port).
    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => reject(err);
      sock.once('error', onError);
      sock.bind(port, hostname, () => {
        sock.removeListener('error', onError);
        resolve();
      });
    });
    let closed = false;
    return {
      send: (data, host, remotePort) => {
        const bytes = toBytes(data);
        return new Promise<number>((resolve, reject) => {
          sock.send(bytes, remotePort, host, (err, bytesSent) => {
            if (err) return reject(err);
            resolve(bytesSent);
          });
        });
      },
      close: () => {
        if (closed) return;
        closed = true;
        try {
          sock.close();
        } catch {
          // Already closed.
        }
      },
    };
  }

  throw new UnsupportedRuntimeError('udpSocket');
  /* c8 ignore stop */
}
