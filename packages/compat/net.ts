/**
 * @fileoverview Cross-runtime networking utilities.
 *
 * Provides a unified API for networking operations across Deno, Bun,
 * and Node.js runtimes including TCP listeners and hostname resolution.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { listen, hostname } from '@tundralibs/compat/net';
 *
 * const listener = listen({ port: 8080 });
 * listener.close();
 *
 * const host = await hostname();
 * ```
 */
import { isBun, isDeno, isNode } from './runtime.ts';
import { loadBuiltin } from './_runtime-globals.ts';
import { ConnectionTimeoutError, UnsupportedRuntimeError } from './Error.ts';
import type { TLSOptions, ValidatedTLS } from './common.ts';
import { combineSignals, validateTLS } from './common.ts';

// Local aliases for Deno-only types — see _runtime-globals.ts header.
// `any` typing avoids the consumer-side clash between our declarations
// and Deno's `lib.deno.net.d.ts`; the runtime objects carry the real
// methods at execution time.
// deno-lint-ignore no-explicit-any
type DenoConn = any;
// deno-lint-ignore no-explicit-any
type DenoTcpConn = any;
// deno-lint-ignore no-explicit-any
type DenoListenTlsOptions = any;
// deno-lint-ignore no-explicit-any
type DenoConnectTlsOptions = any;
// deno-lint-ignore no-explicit-any
type DenoStartTlsOptions = any;
// deno-lint-ignore no-explicit-any
type DenoTlsCertifiedKeyPem = any;

// Node.js built-ins, resolved synchronously through
// `process.getBuiltinModule` (see {@link loadBuiltin}). A top-level
// `await import()` here would make bundlers lower every consumer module to
// an async initializer, deadlocking legal circular imports.
const nodeNet: typeof import('node:net') = isBun || isNode
  ? loadBuiltin('node:net')
  : undefined;
const nodeTls: typeof import('node:tls') = isBun || isNode
  ? loadBuiltin('node:tls')
  : undefined;
const nodeBuffer: typeof import('node:buffer') = isBun || isNode
  ? loadBuiltin('node:buffer')
  : undefined;
const nodeOs: typeof import('node:os') = isBun || isNode
  ? loadBuiltin('node:os')
  : undefined;
// deno-lint-ignore no-explicit-any
const g = globalThis as any;

/**
 * Options for creating a TCP, TLS, or Unix socket listener.
 */
export type ListenOptions =
  | {
    /**
     * The port number to listen on.
     */
    port: number;

    /**
     * The hostname to bind to.
     * @default "0.0.0.0"
     */
    hostname?: string;

    /**
     * TLS configuration for secure connections.
     * When provided, creates a TLS/SSL encrypted listener.
     *
     * - Provide `true` for TLS without client certificate validation
     * - Provide TLSOptions object for server certificates and optional client validation
     */
    tls?: boolean | TLSOptions;

    /**
     * AbortSignal to close the listener.
     * When the signal is aborted, the listener is automatically closed.
     * Useful for graceful shutdown scenarios.
     * @default undefined (no automatic closure)
     */
    signal?: AbortSignal;
  }
  | {
    /**
     * The Unix socket path to listen on.
     */
    path: string;

    /**
     * AbortSignal to close the listener.
     * When the signal is aborted, the listener is automatically closed.
     * @default undefined (no automatic closure)
     */
    signal?: AbortSignal;
  };

/**
 * Options for creating a TCP connection.
 */
export type ConnectOptions =
  | {
    /**
     * The port number to connect to.
     */
    port: number;

    /**
     * The hostname to connect to.
     * @default "127.0.0.1"
     */
    hostname?: string;

    /**
     * TLS configuration for secure connections.
     * When provided, creates a TLS/SSL encrypted connection.
     *
     * - Provide `true` for TLS without client certificates
     * - Provide TLSOptions object for client certificate authentication
     */
    tls?: boolean | TLSOptions;

    /**
     * Connection timeout in milliseconds.
     * If the connection is not established within this time, it will be aborted.
     * @default undefined (no timeout)
     */
    timeout?: number;

    /**
     * AbortSignal to cancel the connection attempt.
     * Can be used for manual cancellation or with AbortSignal.timeout().
     * If both timeout and signal are provided, the connection aborts when either triggers.
     * @default undefined (no cancellation)
     */
    signal?: AbortSignal;
  }
  | {
    /**
     * The Unix socket path to connect to.
     */
    path: string;

    /**
     * Connection timeout in milliseconds.
     * If the connection is not established within this time, it will be aborted.
     * @default undefined (no timeout)
     */
    timeout?: number;

    /**
     * AbortSignal to cancel the connection attempt.
     * Can be used for manual cancellation.
     * If both timeout and signal are provided, the connection aborts when either triggers.
     * @default undefined (no cancellation)
     */
    signal?: AbortSignal;
  };

/**
 * A cross-runtime TCP, TLS, or Unix socket listener interface.
 */
export type Listener = {
  /**
   * Accepts an incoming connection.
   *
   * Blocks until a connection is received. Returns a Connection object
   * for communicating with the client.
   *
   * @returns A promise that resolves to a Connection object
   */
  accept(): Promise<Connection>;

  /**
   * Closes the listener and releases the port/socket.
   */
  close(): void;
};

/**
 * A cross-runtime TCP connection type.
 *
 * Provides a unified API for TCP connections across Deno, Bun, and Node.js.
 */
