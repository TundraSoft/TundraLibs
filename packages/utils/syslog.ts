/**
 * @fileoverview Comprehensive RFC 3164 and RFC 5424 syslog message parsing and generation.
 *
 * This module provides complete syslog support for both legacy RFC 3164 and modern RFC 5424
 * formats. It handles parsing syslog messages from network streams, log files, or strings,
 * and can generate properly formatted syslog messages for transmission to syslog servers.
 *
 * **Supported Standards:**
 * - RFC 3164: Traditional syslog format (legacy)
 * - RFC 5424: Modern syslog format with structured data
 *
 * **Key Features:**
 * - Automatic format detection and parsing
 * - Full structured data support (RFC 5424)
 * - Facility and severity name resolution
 * - Process ID and message ID handling
 * - Timezone-aware timestamp parsing
 * - Validation and error handling
 * - TypeScript-first design with comprehensive types
 *
 * **Common Use Cases:**
 * - Log aggregation and analysis systems
 * - Security information and event management (SIEM)
 * - Network monitoring and diagnostics
 * - Application logging infrastructure
 * - Compliance and audit logging
 *
 * @example Basic parsing:
 * ```typescript
 * const message = '<34>Oct 11 22:14:15 mymachine su: john changed user';
 * const parsed = parse(message);
 * console.log(parsed.facilityName); // 'AUTH'
 * console.log(parsed.severityName); // 'INFO'
 * ```
 *
 * @example Structured data parsing (RFC 5424):
 * ```typescript
 * const message = '<165>1 2003-08-24T05:14:15.000003-07:00 192.0.2.1 myproc 8710 - [exampleSDID@32473 iut="3" eventSource="Application"]';
 * const parsed = parse(message);
 * console.log(parsed.structuredData); // { 'exampleSDID@32473': { iut: '3', eventSource: 'Application' } }
 * ```
 */

/**
 * Standard syslog severity levels as defined in RFC 3164 and RFC 5424.
 *
 * These numeric values correspond to the urgency and importance of log messages,
 * with lower numbers indicating higher severity.
 *
 * @example Usage in log filtering:
 * ```typescript
 * if (parsed.severity <= SyslogSeverities.ERROR) {
 *   alertOncall(parsed.message);
 * }
 * ```
 */
export enum SyslogSeverities {
  /** System is unusable - immediate action required */
  EMERGENCY = 0,
  /** Action must be taken immediately */
  ALERT = 1,
  /** Critical conditions */
  CRITICAL = 2,
  /** Error conditions */
  ERROR = 3,
  /** Warning conditions */
  WARNING = 4,
  /** Normal but significant condition */
  NOTICE = 5,
  /** Informational messages */
  INFO = 6,
  /** Debug-level messages */
  DEBUG = 7,
}

/**
 * Standard syslog facility codes as defined in RFC 3164 and RFC 5424.
 *
 * Facilities indicate the type of system or application generating the log message.
 * The LOCAL0-LOCAL7 facilities are typically used for custom applications.
 *
 * @example Custom application logging:
 * ```typescript
 * const logEntry = {
 *   facility: SyslogFacilities.LOCAL0,
 *   severity: SyslogSeverities.INFO,
 *   message: 'Application started successfully'
 * };
 * ```
 */
export enum SyslogFacilities {
  /** Kernel messages */
  KERN = 0,
  /** User-level messages */
  USER = 1,
  /** Mail system */
  MAIL = 2,
  /** System daemons */
  DAEMON = 3,
  /** Security/authorization messages */
  AUTH = 4,
  /** Messages generated internally by syslogd */
  SYSLOG = 5,
  /** Line printer subsystem */
  LPR = 6,
  /** Network news subsystem */
  NEWS = 7,
  /** UUCP subsystem */
  UUCP = 8,
  /** Clock daemon */
  CRON = 9,
  /** Security/authorization messages */
  AUTHPRIV = 10,
  /** FTP daemon */
  FTP = 11,
  /** Local use facility 0 */
  LOCAL0 = 16,
  /** Local use facility 1 */
  LOCAL1 = 17,
  /** Local use facility 2 */
  LOCAL2 = 18,
  /** Local use facility 3 */
  LOCAL3 = 19,
  /** Local use facility 4 */
  LOCAL4 = 20,
  /** Local use facility 5 */
  LOCAL5 = 21,
  /** Local use facility 6 */
  LOCAL6 = 22,
  /** Local use facility 7 */
  LOCAL7 = 23,
}

