import type { ClientTLSOptions } from '@tundralibs/compat/net';

/**
 * Options for `ImapClient`.
 */
export type ImapClientOptions = {
  hostname: string;
  /**
   * @default 993 for `security: 'tls'`, 143 otherwise
   */
  port?: number;
  /**
   * `tls` opens an implicit-TLS connection (IMAPS). `starttls` connects in
   * the clear and upgrades with the STARTTLS command before any
   * credential is sent, failing if the server does not offer it. `none`
   * sends everything in the clear and is meant for tests.
   *
   * @default 'tls'
   */
  security?: 'tls' | 'starttls' | 'none';
  /**
   * TLS material and verification policy (a private CA, a client
   * certificate, a `servername` to verify instead of `hostname`). Used by
   * both `tls` and `starttls`.
   */
  tls?: ClientTLSOptions;
  auth: {
    user: string;
    pass: string;
    /**
     * `LOGIN` sends the LOGIN command; `PLAIN` sends AUTHENTICATE PLAIN.
     * When omitted, LOGIN is used unless the server advertises
     * LOGINDISABLED, in which case PLAIN is used.
     */
    method?: 'LOGIN' | 'PLAIN';
  };
  /**
   * Deadline for each command, in milliseconds, from write to tagged
   * reply. On expiry the connection is closed and an `ImapTimeoutError`
   * is thrown.
   *
   * @default 30000
   */
  timeout?: number;
  /**
   * Deadline for the TCP/TLS connect, the greeting, STARTTLS and
   * authentication together.
   *
   * @default the value of `timeout`
   */
  connectTimeout?: number;
  /**
   * Aborting it closes the connection and rejects the operation in flight
   * with an `ImapConnectionError`.
   */
  signal?: AbortSignal;
  /**
   * Largest literal (message body, header, or any other string the server
   * sends as `{n}`) the client buffers, in bytes. A larger one is drained
   * and `fetch()` throws `ImapMessageTooLargeError`. Override per call
   * with `ImapFetchOptions.maxSize`.
   *
   * @default 16777216 (16 MiB)
   */
  maxSize?: number;
};