export type Connection = {
  /**
   * Reads data from the connection.
   *
   * Returns binary data as received from the network. The data may be a partial
   * message, a complete message, or multiple messages - TCP does not preserve
   * message boundaries. The caller is responsible for protocol-level parsing.
   *
   * @returns A promise that resolves to:
   *   - Uint8Array containing the received data
   *   - null if the connection has been closed (EOF)
   *
   * @example
   * ```typescript
   * const data = await conn.read();
   * if (data) {
   *   const text = new TextDecoder().decode(data);
   *   console.log('Received:', text);
   * }
   * ```
   */
  read(): Promise<Uint8Array | null>;

  /**
   * Writes data to the connection.
   *
   * @param data - Data to write (Uint8Array or string)
   * @returns A promise that resolves to the number of bytes written
   */
  write(data: Uint8Array | string): Promise<number>;

  /**
   * Closes the connection.
   */
  close(): void;

  /**
   * The remote address information.
   */
  readonly remoteAddr?: {
    hostname: string;
    port: number;
  };

  /**
   * The local address information.
   */
  readonly localAddr?: {
    hostname: string;
    port: number;
  };

  /**
   * The underlying raw socket. Carried so {@link upgradeTls} can
   * re-wrap the socket with a TLS layer in place — needed by
   * protocols that negotiate TLS *after* a plaintext exchange (e.g.
   * Postgres SSLRequest, SMTP STARTTLS).
   *
   * The runtime-specific value is opaque to callers:
   *
   * - On Deno: a `Deno.Conn`.
   * - On Node / Bun: a `node:net` Socket.
   * - On Unix-socket connections: also the underlying handle, but
   *   `upgradeTls` rejects those (TLS over Unix sockets isn't a use
   *   case we support).
   *
   * @internal
   */
  // deno-lint-ignore no-explicit-any
  readonly _raw?: any;
};

/**
 * Wraps a Node.js-style socket into a Connection interface.
 * @internal
 */
// deno-lint-ignore no-explicit-any
function wrapNodeSocket(socket: any): Connection {
  // Event-buffered model. A Node socket is an EventEmitter, which forces
  // two things the old once()-per-read model got wrong:
  //   1. An 'error' event with NO listener is re-thrown by Node as an
  //      uncaught exception that crashes the process. Accepted sockets
  //      had no persistent 'error' listener, so a peer reset (ECONNRESET)
  //      with no read() pending killed the process.
  //   2. 'data'/'end' fire once; a chunk or EOF arriving between two
  //      read() calls was dropped, so the next read() hung forever.
  // Durable listeners buffer whatever arrives and hand it to read()
  // whether or not a read() is currently waiting.
  const chunks: Uint8Array[] = [];
  let ended = false;
  let socketError: Error | undefined;
  let waiting:
    | { resolve: (v: Uint8Array | null) => void; reject: (e: Error) => void }
    | undefined;

  const deliver = () => {
    if (!waiting) return;
    const w = waiting;
    if (chunks.length > 0) {
      waiting = undefined;
      w.resolve(chunks.shift()!);
    } else if (socketError) {
      waiting = undefined;
      w.reject(socketError);
    } else if (ended) {
      waiting = undefined;
      w.resolve(null);
    }
  };

  // deno-lint-ignore no-explicit-any
  socket.on('data', (data: any) => {
    chunks.push(new Uint8Array(data));
    deliver();
  });
  socket.on('end', () => {
    ended = true;
    deliver();
  });
  // Persisting the error is secondary; the listener EXISTING is what stops
  // Node from crashing the process on an unhandled 'error'.
  socket.on('error', (err: Error) => {
    socketError = err;
    deliver();
  });

  return {
    read: () => {
      return new Promise<Uint8Array | null>((resolve, reject) => {
        // Drain buffered state before parking — data/end/error may already
        // have arrived (before this read(), or between reads).
        if (chunks.length > 0) return resolve(chunks.shift()!);
        if (socketError) return reject(socketError);
        if (ended) return resolve(null);
        waiting = { resolve, reject };
      });
    },
    write: (data: Uint8Array | string) => {
      return new Promise<number>((resolveWrite, rejectWrite) => {
        if (socketError) return rejectWrite(socketError);
        const bytes = typeof data === 'string'
          ? data
          : nodeBuffer.Buffer.from(data);

        socket.write(bytes, (err: Error | null | undefined) => {
          if (err) {
            rejectWrite(err);
          } else {
            // Resolve with the number of bytes actually written, not
            // `data.length`. For a string that is the UTF-8 byte length
            // (`socket.write` encodes as UTF-8 by default) — the UTF-16
            // code-unit count `data.length` under-reports every multi-byte
            // character. For a `Uint8Array`, `length === byteLength`.
            resolveWrite(
              typeof data === 'string'
                ? nodeBuffer.Buffer.byteLength(data)
                : data.length,
            );
          }
        });
      });
    },
    close: () => {
      try {
        socket.end();
        socket.destroy();
      } catch {
        // Ignore errors from closing an already-closed connection
      }
    },
    remoteAddr: socket.remoteAddress && socket.remotePort
      ? { hostname: socket.remoteAddress, port: socket.remotePort }
      : undefined,
    localAddr: socket.localAddress && socket.localPort
      ? { hostname: socket.localAddress, port: socket.localPort }
      : undefined,
    _raw: socket,
  };
}

