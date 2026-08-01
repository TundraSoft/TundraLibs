/**
 * @fileoverview PostgreSQL frontend/backend protocol primitives.
 *
 * Implements the v3.0 wire protocol message framing used by all currently
 * supported Postgres versions (≥ 7.4).
 *
 * Each backend message is a single byte type tag + 4-byte big-endian length
 * (length includes the 4 length bytes but excludes the type byte) + payload.
 * The startup and SSL request messages are special: they have no type byte.
 *
 * @module
 */

import { DriverError } from '../../errors/mod.ts';

const enc = new TextEncoder();
const dec = new TextDecoder();

//#region Frontend message writers

/** Build a frontend message: 1-byte type + 4-byte length + payload. */
export function buildMessage(type: string, payload: Uint8Array): Uint8Array {
  if (type.length !== 1) {
    throw new DriverError(
      `Frontend type must be a single ASCII byte, got "${type}"`,
      { type },
    );
  }
  const out = new Uint8Array(1 + 4 + payload.length);
  out[0] = type.charCodeAt(0);
  _writeUInt32BE(out, 1, payload.length + 4);
  out.set(payload, 5);
  return out;
}

/** Build the StartupMessage (no type byte; 4-byte length + 4-byte version + key/value pairs + null). */
export function buildStartupMessage(
  params: Record<string, string>,
): Uint8Array {
  const parts: Uint8Array[] = [];
  // protocol version 3.0
  const versionBuf = new Uint8Array(4);
  _writeUInt32BE(versionBuf, 0, 196608); // 3 << 16 | 0
  parts.push(versionBuf);
  for (const [k, v] of Object.entries(params)) {
    parts.push(enc.encode(k));
    parts.push(_NUL);
    parts.push(enc.encode(v));
    parts.push(_NUL);
  }
  parts.push(_NUL); // terminator
  let payloadLen = 0;
  for (const p of parts) payloadLen += p.length;
  const totalLen = 4 + payloadLen;
  const out = new Uint8Array(totalLen);
  _writeUInt32BE(out, 0, totalLen);
  let off = 4;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** Build an SSLRequest (special: 8 bytes total). Server replies with 'S' or 'N'. */
export function buildSSLRequest(): Uint8Array {
  const out = new Uint8Array(8);
  _writeUInt32BE(out, 0, 8);
  _writeUInt32BE(out, 4, 80877103);
  return out;
}

/** Build a simple Query message ('Q' + sql + null terminator). */
export function buildQuery(sql: string): Uint8Array {
  const sqlBytes = enc.encode(sql);
  const payload = new Uint8Array(sqlBytes.length + 1);
  payload.set(sqlBytes, 0);
  payload[sqlBytes.length] = 0;
  return buildMessage('Q', payload);
}

/** Build a Parse message: name + sql + paramCount (typeOIDs zeroed = unspecified). */
export function buildParse(
  statementName: string,
  sql: string,
  paramTypes: ReadonlyArray<number> = [],
): Uint8Array {
  const nameBytes = enc.encode(statementName);
  const sqlBytes = enc.encode(sql);
  const payload = new Uint8Array(
    nameBytes.length + 1 + sqlBytes.length + 1 + 2 + paramTypes.length * 4,
  );
  let off = 0;
  payload.set(nameBytes, off);
  off += nameBytes.length;
  payload[off++] = 0;
  payload.set(sqlBytes, off);
  off += sqlBytes.length;
  payload[off++] = 0;
  _writeUInt16BE(payload, off, paramTypes.length);
  off += 2;
  for (const t of paramTypes) {
    _writeUInt32BE(payload, off, t);
    off += 4;
  }
  return buildMessage('P', payload);
}

/** One encoded parameter as it goes onto the wire. */
export type BoundParam = {
  /** Wire format: 0 = text, 1 = binary. */
  format: 0 | 1;
  /** Body bytes, or `null` to send SQL NULL (length=-1). */
  bytes: Uint8Array | null;
};

/**
 * Build a Bind message with per-parameter format codes.
 *
 * Each param carries its own `format` (0 = text, 1 = binary) so we can
 * mix text strings and binary numerics in the same statement. Result
 * columns are still requested as text — binary result decode is a v1.x
 * addition.
 */
export function buildBind(
  portalName: string,
  statementName: string,
  params: ReadonlyArray<BoundParam>,
): Uint8Array {
  const portalBytes = enc.encode(portalName);
  const stmtBytes = enc.encode(statementName);

  let payloadSize = portalBytes.length + 1 + stmtBytes.length + 1;
  payloadSize += 2; // numParameterFormatCodes
  payloadSize += params.length * 2; // one i16 per param
  payloadSize += 2; // numParameters
  for (const p of params) {
    payloadSize += 4; // length (i32; -1 for null)
    if (p.bytes !== null) payloadSize += p.bytes.length;
  }
  payloadSize += 2; // numResultFormatCodes (0 = all text)

  const payload = new Uint8Array(payloadSize);
  let off = 0;
  payload.set(portalBytes, off);
  off += portalBytes.length;
  payload[off++] = 0;
  payload.set(stmtBytes, off);
  off += stmtBytes.length;
  payload[off++] = 0;
  // One format code per param.
  _writeUInt16BE(payload, off, params.length);
  off += 2;
  for (const p of params) {
    _writeUInt16BE(payload, off, p.format);
    off += 2;
  }
  _writeUInt16BE(payload, off, params.length);
  off += 2;
  for (const p of params) {
    if (p.bytes === null) {
      _writeInt32BE(payload, off, -1);
      off += 4;
    } else {
      _writeUInt32BE(payload, off, p.bytes.length);
      off += 4;
      payload.set(p.bytes, off);
      off += p.bytes.length;
    }
  }
  // 0 result format codes => all results are text.
  _writeUInt16BE(payload, off, 0);
  off += 2;
  return buildMessage('B', payload);
}

/** Build a Describe message ('S' = statement, 'P' = portal). */
export function buildDescribe(
  kind: 'S' | 'P',
  name: string,
): Uint8Array {
  const nameBytes = enc.encode(name);
  const payload = new Uint8Array(1 + nameBytes.length + 1);
  payload[0] = kind.charCodeAt(0);
  payload.set(nameBytes, 1);
  payload[1 + nameBytes.length] = 0;
  return buildMessage('D', payload);
}

/** Build an Execute message: portal + maxRows. `maxRows=0` means "no limit". */
export function buildExecute(
  portalName: string,
  maxRows: number = 0,
): Uint8Array {
  const nameBytes = enc.encode(portalName);
  const payload = new Uint8Array(nameBytes.length + 1 + 4);
  payload.set(nameBytes, 0);
  payload[nameBytes.length] = 0;
  _writeUInt32BE(payload, nameBytes.length + 1, maxRows);
  return buildMessage('E', payload);
}

/** Build a Close message ('S' = statement, 'P' = portal). */
export function buildClose(kind: 'S' | 'P', name: string): Uint8Array {
  const nameBytes = enc.encode(name);
  const payload = new Uint8Array(1 + nameBytes.length + 1);
  payload[0] = kind.charCodeAt(0);
  payload.set(nameBytes, 1);
  payload[1 + nameBytes.length] = 0;
  return buildMessage('C', payload);
}

/** Build a Sync message (no payload). */
export function buildSync(): Uint8Array {
  return buildMessage('S', new Uint8Array(0));
}

/** Build a Terminate message (graceful shutdown). */
export function buildTerminate(): Uint8Array {
  return buildMessage('X', new Uint8Array(0));
}

/** Build a PasswordMessage (used for cleartext, MD5 hashed, and SASL data). */
export function buildPasswordMessage(payload: Uint8Array | string): Uint8Array {
  const bytes = typeof payload === 'string' ? enc.encode(payload) : payload;
  const out = new Uint8Array(bytes.length + 1);
  out.set(bytes, 0);
  out[bytes.length] = 0;
  return buildMessage('p', out);
}

/** Build a SASLInitialResponse: mechanism + initial-response. */
export function buildSASLInitialResponse(
  mechanism: string,
  initialResponse: Uint8Array,
): Uint8Array {
  const mech = enc.encode(mechanism);
  const payload = new Uint8Array(mech.length + 1 + 4 + initialResponse.length);
  let off = 0;
  payload.set(mech, off);
  off += mech.length;
  payload[off++] = 0;
  _writeUInt32BE(payload, off, initialResponse.length);
  off += 4;
  payload.set(initialResponse, off);
  return buildMessage('p', payload);
}

/** Build a SASLResponse: just the client message. */
export function buildSASLResponse(clientMessage: Uint8Array): Uint8Array {
  return buildMessage('p', clientMessage);
}

//#endregion Frontend message writers

//#region Backend message types

/** Authentication request sub-types. */
export type AuthRequest =
  | { kind: 'ok' }
  | { kind: 'cleartext' }
  | { kind: 'md5'; salt: Uint8Array } // 4-byte salt
  | { kind: 'sasl'; mechanisms: string[] }
  | { kind: 'sasl-continue'; data: Uint8Array }
  | { kind: 'sasl-final'; data: Uint8Array }
  | { kind: 'unsupported'; code: number };

/** Description of one column in a result row. */
export type RowField = {
  name: string;
  tableOid: number;
  columnId: number;
  typeOid: number;
  typeSize: number;
  typeModifier: number;
  format: number; // 0 = text, 1 = binary
};

/** A backend-to-frontend message. */
export type BackendMessage =
  | { type: 'R'; auth: AuthRequest }
  | { type: 'S'; param: string; value: string }
  | { type: 'K'; processId: number; secretKey: number }
  | { type: 'Z'; status: 'I' | 'T' | 'E' }
  | { type: 'T'; fields: RowField[] }
  | { type: 'D'; values: (Uint8Array | null)[] }
  | { type: 'C'; tag: string }
  | { type: 'I' } // EmptyQueryResponse
  | { type: 'E'; fields: Map<string, string> } // ErrorResponse
  | { type: 'N'; fields: Map<string, string> } // NoticeResponse
  | { type: '1' } // ParseComplete
  | { type: '2' } // BindComplete
  | { type: '3' } // CloseComplete
  | { type: 'n' } // NoData
  | { type: 's' } // PortalSuspended
  | { type: 't'; typeOids: number[] } // ParameterDescription
  | { type: 'A'; processId: number; channel: string; payload: string } // NotificationResponse
  | { type: 'unknown'; tag: string };

//#endregion Backend message types

//#region Backend message reader

/**
 * Try to parse one full backend message from `buffer` starting at `offset`.
 *
 * @returns `{ message, consumed }` on success, `null` if more data is needed.
 *
 * @throws If the message is malformed (bad length, bad type byte).
 */
export function tryReadMessage(
  buffer: Uint8Array,
  offset: number = 0,
): { message: BackendMessage; consumed: number } | null {
  // Need at least type byte + 4-byte length.
  if (buffer.length - offset < 5) return null;
  const type = String.fromCharCode(buffer[offset]!);
  const length = _readUInt32BE(buffer, offset + 1);
  // length is 4 (length itself) + payloadLen
  const totalSize = 1 + length;
  if (buffer.length - offset < totalSize) return null;
  const payloadStart = offset + 5;
  const payloadEnd = offset + totalSize;
  const payload = buffer.subarray(payloadStart, payloadEnd);
  return {
    message: _decode(type, payload),
    consumed: totalSize,
  };
}

function _decode(type: string, payload: Uint8Array): BackendMessage {
  switch (type) {
    case 'R':
      return _decodeAuth(payload);
    case 'S':
      return _decodeParameterStatus(payload);
    case 'K':
      return {
        type: 'K',
        processId: _readUInt32BE(payload, 0),
        secretKey: _readUInt32BE(payload, 4),
      };
    case 'Z':
      return {
        type: 'Z',
        status: String.fromCharCode(payload[0]!) as 'I' | 'T' | 'E',
      };
    case 'T':
      return _decodeRowDescription(payload);
    case 'D':
      return _decodeDataRow(payload);
    case 'C':
      return { type: 'C', tag: _readCString(payload, 0).value };
    case 'I':
      return { type: 'I' };
    case 'E':
      return { type: 'E', fields: _decodeErrorFields(payload) };
    case 'N':
      return { type: 'N', fields: _decodeErrorFields(payload) };
    case '1':
      return { type: '1' };
    case '2':
      return { type: '2' };
    case '3':
      return { type: '3' };
    case 'n':
      return { type: 'n' };
    case 's':
      return { type: 's' };
    case 't':
      return _decodeParameterDescription(payload);
    case 'A':
      return _decodeNotification(payload);
    default:
      return { type: 'unknown', tag: type };
  }
}

function _decodeAuth(payload: Uint8Array): BackendMessage {
  const code = _readUInt32BE(payload, 0);
  switch (code) {
    case 0:
      return { type: 'R', auth: { kind: 'ok' } };
    case 3:
      return { type: 'R', auth: { kind: 'cleartext' } };
    case 5:
      return {
        type: 'R',
        auth: { kind: 'md5', salt: payload.slice(4, 8) },
      };
    case 10: {
      // SASL: list of null-terminated mechanism names, then final null.
      const mechanisms: string[] = [];
      let off = 4;
      while (off < payload.length) {
        const cstr = _readCString(payload, off);
        if (cstr.value.length === 0) break;
        mechanisms.push(cstr.value);
        off += cstr.consumed;
      }
      return { type: 'R', auth: { kind: 'sasl', mechanisms } };
    }
    case 11:
      return {
        type: 'R',
        auth: { kind: 'sasl-continue', data: payload.slice(4) },
      };
    case 12:
      return {
        type: 'R',
        auth: { kind: 'sasl-final', data: payload.slice(4) },
      };
    default:
      return { type: 'R', auth: { kind: 'unsupported', code } };
  }
}

function _decodeParameterStatus(payload: Uint8Array): BackendMessage {
  const param = _readCString(payload, 0);
  const value = _readCString(payload, param.consumed);
  return { type: 'S', param: param.value, value: value.value };
}

function _decodeRowDescription(payload: Uint8Array): BackendMessage {
  const numFields = _readUInt16BE(payload, 0);
  const fields: RowField[] = [];
  let off = 2;
  for (let i = 0; i < numFields; i++) {
    const name = _readCString(payload, off);
    off += name.consumed;
    const tableOid = _readUInt32BE(payload, off);
    off += 4;
    const columnId = _readUInt16BE(payload, off);
    off += 2;
    const typeOid = _readUInt32BE(payload, off);
    off += 4;
    const typeSize = _readInt16BE(payload, off);
    off += 2;
    const typeModifier = _readInt32BE(payload, off);
    off += 4;
    const format = _readUInt16BE(payload, off);
    off += 2;
    fields.push({
      name: name.value,
      tableOid,
      columnId,
      typeOid,
      typeSize,
      typeModifier,
      format,
    });
  }
  return { type: 'T', fields };
}

function _decodeDataRow(payload: Uint8Array): BackendMessage {
  const numCols = _readUInt16BE(payload, 0);
  const values: (Uint8Array | null)[] = [];
  let off = 2;
  for (let i = 0; i < numCols; i++) {
    const len = _readInt32BE(payload, off);
    off += 4;
    if (len < 0) {
      values.push(null);
    } else {
      values.push(payload.slice(off, off + len));
      off += len;
    }
  }
  return { type: 'D', values };
}

function _decodeErrorFields(payload: Uint8Array): Map<string, string> {
  const fields = new Map<string, string>();
  let off = 0;
  while (off < payload.length) {
    const fieldType = payload[off]!;
    if (fieldType === 0) break;
    const value = _readCString(payload, off + 1);
    fields.set(String.fromCharCode(fieldType), value.value);
    off += 1 + value.consumed;
  }
  return fields;
}

function _decodeParameterDescription(payload: Uint8Array): BackendMessage {
  const count = _readUInt16BE(payload, 0);
  const typeOids: number[] = [];
  for (let i = 0; i < count; i++) {
    typeOids.push(_readUInt32BE(payload, 2 + i * 4));
  }
  return { type: 't', typeOids };
}

function _decodeNotification(payload: Uint8Array): BackendMessage {
  const processId = _readUInt32BE(payload, 0);
  const channel = _readCString(payload, 4);
  const payloadStr = _readCString(payload, 4 + channel.consumed);
  return {
    type: 'A',
    processId,
    channel: channel.value,
    payload: payloadStr.value,
  };
}

//#endregion Backend message reader

//#region Bytes helpers

const _NUL = new Uint8Array([0]);

function _writeUInt32BE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = (value >>> 24) & 0xff;
  buf[offset + 1] = (value >>> 16) & 0xff;
  buf[offset + 2] = (value >>> 8) & 0xff;
  buf[offset + 3] = value & 0xff;
}