/**
 * Syslog severity level name.
 */
export type SyslogSeverity = keyof typeof SyslogSeverities;
/**
 * Syslog facility name.
 */
export type SyslogFacility = keyof typeof SyslogFacilities;

/**
 * Structured data key format (element_id@enterprise_number).
 */
export type StructuredDataKey = `${string}@${string}`;

/**
 * Parsed syslog message object.
 */
export interface SyslogObject {
  facility: SyslogFacilities;
  facilityName?: SyslogFacility;
  severity: SyslogSeverities;
  severityName?: SyslogSeverity;
  timestamp: Date;
  hostname?: string;
  appName?: string;
  processId?: number;
  messageId?: string;
  structuredData?: Record<StructuredDataKey, Record<string, string>>;
  message: string;
}

// Define constants for magic numbers
const FACILITY_SHIFT = 8;
const NIL_VALUE = '-';
const MAX_PRI_VALUE = 191;
const MIN_PRI_VALUE = 0;

const Patterns = {
  'RFC3164':
    /^(<(\d+)>)((?:(\d{4})\s+)?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)?\s*(\d{1,2})\s*(\d{4})?\s*(\d{1,2}:\d{1,2}:\d{1,2}))?\s*([^\s\:]+)?\s*(([^\s\:\[]+)?(\[(\d+|)\])?)?:(.+)/i, //NOSONAR - Allow empty process ID brackets and year-first timestamps
  'RFC5424':
    /^<(\d+)?>\d (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\S+)\s*([^\s]+)\s*([^\s]+)\s*([^\s]+)\s*([^\s]+)\s*/i, //NOSONAR
  'STRUCTID': /\[(([a-zA-Z0-9._-]+)@(\d+(?:\.\d+)*))\s*/, // Allow dots and hyphens in element names
  'STRUCTKEYS': /([\w.-]+)\s*=\s*(["'])((?:(?=(\\?))\3.)*?)\2/,
};

/**
 * Parses the priority value into facility and severity components
 * @param pri - The priority value to parse
 * @returns An object containing facility and severity information
 * @throws Error if priority value is invalid
 */
function parsePri(
  pri: number,
): {
  facility: SyslogFacilities;
  severity: SyslogSeverities;
  facilityName?: SyslogFacility;
  severityName?: SyslogSeverity;
} {
  if (pri < MIN_PRI_VALUE || pri > MAX_PRI_VALUE) {
    throw new Error(`Invalid priority value: ${pri}`);
  }
  const facility = Math.floor(pri / FACILITY_SHIFT) as SyslogFacilities;
  const severity = (pri % FACILITY_SHIFT) as SyslogSeverities;

  const facilityName = Object.keys(SyslogFacilities).find(
    (key) =>
      SyslogFacilities[key as keyof typeof SyslogFacilities] === facility,
  ) as SyslogFacility | undefined;

  const severityName = Object.keys(SyslogSeverities).find(
    (key) =>
      SyslogSeverities[key as keyof typeof SyslogSeverities] === severity,
  ) as SyslogSeverity | undefined;

  return {
    facility,
    severity,
    facilityName,
    severityName,
  };
}

/**
 * Parses structured data from a syslog message
 * @param structAndMessage - The structured data and message portion of a syslog message
 * @returns Parsed structured data and message
 */
function parseStructuredData(structAndMessage: string): {
  structuredData?: Record<StructuredDataKey, Record<string, string>>;
  message?: string;
} {
  const sd: Record<StructuredDataKey, Record<string, string>> = {};
  let remaining = structAndMessage;

  // RFC 5424 6: STRUCTURED-DATA is either the NILVALUE '-' or one or more
  // SD-ELEMENTs, and it sits at the FRONT of this tail (the header regex has
  // already consumed everything up to and including MSGID). Anything after the
  // SD field is the free-text MSG, which may itself contain bracketed text
  // ("[ERROR]", "user [bob]", array dumps). We therefore only consume SD from
  // the FRONT, one element at a time, instead of scanning the whole string for
  // brackets — the latter desynchronizes positions and chops chunks out of the
  // message whenever it contains a '[...]'.
  const nilMatch = /^-(?:\s+|$)/.exec(remaining);
  if (nilMatch) {
    // Nil structured data ('-'): strip the marker (and its separator) so it
    // does not leak into the message; the rest is the MSG.
    remaining = remaining.substring(nilMatch[0].length);
  } else {
    // Consume leading SD-ELEMENTs. `leadingStruct` is anchored (`^`) so only a
    // bracket at the current start of the remainder is eligible — brackets
    // later in the MSG are never matched here.
    const leadingStruct = /^\[[^\]]+\]\s*/;
    let struct = leadingStruct.exec(remaining);
    while (struct) {
      const element = struct[0];
      const structIdLookup = element.match(Patterns.STRUCTID);
      // A leading bracket that is not a valid SD-ELEMENT (no "name@enterpriseId"
      // SD-ID) is NOT structured data. Per RFC 5424 §6 a SP after `]` ends the
      // SD field, so such a bracket begins the free-text MSG — e.g. a severity
      // tag "[ERROR]", a "[WARN]" prefix, or an array dump "[1,2,3] …". Stop
      // consuming here and leave it (and everything after it) as message
      // content, instead of silently dropping it.
      if (!structIdLookup) {
        break;
      }
      const s: Record<string, string> = {};
      let keyValuePairs = element.substring(
          structIdLookup[0].length,
          element.length - 1,
        ).trim(),
        keyValueMatch = keyValuePairs.match(Patterns.STRUCTKEYS);
      while (keyValueMatch) {
        // Even if keyValueMatch[3] is empty, we should still set the value
        if (keyValueMatch[1]) {
          s[keyValueMatch[1]] = keyValueMatch[3] || '';
        }
        keyValuePairs = keyValuePairs.substring(keyValueMatch[0].length)
          .trim();
        keyValueMatch = keyValuePairs.match(Patterns.STRUCTKEYS);
      }
      sd[structIdLookup[1]!.trim() as StructuredDataKey] = s;
      // Consumption is length-exact against the current remainder, so no
      // desync occurs.
      remaining = remaining.substring(element.length);
      struct = leadingStruct.exec(remaining);
    }
  }

  remaining = remaining.trim();
  return {
    structuredData: Object.keys(sd).length > 0 ? sd : undefined,
    message: remaining.length > 0 ? remaining : undefined,
  };
}

/**
 * Parses a syslog message string into a structured object
 * @param log - The syslog message to parse
 * @returns The parsed syslog object
 * @throws {Error} When the log message is empty or has invalid/unsupported format
 */
export const parse = (log: string): SyslogObject => {
  if (!log) {
    throw new Error('Empty log message');
  }
  const logObj: SyslogObject = {
      facility: SyslogFacilities.KERN,
      severity: SyslogSeverities.DEBUG,
      timestamp: new Date(),
      message: '',
    },
    BSDMatch = Patterns.RFC3164.exec(log),
    RFCMatch = Patterns.RFC5424.exec(log);
  if (!RFCMatch && !BSDMatch) {
    throw new Error('Invalid/Unsupported syslog format');
  }
  if (RFCMatch) {
    const priValue = RFCMatch[1];
    if (priValue === undefined || priValue === '' || priValue === null) {
      throw new Error('Invalid RFC5424 format: Missing priority value');
    }
    const pri = Number.parseInt(priValue, 10);
    const { facility, severity, facilityName, severityName } = parsePri(pri);
    logObj.facility = facility;
    logObj.severity = severity;
    logObj.facilityName = facilityName;
    logObj.severityName = severityName;
    logObj.timestamp = new Date(Date.parse(RFCMatch[2]!.trim()));
    logObj.hostname = (RFCMatch[3] === NIL_VALUE) ? undefined : RFCMatch[3];
    logObj.appName = (RFCMatch[4] === NIL_VALUE) ? undefined : RFCMatch[4];
    if (RFCMatch[5] && RFCMatch[5] !== NIL_VALUE) {
      const procId = Number.parseInt(RFCMatch[5], 10);
      if (!Number.isNaN(procId)) {
        logObj.processId = procId;
      }
    }

    logObj.messageId = (RFCMatch[6] === NIL_VALUE) ? undefined : RFCMatch[6];
    const { structuredData, message } = parseStructuredData(
      log.substring(RFCMatch[0].length),
    );
    logObj.structuredData = structuredData;
    if (message) {
      logObj.message = message;
    }
  } else if (BSDMatch) {
    const priValue = BSDMatch[2];
    // Handle empty string case explicitly
    if (priValue === undefined || priValue === '' || priValue === null) {
      throw new Error('Invalid RFC3164 format: Missing priority value');
    }
    const pri = Number.parseInt(priValue, 10);
    if (Number.isNaN(pri)) {
      throw new TypeError('Invalid RFC3164 format: Invalid priority value');
    }

    const { facility, severity, facilityName, severityName } = parsePri(pri);
    logObj.facility = facility;
    logObj.severity = severity;
    logObj.facilityName = facilityName;
    logObj.severityName = severityName;
    if (BSDMatch[3]) {
      // The year may appear before the month (year-first form, BSDMatch[4]) or
      // after the day (BSDMatch[7]); prefer whichever is actually present and
      // fall back to the current year when the timestamp carries none — the
      // traditional RFC 3164 "Mmm dd hh:mm:ss" shape omits the year entirely.
      let year = new Date().getFullYear();
      if (BSDMatch[4]) {
        year = Number.parseInt(BSDMatch[4], 10);
      } else if (BSDMatch[7]) {
        year = Number.parseInt(BSDMatch[7], 10);
      }
      logObj.timestamp = new Date(
        `${BSDMatch[5]} ${BSDMatch[6]} ${year} ${BSDMatch[8]}`,
      );
    } else {
      logObj.timestamp = new Date();
    }
    logObj.hostname = (BSDMatch[9] && BSDMatch[9] !== NIL_VALUE)
      ? BSDMatch[9]
      : undefined;
    logObj.appName = (BSDMatch[11] && BSDMatch[11] !== NIL_VALUE)
      ? BSDMatch[11]
      : undefined;
    if (BSDMatch[13] && BSDMatch[13] !== NIL_VALUE && BSDMatch[13] !== '') {
      const procId = Number.parseInt(BSDMatch[13], 10);
      if (!Number.isNaN(procId)) {
        logObj.processId = procId;
      }
    }
    const message = BSDMatch[14];
    logObj.message = message ? message.trim() : '';
  }
  return logObj;
};

/**
 * Escapes a structured-data parameter value per RFC5424 6.3.3. Inside a
 * `PARAM-VALUE`, the characters `"`, `\` and `]` must be escaped with a
 * leading backslash; otherwise an attacker-controlled value could break
 * out of the field/element and inject arbitrary structured data (log
 * injection). Line breaks and other C0 control bytes (except TAB) are
 * additionally stripped, since a raw CR/LF cannot be escaped into a value
 * and would forge a new record on line-delimited transports.
 *
 * @param value - The raw parameter value.
 * @returns The escaped value safe to embed in `key="value"`.
 */
function escapeSdValue(value: string): string {
  return stripControl(value).replace(/([\\\]"])/g, '\\$1');
}

/**
 * Strip C0 control bytes (except TAB) and DEL. A raw CR/LF in any emitted
 * field would forge an additional record on line-delimited transports; other
 * control bytes can corrupt downstream parsers.
 */
function stripControl(value: string): string {
  // deno-lint-ignore no-control-regex
  return value.replace(/[\x00-\x08\x0a-\x1f\x7f]/g, '');
}

/**
 * Sanitize an SD-NAME (an SD-ID or a PARAM-NAME). RFC 5424 6.3.2/6.3.3 define
 * SD-NAME as PRINTUSASCII except `=`, SP, `]` and `"`. Any other byte is not
 * merely invalid — left unescaped it lets an attacker-controlled key break out
 * of the `[id key="val"]` element and forge structured data. Every disallowed
 * byte is REPLACED with `_` (itself a valid SD-NAME byte) rather than deleted:
 * deletion could collapse a fully-disallowed name to the empty string, which
 * would emit `[ …]` / ` ="v"` — an empty SD-ID token that shifts field parsing
 * or a malformed PARAM-NAME that drops the element on the receiver.
 */
function sanitizeSdName(name: string): string {
  // Replace anything outside PRINTUSASCII (0x21-0x7e) minus '"' (0x22),
  // '=' (0x3d) and ']' (0x5d) — SP and control bytes fall outside the kept
  // ranges — with '_'. Substitution preserves length, so a non-empty name can
  // never collapse to an empty token; only an empty input needs the floor.
  const sanitized = name.replace(/[^\x21\x23-\x3c\x3e-\x5c\x5e-\x7e]/g, '_');
  return sanitized.length > 0 ? sanitized : '_';
}

/**
 * Sanitize a space-delimited header token (HOSTNAME, APP-NAME, MSGID). These
 * are PRINTUSASCII with no spaces; any whitespace would shift field parsing on
 * the receiver and a CR/LF would forge a new record. Every whitespace, DEL and
 * control byte is REPLACED with `_` rather than deleted, and a value that is
 * left empty (nothing but disallowed bytes, or an empty input) folds to the
 * NILVALUE `-`. Deletion alone could collapse a fully-disallowed value to the
 * empty string, which — interpolated between the two field-separator spaces —
 * would emit a double space (an empty token) and shift every following header
 * field left by one on the receiver.
 */
function sanitizeHeaderField(value: string): string {
  // Replace SP and control bytes (0x00-0x20) plus DEL (0x7f) with '_'.
  // deno-lint-ignore no-control-regex
  const sanitized = value.replace(/[\x00-\x20\x7f]/g, '_');
  return sanitized.length > 0 ? sanitized : NIL_VALUE;
}

/**
 * Converts a syslog object to a string in RFC5424 format
 * @param logObj - The syslog object to stringify
 * @returns The formatted syslog string
 * @throws Error if neither message nor structured data is provided
 * @throws Error if processId is invalid
 */
export const stringify = (
  logObj: Omit<SyslogObject, 'facilityName' | 'severityName'>,
): string => {
  if (!logObj.message && !logObj.structuredData) {
    throw new Error('Either message or structured data must be provided');
  }
  if (
    logObj.processId !== undefined &&
    (Number.isNaN(logObj.processId) || logObj.processId < 0)
  ) {
    throw new Error('Invalid process ID');
  }
  const pri = logObj.facility * FACILITY_SHIFT + logObj.severity;
  const version = 1; // RFC5424 version

  // Header fields are space-delimited PRINTUSASCII tokens; sanitize so an
  // embedded space cannot shift field parsing and a CR/LF cannot forge a new
  // record (log injection through hostname / appName / messageId). The
  // NILVALUE '-' passes through sanitization unchanged.
  const hostname = sanitizeHeaderField(logObj.hostname ?? NIL_VALUE);
  const appName = sanitizeHeaderField(logObj.appName ?? NIL_VALUE);
  const messageId = sanitizeHeaderField(logObj.messageId ?? NIL_VALUE);

  let log =
    `<${pri}>${version} ${logObj.timestamp.toISOString()} ${hostname} ${appName} ${
      logObj.processId ?? NIL_VALUE
    } ${messageId} `;

  // STRUCTURED-DATA is mandatory in RFC 5424 (SYSLOG-MSG = HEADER SP
  // STRUCTURED-DATA [SP MSG]): emit the SD-ELEMENTs, or the NILVALUE '-' when
  // there is no structured data, so compliant receivers do not read the first
  // MSG token as the SD field. SD-IDs and PARAM-NAMEs are sanitized to the
  // SD-NAME charset so an attacker-controlled key cannot break out of the
  // element and forge structured data.
  const sdEntries = logObj.structuredData
    ? Object.entries(logObj.structuredData)
    : [];
  if (sdEntries.length > 0) {
    for (const [key, value] of sdEntries) {
      log += `[${sanitizeSdName(key)}`;
      for (const [k, v] of Object.entries(value)) {
        log += ` ${sanitizeSdName(k)}="${escapeSdValue(v)}"`;
      }
      log += '] ';
    }
  } else {
    log += `${NIL_VALUE} `;
  }
  // MSG is the final field; strip CR/LF and other control bytes so a newline
  // cannot forge an additional complete record on line-delimited transports.
  log += stripControl(logObj.message ?? '');
  return log;
};