/**
 * Creates a TCP, TLS, or Unix socket listener.
 *
 * This function provides a unified API across Deno, Bun, and Node.js for
 * creating network listeners with optional TLS encryption.
 *
 * **Runtime Implementation:**
 * - **Deno**: Uses `Deno.listen()` for TCP/Unix, `Deno.listenTls()` for TLS
 * - **Bun**: Uses Node.js-compatible `net.createServer()` for TCP/Unix, `tls.createServer()` for TLS
 * - **Node.js**: Uses `net.createServer()` for TCP/Unix, `tls.createServer()` for TLS
 *
 * @param options - Listener configuration options
 * @returns A promise that resolves to a listener object with `accept()` and `close()` methods
 * @throws {Error} If the port is already in use or if binding fails
 * @throws {FetchPathTraversalError} If TLS file paths contain traversal sequences
 * @throws {FetchFileNotFoundError} If TLS certificate/key files don't exist
 * @throws {FetchInvalidPEMError} If TLS certificates are not valid PEM format
 *
 * @example TCP listener:
 * ```typescript
 * const listener = await listen({ port: 8080 });
 * const conn = await listener.accept();
 * await conn.write('Hello client!\\n');
 * conn.close();
 * listener.close();
 * ```
 *
 * @example TLS listener:
 * ```typescript
 * const listener = await listen({
 *   port: 8443,
 *   tls: {
 *     certFile: '/path/to/server.crt',
 *     keyFile: '/path/to/server.key',
 *   }
 * });
 * const conn = await listener.accept();
 * conn.close();
 * listener.close();
 * ```
 *
 * @example Unix socket listener:
 * ```typescript
 * const listener = await listen({ path: '/tmp/app.sock' });
 * const conn = await listener.accept();
 * conn.close();
 * listener.close();
 * ```
 *
 * @example Listener with abort signal for graceful shutdown:
 * ```typescript
 * const controller = new AbortController();
 *
 * const listener = await listen({
 *   port: 8080,
 *   signal: controller.signal
 * });
 *
 * // Later, for graceful shutdown
 * controller.abort();  // Automatically closes the listener
 * ```
 */