function _writeInt32BE(buf: Uint8Array, offset: number, value: number): void {
  // Two's complement 32-bit.
  _writeUInt32BE(buf, offset, value < 0 ? value + 0x100000000 : value);
}

function _writeUInt16BE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = (value >>> 8) & 0xff;
  buf[offset + 1] = value & 0xff;
}

function _readUInt32BE(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset]! * 0x1000000) +
    (buf[offset + 1]! << 16) +
    (buf[offset + 2]! << 8) +
    buf[offset + 3]!
  );
}

function _readInt32BE(buf: Uint8Array, offset: number): number {
  const u = _readUInt32BE(buf, offset);
  return u > 0x7fffffff ? u - 0x100000000 : u;
}

function _readUInt16BE(buf: Uint8Array, offset: number): number {
  return (buf[offset]! << 8) | buf[offset + 1]!;
}

function _readInt16BE(buf: Uint8Array, offset: number): number {
  const u = _readUInt16BE(buf, offset);
  return u > 0x7fff ? u - 0x10000 : u;
}

/** Read a null-terminated UTF-8 string starting at `offset`. */
function _readCString(
  buf: Uint8Array,
  offset: number,
): { value: string; consumed: number } {
  let end = offset;
  while (end < buf.length && buf[end] !== 0) end++;
  const value = dec.decode(buf.subarray(offset, end));
  return { value, consumed: end - offset + 1 };
}

/** Decode bytes as UTF-8. Exported for callers that need to decode payloads. */
export function decodeText(bytes: Uint8Array | null): string | null {
  return bytes === null ? null : dec.decode(bytes);
}

//#endregion Bytes helpers
