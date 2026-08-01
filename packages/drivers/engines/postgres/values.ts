/**
 * @fileoverview Pure Postgres text-value decoding — no wire imports.
 *
 * The Postgres result path is text-only (the engine's Bind message declares
 * zero result format codes, so the server sends every column as text), which
 * means value coercion is a pure function of `(text, typeOid)` with no
 * dependency on the TCP wire stack. Isolating it here lets a text-shaped
 * transport that never opens a socket — e.g. the Neon SQL-over-HTTP engine —
 * reuse exactly the same OID → JS-value mapping without dragging in
 * `protocol.ts` / `PgConnection.ts` / `binary.ts` and the node-only socket
 * code they transitively pull in.
 *
 * Two entry points:
 * - {@link decodeTextValue} — the OID switch over a decoded string (or `null`
 *   for a SQL NULL). This is what a string-native transport (Neon HTTP) calls,
 *   since it already receives values as JSON strings.
 * - {@link decodeValue} — the bytes entry point used by `PgConnection`, kept
 *   behaviourally identical: it UTF-8-decodes the raw column bytes and defers
 *   to {@link decodeTextValue}.
 *
 * @module
 */

/** UTF-8 decoder for raw column bytes. Local to keep this module wire-free. */
const _dec = new TextDecoder();

/** Decode bytes as UTF-8, preserving a `null` (SQL NULL) as `null`. */
export function decodeText(bytes: Uint8Array | null): string | null {
  return bytes === null ? null : _dec.decode(bytes);
}

/**
 * Convert a raw text-format Postgres value to a JS value based on its OID.
 *
 * Results are always text, so text is the only format this has to decode:
 * the Bind message this engine builds declares *zero* result format codes,
 * which the server reads as "text for every column" (see `buildBind` in
 * `protocol.ts`). Binary result decoding is a future addition.
 *
 * Parameters are a separate axis and are *not* text-only — each one carries
 * its own format code and the driver sends most of them in binary (see
 * `binary.ts`).
 */
export function decodeValue(
  bytes: Uint8Array | null,
  typeOid: number,
): unknown {
  return bytes === null ? null : decodeTextValue(decodeText(bytes), typeOid);
}

/**
 * Convert an already-decoded Postgres text value to a JS value based on its
 * OID. `null` (a SQL NULL) passes straight through as `null`.
 *
 * This is the string entry point for transports that receive column values as
 * strings rather than raw bytes (Neon's SQL-over-HTTP API with
 * `Neon-Raw-Text-Output`). {@link decodeValue} is the byte-oriented wrapper
 * `PgConnection` uses; both funnel through this switch so the OID → JS mapping
 * lives in exactly one place.
 *
 * @param text - Raw Postgres text encoding of the value, or `null` for NULL.
 * @param typeOid - Postgres type OID (`pg_type.oid`) of the column.
 */
export function decodeTextValue(
  text: string | null,
  typeOid: number,
): unknown {
  if (text === null) return null;

  switch (typeOid) {
    case 16:
      return text === 't';
    case 20:
      try {
        return BigInt(text);
      } catch {
        return text;
      }
    case 21:
    case 23:
      return Number.parseInt(text, 10);
    case 700:
    case 701:
      return Number.parseFloat(text);
    case 17:
      return _decodeBytea(text);
    case 114:
    case 3802:
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    case 1082:
    case 1114:
    case 1184:
      return _parseDate(text);
    default:
      return text;
  }
}

function _decodeBytea(text: string): Uint8Array {
  if (text.startsWith('\\x')) {
    const hex = text.slice(2);
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = Number.parseInt(hex.substr(i * 2, 2), 16);
    }
    return out;
  }
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    if (ch === 0x5c && text[i + 1] === '\\') {
      out.push(0x5c);
      i++;
    } else if (ch === 0x5c) {
      const oct = text.substr(i + 1, 3);
      out.push(Number.parseInt(oct, 8));
      i += 3;
    } else {
      out.push(ch);
    }
  }
  return new Uint8Array(out);
}

/**
 * Component regex for a Postgres date / timestamp / timestamptz rendering.
 *
 * Groups: 1 year (4+ digits — no `\d{4}` cap, so year > 9999 survives), 2 month,
 * 3 day, 4/5/6 optional hour/minute/second, 7 optional fractional seconds,
 * 8 optional timezone offset (`Z` | `±HH` | `±HH:MM` | `±HH:MM:SS`), 9 optional
 * era (` BC` / ` AD`, which Postgres appends *after* the offset).
 */
const _TS_RE =
  /^(\d{4,})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?(?:\.(\d+))?(Z|[+-]\d{2}(?::\d{2}(?::\d{2})?)?)?(?:\s+(BC|AD))?$/;

/** Offset string (`Z`/`±HH`/`±HH:MM`/`±HH:MM:SS`) → milliseconds east of UTC. */
function _offsetMs(tz: string): number {
  if (tz === 'Z') return 0;
  const sign = tz[0] === '-' ? -1 : 1;
  const [h, m = '0', s = '0'] = tz.slice(1).split(':');
  return sign * ((Number(h) * 3600 + Number(m) * 60 + Number(s)) * 1000);
}

function _parseDate(text: string): Date {
  // Postgres timestamptz sentinels — map to the max/min representable Date
  // instant (`new Date(±8.64e15)`), which stays a *valid* Date, not `NaN`.
  if (text === 'infinity') return new Date(8.64e15);
  if (text === '-infinity') return new Date(-8.64e15);

  const m = _TS_RE.exec(text);
  if (m === null) {
    // Unrecognized shape — fall back to the original best-effort path so no
    // previously-working format regresses: normalize a bare trailing `±HH` and
    // treat a naive (zoneless) value as UTC.
    const isoish = text.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
    const hasTz = /(?:Z|[+-]\d{2}:\d{2})$/.test(isoish);
    return new Date(hasTz ? isoish : `${isoish}Z`);
  }

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hh = m[4] ? Number(m[4]) : 0;
  const min = m[5] ? Number(m[5]) : 0;
  const ss = m[6] ? Number(m[6]) : 0;
  // Fraction is truncated to millisecond precision (Postgres carries micros;
  // `Date` holds only ms — the same truncation `new Date()` applied before).
  const ms = m[7] ? Number(m[7].slice(0, 3).padEnd(3, '0')) : 0;
  const tz = m[8];
  // ` BC` → astronomical year: 1 BC is year 0, 2 BC is year -1, … `n BC` = -(n-1).
  const fullYear = m[9] === 'BC' ? -(year - 1) : year;

  // Build via `setUTC*` rather than `Date.UTC(...)`: `Date.UTC` remaps a 0–99
  // year to 1900–1999 (so `0044` → 1944), whereas `setUTCFullYear` takes the
  // literal year — correct for years < 100, BC (negative), and > 9999 alike.
  // A zoneless value is read as UTC (prior behaviour); an offset is subtracted
  // to reach the UTC instant, covering whole-minute *and* whole-second offsets.
  const d = new Date(0);
  d.setUTCFullYear(fullYear, month - 1, day);
  d.setUTCHours(hh, min, ss, ms);
  return tz ? new Date(d.getTime() - _offsetMs(tz)) : d;
}