export async function listen(options: ListenOptions): Promise<Listener> {
  // Common TLS validation (before runtime-specific code)
  let tlsCert: string | undefined;
  let tlsKey: string | undefined;
  let tlsCa: string[] | undefined;

  // Validate TLS options if provided (not for Unix sockets)
  if ('port' in options && options.tls && typeof options.tls === 'object') {
    const validated = validateTLS(options.tls);

    tlsCert = validated.cert;
    tlsKey = validated.key;
    tlsCa = validated.ca;
  }

  // Handle abort signal if provided
  const signal = 'signal' in options ? options.signal : undefined;

  /* c8 ignore start */
  if (isDeno) {
    // Unix socket listener
    if ('path' in options) {
      const listener = Deno.listen({ path: options.path, transport: 'unix' });

      // Set up signal handler if provided
      if (signal) {
        const onAbort = () => {
          try {
            listener.close();
          } catch {
            // Ignore errors from closing
          }
        };
        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener('abort', onAbort, { once: true });
        }
      }

      return {
        accept: async () => {
          const conn = await listener.accept();
          return {
            read: async () => {
              const buffer = new Uint8Array(8192);
              const n = await conn.read(buffer);
              return n === null ? null : buffer.subarray(0, n);
            },
            write: (data: Uint8Array | string) => {
              const bytes = typeof data === 'string'
                ? new TextEncoder().encode(data)
                : data;
              return conn.write(bytes);
            },
            close: () => {
              try {
                conn.close();
              } catch {
                // Ignore errors from closing an already-closed connection
              }
            },
            remoteAddr: undefined,
            localAddr: undefined,
          };
        },
        close: () => {
          try {
            listener.close();
          } catch {
            // Ignore errors from closing an already-closed listener
          }
        },
      };
    }

    // TCP or TLS listener
    const { port, hostname = '0.0.0.0', tls } = options;

    // Attach the abort-signal handler AFTER the listener is created so
    // `onAbort` never dereferences the `listener` binding while it is in
    // the temporal dead zone. Previously the handler was installed above
    // this point: a pre-aborted signal invoked `onAbort` while `listener`
    // was still uninitialized, throwing a ReferenceError that the empty
    // catch swallowed — the port was leaked, and for TLS (which returns
    // before the outer `listener` is ever assigned) the signal could
    // never close the listener at all. Each branch calls this with its
    // own initialized listener.
    const attachAbort = (l: { close: () => void }) => {
      if (!signal) return;
      const onAbort = () => {
        try {
          l.close();
        } catch {
          // Ignore errors from closing
        }
      };
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    };

    if (tls) {
      // TLS listener
      const tlsOptions = {
        port,
        hostname,
        cert: tlsCert || '',
        key: tlsKey || '',
        caCerts: tlsCa,
      };

      const listener = Deno.listenTls(
        tlsOptions as DenoListenTlsOptions & DenoTlsCertifiedKeyPem,
      );

      attachAbort(listener);

      return {
        accept: async () => {
          const conn = await listener.accept();
          return {
            read: async () => {
              const buffer = new Uint8Array(8192);
              const n = await conn.read(buffer);
              return n === null ? null : buffer.subarray(0, n);
            },
            write: (data: Uint8Array | string) => {
              const bytes = typeof data === 'string'
                ? new TextEncoder().encode(data)
                : data;
              return conn.write(bytes);
            },
            close: () => {
              try {
                conn.close();
              } catch {
                // Ignore errors from closing an already-closed connection
              }
            },
            remoteAddr: {
              hostname: conn.remoteAddr.hostname,
              port: conn.remoteAddr.port,
            },
            localAddr: {
              hostname: conn.localAddr.hostname,
              port: conn.localAddr.port,
            },
          };
        },
        close: () => {
          try {
            listener.close();
          } catch {
            // Ignore errors from closing an already-closed listener
          }
        },
      };
    }

    // Plain TCP listener
    const listener = Deno.listen({ port, hostname });

    attachAbort(listener);

    return {
      accept: async () => {
        const conn = await listener.accept();
        return {
          read: async () => {
            const buffer = new Uint8Array(8192);
            const n = await conn.read(buffer);
            return n === null ? null : buffer.subarray(0, n);
          },
          write: (data: Uint8Array | string) => {
            const bytes = typeof data === 'string'
              ? new TextEncoder().encode(data)
              : data;
            return conn.write(bytes);
          },
          close: () => {
            try {
              conn.close();
            } catch {
              // Ignore errors from closing an already-closed connection
            }
          },
          remoteAddr: {
            hostname: conn.remoteAddr.hostname,
            port: conn.remoteAddr.port,
          },
          localAddr: {
            hostname: conn.localAddr.hostname,
            port: conn.localAddr.port,
          },
        };
      },
      close: () => {
        try {
          listener.close();
        } catch {
          // Ignore errors from closing an already-closed listener
        }
      },
    };
  }
  /* c8 ignore stop */

  /* c8 ignore start */
  if (isBun || isNode) {
    // For both Bun and Node.js, use Node.js-compatible API
    // Bun's Bun.listen() doesn't easily support the accept() pattern
    // Using Node.js API provides consistency and works well
    const connectionQueue: unknown[] = [];
    const waitingAccepts: Array<{
      resolve: (conn: Connection) => void;
      reject: (err: Error) => void;
    }> = [];
    let closed = false;

    // Unix socket or TCP/TLS
    if ('path' in options) {
      // Unix socket listener
      const server = nodeNet.createServer((socket) => {
        if (waitingAccepts.length > 0) {
          const { resolve } = waitingAccepts.shift()!;
          resolve(wrapNodeSocket(socket));
        } else {
          connectionQueue.push(socket);
        }
      });

      // Wait for the bind to complete (success: 'listening', failure: 'error').
      // Node/Bun's net.Server.listen() is async; bind errors fire on the next tick.
      await new Promise<void>((resolve, reject) => {
        const onError = (err: Error) => {
          server.removeListener('listening', onListening);
          reject(err);
        };
        const onListening = () => {
          server.removeListener('error', onError);
          resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(options.path);
      });

      // After bind, attach a runtime error handler so accept-time errors propagate.
      server.on('error', (err: Error) => {
        for (const { reject } of waitingAccepts) {
          reject(err);
        }
        waitingAccepts.length = 0;
      });

      // Set up signal handler if provided
      if (signal) {
        const onAbort = () => {
          closed = true;
          server.close();
          for (const { reject } of waitingAccepts) {
            reject(new Error('Listener closed by signal'));
          }
          waitingAccepts.length = 0;
        };
        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener('abort', onAbort, { once: true });
        }
      }

      return {
        accept: () => {
          return new Promise<Connection>((resolve, reject) => {
            if (closed) {
              reject(new Error('Listener is closed'));
              return;
            }
            if (connectionQueue.length > 0) {
              const socket = connectionQueue.shift();
              resolve(wrapNodeSocket(socket));
            } else {
              waitingAccepts.push({ resolve, reject });
            }
          });
        },
        close: () => {
          closed = true;
          server.close();
          // Reject any waiting accepts
          for (const { reject } of waitingAccepts) {
            reject(new Error('Listener closed'));
          }
          waitingAccepts.length = 0;
        },
      };
    }

    // TCP or TLS listener
    const { port, hostname = '0.0.0.0', tls } = options;

    if (tls) {
      // TLS listener
      const tlsOptions: {
        cert?: string;
        key?: string;
        ca?: string | string[];
      } = {};

      // Use pre-validated certificates if available
      if (tlsCert && tlsKey) {
        tlsOptions.cert = tlsCert;
        tlsOptions.key = tlsKey;
        tlsOptions.ca = tlsCa;
      }

      const server = nodeTls.createServer(tlsOptions, (socket) => {
        if (waitingAccepts.length > 0) {
          const { resolve } = waitingAccepts.shift()!;
          resolve(wrapNodeSocket(socket));
        } else {
          connectionQueue.push(socket);
        }
      });

      // Wait for the bind to complete (success: 'listening', failure: 'error').
      await new Promise<void>((resolve, reject) => {
        const onError = (err: Error) => {
          server.removeListener('listening', onListening);
          reject(err);
        };
        const onListening = () => {
          server.removeListener('error', onError);
          resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, hostname);
      });

      // After bind, attach a runtime error handler so accept-time errors propagate.
      server.on('error', (err: Error) => {
        for (const { reject } of waitingAccepts) {
          reject(err);
        }
        waitingAccepts.length = 0;
      });

      // Set up signal handler if provided
      if (signal) {
        const onAbort = () => {
          closed = true;
          server.close();
          for (const { reject } of waitingAccepts) {
            reject(new Error('Listener closed by signal'));
          }
          waitingAccepts.length = 0;
        };
        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener('abort', onAbort, { once: true });
        }
      }

      return {
        accept: () => {
          return new Promise<Connection>((resolve, reject) => {
            if (closed) {
              reject(new Error('Listener is closed'));
              return;
            }
            if (connectionQueue.length > 0) {
              const socket = connectionQueue.shift();
              resolve(wrapNodeSocket(socket));
            } else {
              waitingAccepts.push({ resolve, reject });
            }
          });
        },
        close: () => {
          closed = true;
          server.close();
          // Reject any waiting accepts
          for (const { reject } of waitingAccepts) {
            reject(new Error('Listener closed'));
          }
          waitingAccepts.length = 0;
        },
      };
    }

    // Plain TCP listener
    const server = nodeNet.createServer((socket) => {
      if (waitingAccepts.length > 0) {
        const { resolve } = waitingAccepts.shift()!;
        resolve(wrapNodeSocket(socket));
      } else {
        connectionQueue.push(socket);
      }
    });

    // Wait for the bind to complete (success: 'listening', failure: 'error').
    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        server.removeListener('listening', onListening);
        reject(err);
      };
      const onListening = () => {
        server.removeListener('error', onError);
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, hostname);
    });

    // After bind, attach a runtime error handler so accept-time errors propagate.
    server.on('error', (err: Error) => {
      for (const { reject } of waitingAccepts) {
        reject(err);
      }
      waitingAccepts.length = 0;
    });

    // Set up signal handler if provided
    if (signal) {
      const onAbort = () => {
        closed = true;
        server.close();
        for (const { reject } of waitingAccepts) {
          reject(new Error('Listener closed by signal'));
        }
        waitingAccepts.length = 0;
      };
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    }

    return {
      accept: () => {
        return new Promise<Connection>((resolve, reject) => {
          if (closed) {
            reject(new Error('Listener is closed'));
            return;
          }
          if (connectionQueue.length > 0) {
            const socket = connectionQueue.shift();
            resolve(wrapNodeSocket(socket));
          } else {
            waitingAccepts.push({ resolve, reject });
          }
        });
      },
      close: () => {
        closed = true;
        server.close();
        // Reject any waiting accepts
        for (const { reject } of waitingAccepts) {
          reject(new Error('Listener closed'));
        }
        waitingAccepts.length = 0;
      },
    };
  }
  /* c8 ignore stop */

  /* c8 ignore start */
  throw new UnsupportedRuntimeError('listen');
  /* c8 ignore stop */
}

