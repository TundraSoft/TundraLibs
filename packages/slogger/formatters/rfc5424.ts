/**
 * @fileoverview RFC 5424 syslog wire-format formatter.
 *
 * Produces a single-line frame in the form:
 *
 *   `<PRI>1 TIMESTAMP HOSTNAME APP-NAME PROCID MSGID STRUCTURED-DATA MSG`
 *
 * where `PRI = facility * 8 + severity` and absent fields are emitted
 * as the NILVALUE `-`. Used in-tree by {@link SyslogHandler}; also
 * exposed standalone so any handler (file, HTTP, …) can emit RFC
 * 5424 framed lines.
 *
 * Bypasses `utils.syslog.stringify` because that utility omits the
 * STRUCTURED-DATA NILVALUE when absent — strict parsers (rsyslog with
 * `mmnormalize`, syslog-ng with `flags(syslog-protocol)`) reject the
 * resulting messages. This formatter follows the grammar verbatim.
 *
 * @module
 */
import { PID } from '@tundralibs/compat';
import { type SyslogFacilities } from '@tundralibs/utils';
import type { SloggerFormatter, SlogObject } from '../types/mod.ts';

/** Options for {@link rfc5424Formatter}. */
export type Rfc5424Options = {
  /**
   * RFC 5424 facility code (0–23). Encoded into PRI alongside the
   * log's severity.
   *
   * @default SyslogFacilities.USER (1)
   */
  facility?: SyslogFacilities | number;
  /**
   * APP-NAME field. Overrides the SlogObject's `appName`. RFC 5424
   * caps APP-NAME at 48 printable-ASCII octets; values that exceed
   * that limit are truncated.
   *
   * @default log.appName
   */
  appName?: string;
  /**
   * HOSTNAME field. Overrides the SlogObject's `hostname`. RFC 5424
   * caps HOSTNAME at 255 printable-ASCII octets; truncated if longer.
   *
   * @default log.hostname
   */
  hostname?: string;
  /**
   * PROCID field. RFC 5424 caps PROCID at 128 octets.
   *
   * @default current process PID (or `'-'` if unavailable)
   */
  procId?: string | number;
  /**
   * MSGID field. Names the kind of message (e.g. `'AUDIT'`,
   * `'TCPIN'`). RFC 5424 caps at 32 octets. When absent, the formatter
   * emits the NILVALUE `-`.
   */
  messageId?: string;
  /**
   * Override how `log.context` is serialised into the MSG body. By
   * default, MSG is just `log.message` and context is dropped — pass
   * a function to render context into the message tail (e.g. JSON
   * append, key=value pairs).
   *
   * RFC 5424 also defines a STRUCTURED-DATA slot for machine-readable
   * fields. Emitting structured data is intentionally out of scope
   * here (it requires a registered SD-ID enterprise number) — extend
   * this formatter if you need it.
   */
  appendContext?: (context: Record<string, unknown>) => string;
};

// RFC 5424 §6 field length caps (printable-ASCII octets).
const MAX_APPNAME = 48;
const MAX_HOSTNAME = 255;
const MAX_PROCID = 128;
const MAX_MSGID = 32;
const NIL = '-';
const FACILITY_SHIFT = 8;

/**
 * Truncate to the RFC-5424 length cap and replace any non-printable
 * octets / spaces with `_` so the wire format stays parseable. An
 * empty input becomes the NILVALUE `-`.
 */
const _field = (value: string | undefined, max: number): string => {
  if (!value) return NIL;
  // Replace SP and any byte outside printable-ASCII with '_'. RFC 5424
  // requires PRINTUSASCII for header fields.
  // deno-lint-ignore no-control-regex
  const safe = value.replaceAll(/[\x00-\x20\x7f]/g, '_');
  return safe.length > max ? safe.slice(0, max) : safe;
};

/**
 * Neutralise framing-breaking control bytes in the MSG part. Unlike
 * the header fields, MSG is free-form UTF-8 (spaces and non-ASCII are
 * legal), so only C0 control bytes and DEL are stripped — with TAB
 * (`\x09`) preserved.
 *
 * This closes a log-forging hole: under `'lf'` framing (the UNIX-socket
 * default for {@link SyslogHandler}) a raw `'\n'` terminates the record,
 * so an attacker-controlled substring like `"\n<134>1 ..."` in a log
 * message would inject a fully forged syslog record. Octet-count
 * framing is length-prefixed and wouldn't be fooled, but the formatter
 * is transport-agnostic, so it sanitises unconditionally to keep every
 * framing mode safe. Control bytes are replaced with a space so the
 * would-be second record collapses into the current MSG as inert text.
 */
const _msg = (value: string): string =>
  // deno-lint-ignore no-control-regex
  value.replaceAll(/[\x00-\x08\x0a-\x1f\x7f]/g, ' ');

/**
 * Compile an {@link Rfc5424Options} into a {@link SloggerFormatter}.
 *
 * @example
 * ```typescript
 * import { rfc5424Formatter } from '@tundralibs/slogger';
 * import { SyslogFacilities } from '@tundralibs/utils';
 *
 * const fmt = rfc5424Formatter({
 *   facility: SyslogFacilities.LOCAL0,
 *   messageId: 'API',
 * });
 * fmt(slogObject);
 * // '<131>1 2026-05-11T07:16:09.121Z web01 my-app 1234 API - user logged in'
 * ```
 */
export const rfc5424Formatter = (
  options: Rfc5424Options = {},
): SloggerFormatter => {
  const facility = options.facility ?? 1; // USER
  const fixedAppName = options.appName === undefined
    ? undefined
    : _field(options.appName, MAX_APPNAME);
  const fixedHostname = options.hostname === undefined
    ? undefined
    : _field(options.hostname, MAX_HOSTNAME);
  // PROCID precedence: caller override → current PID → NILVALUE.
  const defaultProcId = PID === undefined ? undefined : String(PID);
  const fixedProcId = options.procId === undefined
    ? _field(defaultProcId, MAX_PROCID)
    : _field(String(options.procId), MAX_PROCID);
  const msgId = options.messageId === undefined
    ? NIL
    : _field(options.messageId, MAX_MSGID);
  const appendContext = options.appendContext;

  return (log: SlogObject): string => {
    const pri = facility * FACILITY_SHIFT + log.level;
    const host = fixedHostname ?? _field(log.hostname, MAX_HOSTNAME);
    const app = fixedAppName ?? _field(log.appName, MAX_APPNAME);
    let msg = log.message;
    if (appendContext && log.context && Object.keys(log.context).length > 0) {
      msg += ' ' + appendContext(log.context);
    }
    // Sanitise the assembled MSG (message + any appended context) so an
    // embedded newline can't terminate the frame and inject a forged
    // record. See {@link _msg}.
    msg = _msg(msg);
    // RFC 5424 §6: HEADER SP STRUCTURED-DATA [SP MSG]
    // STRUCTURED-DATA = NILVALUE / 1*SD-ELEMENT — we emit NILVALUE.
    // BOM is omitted (MSG is plain ASCII unless caller's message contains UTF-8).
    return `<${pri}>1 ${log.isoDate} ${host} ${app} ${fixedProcId} ${msgId} ${NIL} ${msg}`;
  };
};