/**
 * Creates a TCP, TLS, or Unix socket connection to the specified destination.
 *
 * This function provides a unified API across Deno, Bun, and Node.js for
 * creating network connections with optional TLS encryption.
 *
 * **Runtime Implementation:**
 * - **Deno**: Uses `Deno.connect()` for TCP/Unix, `Deno.connectTls()` for TLS
 * - **Bun**: Uses `net.createConnection()` for TCP/Unix, `tls.connect()` for TLS
 * - **Node.js**: Uses `net.createConnection()` for TCP/Unix, `tls.connect()` for TLS
 *
 * @param options - Connection configuration options
 * @returns A promise that resolves to a Connection object
 * @throws {Error} If the connection fails
 * @throws {ConnectionTimeoutError} If the connection times out
 * @throws {FetchPathTraversalError} If TLS file paths contain traversal sequences
 * @throws {FetchFileNotFoundError} If TLS certificate/key files don't exist
 * @throws {FetchInvalidPEMError} If TLS certificates are not valid PEM format
 *
 * @example TCP connection:
 * ```typescript
 * const conn = await connect({ hostname: 'example.com', port: 80 });
 * await conn.write('GET / HTTP/1.1\r\nHost: example.com\r\n\r\n');
 * const data = await conn.read();
 * if (data) {
 *   const response = new TextDecoder().decode(data);
 *   console.log(response);
 * }
 * conn.close();
 * ```
 *
 * @example TCP connection with timeout:
 * ```typescript
 * try {
 *   const conn = await connect({
 *     hostname: 'example.com',
 *     port: 80,
 *     timeout: 5000  // 5 second timeout
 *   });
 *   conn.close();
 * } catch (err) {
 *   if (err instanceof ConnectionTimeoutError) {
 *     console.log('Connection timed out');
 *   }
 * }
 * ```
 *
 * @example TCP connection with abort signal:
 * ```typescript
 * const controller = new AbortController();
 *
 * // Abort after 3 seconds
 * setTimeout(() => controller.abort(), 3000);
 *
 * try {
 *   const conn = await connect({
 *     hostname: 'example.com',
 *     port: 80,
 *     signal: controller.signal
 *   });
 *   conn.close();
 * } catch (err) {
 *   if (err instanceof ConnectionTimeoutError) {
 *     console.log('Connection was aborted');
 *   }
 * }
 * ```
 *
 * @example Combining timeout and signal:
 * ```typescript
 * const controller = new AbortController();
 *
 * // Whichever happens first will abort the connection
 * const conn = await connect({
 *   hostname: 'example.com',
 *   port: 80,
 *   timeout: 10000,  // 10 second timeout
 *   signal: controller.signal  // OR manual abort
 * });
 * conn.close();
 * ```
 *
 * @example TLS connection with file-based certificates:
 * ```typescript
 * const conn = await connect({
 *   hostname: 'secure.example.com',
 *   port: 443,
 *   tls: {
 *     certFile: '/path/to/client.crt',
 *     keyFile: '/path/to/client.key',
 *     caFile: '/path/to/ca.crt', // optional
 *   }
 * });
 * await conn.write('Hello secure world!\n');
 * const data = await conn.read();
 * conn.close();
 * ```
 *
 * @example TLS connection with string-based certificates:
 * ```typescript
 * const conn = await connect({
 *   hostname: 'api.example.com',
 *   port: 8443,
 *   tls: {
 *     cert: '-----BEGIN CERTIFICATE-----\\n...\\n-----END CERTIFICATE-----',
 *     key: '-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----',
 *   }
 * });
 * conn.close();
 * ```
 *
 * @example Unix socket connection:
 * ```typescript
 * const conn = await connect({ path: '/tmp/app.sock' });
 * await conn.write('Hello via Unix socket\n');
 * const data = await conn.read();
 * conn.close();
 * ```
 *
 * @example With default hostname:
 * ```typescript
 * // Connects to localhost:8080
 * const conn = await connect({ port: 8080 });
 * conn.close();
 * ```
 */
/**
 * Normalise a `TLSOptions` literal into a {@link ValidatedTLS} record.
 * Handles file vs. string presentation, the optional-cert use cases
 * (server-only TLS, mTLS, no-cert), and threads `rejectUnauthorized`
 * through.
 */
function _validateTlsOptions(tls: TLSOptions): ValidatedTLS {
  const validated = validateTLS(tls);
  validated.rejectUnauthorized = tls.rejectUnauthorized;
  return validated;
}

export async function connect(options: ConnectOptions): Promise<Connection> {
  // Common TLS validation (before runtime-specific code)
  let tlsCert: string | undefined;
  let tlsKey: string | undefined;
  let tlsCa: string[] | undefined;
  let tlsRejectUnauthorized: boolean | undefined;

  // Validate TLS options if provided (not for Unix sockets)
  if ('port' in options && options.tls && typeof options.tls === 'object') {
    const validated = _validateTlsOptions(options.tls);
    tlsCert = validated.cert;
    tlsKey = validated.key;
    tlsCa = validated.ca;
    tlsRejectUnauthorized = validated.rejectUnauthorized;
  }

  // Combine timeout and signal
  const effectiveSignal = combineSignals(
    'timeout' in options ? options.timeout : undefined,
    'signal' in options ? options.signal : undefined,
  );

  /* c8 ignore start */
  if (isDeno) {
    // Unix socket connection
    if ('path' in options) {
      // Deno doesn't support signal for Unix sockets, use Promise.race as fallback
      const connectPromise = Deno.connect({
        path: options.path,
        transport: 'unix',
      });

      let conn: DenoConn;
      if (effectiveSignal) {
        try {
          conn = await Promise.race([
            connectPromise,
            new Promise<never>((_, reject) => {
              if (effectiveSignal.aborted) {
                reject(
                  new ConnectionTimeoutError(
                    undefined,
                    undefined,
                    options.path,
                    'timeout' in options ? options.timeout : undefined,
                  ),
                );
                return;
              }
              effectiveSignal.addEventListener('abort', () => {
                reject(
                  new ConnectionTimeoutError(
                    undefined,
                    undefined,
                    options.path,
                    'timeout' in options ? options.timeout : undefined,
                  ),
                );
              }, { once: true });
            }),
          ]);
        } catch (err) {
          if (err instanceof ConnectionTimeoutError) {
            throw err;
          }
          if (
            err instanceof Error &&
            (err.name === 'AbortError' || err.name === 'TimeoutError')
          ) {
            throw new ConnectionTimeoutError(
              undefined,
              undefined,
              options.path,
              'timeout' in options ? options.timeout : undefined,
            );
          }
          throw err;
        }
      } else {
        conn = await connectPromise;
      }

      return {
        read: async () => {
          const buffer = new Uint8Array(8192);
          const n = await conn.read(buffer);
          return n === null ? null : buffer.subarray(0, n);
        },
        write: (data: Uint8Array | string) => {
          const bytes = typeof data === 'string'
            ? new TextEncoder().encode(data)
            : data;
          return conn.write(bytes);
        },
        close: () => {
          try {
            conn.close();
          } catch {
            // Ignore errors from closing an already-closed connection
          }
        },
        remoteAddr: undefined,
        localAddr: undefined,
        _raw: conn,
      };
    }

    // TCP or TLS connection
    const { port, hostname = '127.0.0.1', tls } = options;

    if (tls) {
      // TLS connection — server-only, mTLS, or no-cert depending on
      // which fields landed in the validated set.
      const tlsOptions:
        & DenoConnectTlsOptions
        & Partial<DenoTlsCertifiedKeyPem> = {
          port,
          hostname,
          ...(effectiveSignal && { signal: effectiveSignal }),
        };

      if (tlsCert && tlsKey) {
        tlsOptions.cert = tlsCert;
        tlsOptions.key = tlsKey;
      }
      if (tlsCa && tlsCa.length > 0) {
        tlsOptions.caCerts = tlsCa;
      }
      // Deno's `Deno.connectTls` has no in-process bypass for cert
      // verification — `caCerts` is *additional* trust on top of the
      // system store, never a replacement or skip. The CLI flag
      // `--unsafely-ignore-certificate-errors[=host]` is the only
      // documented escape hatch; we surface that explicitly so users
      // aren't surprised by a "trusted everything" outcome that isn't
      // happening.
      if (tlsRejectUnauthorized === false) {
        throw new Error(
          `compat.connect: \`rejectUnauthorized: false\` is not supported on Deno. ` +
            `Either run Deno with \`--unsafely-ignore-certificate-errors=${hostname}\`, ` +
            `or pass the server's CA certificate via \`tls.ca\`/\`tls.caFile\`.`,
        );
      }

      try {
        const conn = await Deno.connectTls(tlsOptions);

        return {
          read: async () => {
            const buffer = new Uint8Array(8192);
            const n = await conn.read(buffer);
            return n === null ? null : buffer.subarray(0, n);
          },
          write: (data: Uint8Array | string) => {
            const bytes = typeof data === 'string'
              ? new TextEncoder().encode(data)
              : data;
            return conn.write(bytes);
          },
          close: () => {
            try {
              conn.close();
            } catch {
              // Ignore errors from closing an already-closed connection
            }
          },
          remoteAddr: {
            hostname: conn.remoteAddr.hostname,
            port: conn.remoteAddr.port,
          },
          localAddr: {
            hostname: conn.localAddr.hostname,
            port: conn.localAddr.port,
          },
          _raw: conn,
        };
      } catch (err) {
        if (
          err instanceof Error &&
          (err.name === 'AbortError' || err.name === 'TimeoutError')
        ) {
          throw new ConnectionTimeoutError(
            hostname,
            port,
            undefined,
            'timeout' in options ? options.timeout : undefined,
          );
        }
        throw err;
      }
    }

    // Plain TCP connection
    try {
      const conn = await Deno.connect({
        port,
        hostname,
        ...(effectiveSignal && { signal: effectiveSignal }),
      });

      return {
        read: async () => {
          const buffer = new Uint8Array(8192);
          const n = await conn.read(buffer);
          return n === null ? null : buffer.subarray(0, n);
        },
        write: (data: Uint8Array | string) => {
          const bytes = typeof data === 'string'
            ? new TextEncoder().encode(data)
            : data;
          return conn.write(bytes);
        },
        close: () => {
          try {
            conn.close();
          } catch {
            // Ignore errors from closing an already-closed connection
          }
        },
        remoteAddr: {
          hostname: conn.remoteAddr.hostname,
          port: conn.remoteAddr.port,
        },
        localAddr: {
          hostname: conn.localAddr.hostname,
          port: conn.localAddr.port,
        },
        _raw: conn,
      };
    } catch (err) {
      if (
        err instanceof Error &&
        (err.name === 'AbortError' || err.name === 'TimeoutError')
      ) {
        throw new ConnectionTimeoutError(
          hostname,
          port,
          undefined,
          'timeout' in options ? options.timeout : undefined,
        );
      }
      throw err;
    }
  }
  /* c8 ignore stop */

  /* c8 ignore start */
  if (isBun || isNode) {
    // Both Bun and Node.js use Node.js-compatible socket API
    return new Promise((resolve, reject) => {
      // Check if already aborted
      if (effectiveSignal?.aborted) {
        const err = 'path' in options
          ? new ConnectionTimeoutError(
            undefined,
            undefined,
            options.path,
            options.timeout,
          )
          : new ConnectionTimeoutError(
            options.hostname,
            options.port,
            undefined,
            options.timeout,
          );
        reject(err);
        return;
      }

      // Setup abort handler. Keep a handle to the in-flight socket so the
      // abort/timeout path can tear it down explicitly. We also thread the
      // `signal` into createConnection / tls.connect, but tls.connect's
      // honouring of `signal` isn't guaranteed across Node/Bun versions — if
      // the runtime ignores it, an aborted TLS connect would reject the
      // promise while the underlying socket kept dialing with no listener to
      // close it. Destroying it here closes that leak. `destroy()` is
      // idempotent, so calling it on an already-settled socket is harmless.
      let pendingSocket: { destroy: () => void } | undefined;
      const onAbort = () => {
        pendingSocket?.destroy();
        const err = 'path' in options
          ? new ConnectionTimeoutError(
            undefined,
            undefined,
            options.path,
            options.timeout,
          )
          : new ConnectionTimeoutError(
            options.hostname,
            options.port,
            undefined,
            options.timeout,
          );
        reject(err);
      };

      effectiveSignal?.addEventListener('abort', onAbort, { once: true });

      // Unix socket connection
      if ('path' in options) {
        const socket = nodeNet.createConnection({
          path: options.path,
          ...(effectiveSignal && { signal: effectiveSignal }),
        });
        pendingSocket = socket;

        socket.on('connect', () => {
          effectiveSignal?.removeEventListener('abort', onAbort);
          resolve(wrapNodeSocket(socket));
        });

        socket.on('error', (err) => {
          effectiveSignal?.removeEventListener('abort', onAbort);
          reject(err);
        });
        return;
      }

      // TCP or TLS connection
      const { port, hostname = '127.0.0.1', tls } = options;

      if (tls) {
        // TLS connection — server-only, mTLS, or no-cert depending on
        // which fields landed in the validated set.
        const tlsOptions: Record<string, unknown> = {
          host: hostname,
          port,
          ...(effectiveSignal && { signal: effectiveSignal }),
        };

        if (tlsCert && tlsKey) {
          tlsOptions.cert = tlsCert;
          tlsOptions.key = tlsKey;
        }
        if (tlsCa && tlsCa.length > 0) {
          tlsOptions.ca = tlsCa;
        }
        if (tlsRejectUnauthorized !== undefined) {
          tlsOptions.rejectUnauthorized = tlsRejectUnauthorized;
        }

        const socket = nodeTls.connect(
          tlsOptions as unknown as Parameters<typeof nodeTls.connect>[0],
        );
        pendingSocket = socket;

        socket.on('secureConnect', () => {
          effectiveSignal?.removeEventListener('abort', onAbort);
          resolve(wrapNodeSocket(socket));
        });

        socket.on('error', (err: Error) => {
          effectiveSignal?.removeEventListener('abort', onAbort);
          reject(err);
        });
        return;
      }

      // Plain TCP connection
      const socket = nodeNet.createConnection({
        port,
        host: hostname,
        ...(effectiveSignal && { signal: effectiveSignal }),
      });
      pendingSocket = socket;

      socket.on('connect', () => {
        effectiveSignal?.removeEventListener('abort', onAbort);
        resolve(wrapNodeSocket(socket));
      });

      socket.on('error', (err) => {
        effectiveSignal?.removeEventListener('abort', onAbort);
        reject(err);
      });
    });
  }
  /* c8 ignore stop */

  /* c8 ignore start */
  throw new UnsupportedRuntimeError('connect');
  /* c8 ignore stop */
}

/**
 * Options for {@link upgradeTls}. The `hostname` is required so the
 * TLS layer can verify the server's certificate against the expected
 * SAN; `tls` carries the optional certs / verification policy.
 */
export type UpgradeTlsOptions = {
  /** Hostname for SAN / SNI verification. */
  hostname: string;
  /**
   * TLS configuration. Same shape as {@link ConnectOptions}'s `tls`
   * — pass `true` for "use system trust roots, no client cert", or
   * a {@link TLSOptions} object for finer control.
   */
  tls?: boolean | TLSOptions;
};

/**
 * Upgrade a plain TCP {@link Connection} to TLS in place — used by
 * protocols that negotiate TLS *after* a plaintext exchange:
 *
 * - **Postgres**: client sends `SSLRequest`, server replies `'S'`,
 *   then the same socket is upgraded.
 * - **SMTP**: client sends `STARTTLS`, server replies `220`,
 *   then upgrade.
 *
 * The original {@link Connection} should be considered consumed after
 * a successful upgrade — its `read` / `write` are no longer safe to
 * call. The returned `Connection` carries the TLS session.
 *
 * @param conn - The plain TCP connection to upgrade.
 * @param options - Hostname (required for SAN/SNI verification) and
 *   TLS configuration.
 *
 * @returns A new TLS-wrapped {@link Connection}.
 *
 * @throws {Error} If the connection has no underlying raw socket
 *   (e.g. it was constructed by user code, not via {@link connect}),
 *   or if the runtime can't perform an in-place TLS upgrade.
 */
export async function upgradeTls(
  conn: Connection,
  options: UpgradeTlsOptions,
): Promise<Connection> {
  const raw = conn._raw;
  if (!raw) {
    throw new Error(
      'upgradeTls: connection has no underlying raw socket — was it produced by `connect`?',
    );
  }

  // Normalise TLS shape (boolean → empty object, object → as-is).
  const tlsOpt = options.tls === true ? {} : options.tls;
  const validated = tlsOpt && typeof tlsOpt === 'object'
    ? _validateTlsOptions(tlsOpt)
    : { rejectUnauthorized: undefined };

  /* c8 ignore start */
  if (isDeno) {
    const startTlsOpts:
      & DenoStartTlsOptions
      & Partial<DenoTlsCertifiedKeyPem> = {
        hostname: options.hostname,
      };
    if (validated.cert && validated.key) {
      startTlsOpts.cert = validated.cert;
      startTlsOpts.key = validated.key;
    }
    if (validated.ca && validated.ca.length > 0) {
      startTlsOpts.caCerts = validated.ca;
    }
    // Same Deno limitation as `connect` — no in-process verification
    // bypass. Surface the escape hatch instead of silently doing
    // nothing useful.
    if (validated.rejectUnauthorized === false) {
      throw new Error(
        `compat.upgradeTls: \`rejectUnauthorized: false\` is not supported on Deno. ` +
          `Either run Deno with \`--unsafely-ignore-certificate-errors=${options.hostname}\`, ` +
          `or pass the server's CA certificate via \`tls.ca\`/\`tls.caFile\`.`,
      );
    }
    const tlsConn = await Deno.startTls(raw as DenoTcpConn, startTlsOpts);
    return {
      read: async () => {
        const buffer = new Uint8Array(8192);
        const n = await tlsConn.read(buffer);
        return n === null ? null : buffer.subarray(0, n);
      },
      write: (data: Uint8Array | string) => {
        const bytes = typeof data === 'string'
          ? new TextEncoder().encode(data)
          : data;
        return tlsConn.write(bytes);
      },
      close: () => {
        try {
          tlsConn.close();
        } catch {
          // already closed
        }
      },
      remoteAddr: {
        hostname: tlsConn.remoteAddr.hostname,
        port: tlsConn.remoteAddr.port,
      },
      localAddr: {
        hostname: tlsConn.localAddr.hostname,
        port: tlsConn.localAddr.port,
      },
      _raw: tlsConn,
    };
  }
  /* c8 ignore stop */

  /* c8 ignore start */
  if (isBun || isNode) {
    return await new Promise((resolve, reject) => {
      const tlsOptions: Record<string, unknown> = {
        socket: raw,
        servername: options.hostname,
      };
      if (validated.cert && validated.key) {
        tlsOptions.cert = validated.cert;
        tlsOptions.key = validated.key;
      }
      if (validated.ca && validated.ca.length > 0) {
        tlsOptions.ca = validated.ca;
      }
      if (validated.rejectUnauthorized !== undefined) {
        tlsOptions.rejectUnauthorized = validated.rejectUnauthorized;
      }

      const tlsSocket = nodeTls.connect(
        tlsOptions as unknown as Parameters<typeof nodeTls.connect>[0],
      );
      tlsSocket.on('secureConnect', () => {
        resolve(wrapNodeSocket(tlsSocket));
      });
      tlsSocket.on('error', reject);
    });
  }
  /* c8 ignore stop */

  /* c8 ignore start */
  throw new UnsupportedRuntimeError('upgradeTls');
  /* c8 ignore stop */
}

/**
 * Gets the hostname of the current machine.
 *
 * Returns the hostname for the runtime:
 * - In Deno: `Deno.hostname()`
 * - In Bun: `os.hostname()`
 * - In Node.js: `os.hostname()`
 * - In unknown runtime: Returns `'localhost'` as fallback
 *
 * @returns {string} The hostname of the machine
 *
 * @example
 * ```ts
 * const host = hostname();
 * console.log(`Machine hostname: ${host}`);
 * ```
 */
export const hostname = (): string => {
  /* c8 ignore start */
  if (isDeno) {
    return g.Deno.hostname();
  }
  /* c8 ignore stop */
  /* c8 ignore start */
  if (isBun || isNode) {
    return nodeOs?.hostname() || 'localhost';
  }
  /* c8 ignore stop */
  /* c8 ignore start */
  return 'localhost';
  /* c8 ignore stop */
};
