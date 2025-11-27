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

export type SyslogSeverity = keyof typeof SyslogSeverities;
export type SyslogFacility = keyof typeof SyslogFacilities;

export type StructuredDataKey = `${string}@${string}`;

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
    /^(<(\d+)>)((?:\d{4}\s+)?([Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec]+)?\s*(\d{1,2})\s*(\d{4})?\s*(\d{1,2}:\d{1,2}:\d{1,2}))?\s*([^\s\:]+)?\s*(([^\s\:\[]+)?(\[(\d+|)\])?)?:(.+)/i, //NOSONAR - Allow empty process ID brackets and year-first timestamps
  'RFC5424':
    /^<(\d+)?>\d (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\S+)\s*([^\s]+)\s*([^\s]+)\s*([^\s]+)\s*([^\s]+)\s*/i, //NOSONAR
  'STRUCT': /\[[^\]]+\]\s*/g,
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
  if (new RegExp(Patterns.STRUCT, 'g').test(structAndMessage)) {
    const structData = structAndMessage.matchAll(Patterns.STRUCT);
    for (const struct of structData) {
      structAndMessage = structAndMessage.substring(struct[0].length).trim();
      const structIdLookup = struct[0].match(Patterns.STRUCTID);
      let s: Record<string, string>;
      if (structIdLookup) {
        s = {};
        let keyValuePairs = struct[0].substring(
            structIdLookup[0].length,
            struct[0].length - 1,
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
      }
    }
  }
  return {
    structuredData: Object.keys(sd).length > 0 ? sd : undefined,
    message: structAndMessage.length > 0 ? structAndMessage : undefined,
  };
}

/**
 * Parses a syslog message string into a structured object
 * @param log - The syslog message to parse
 * @returns The parsed syslog object
 * @throws Error if the log message is empty
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
    logObj.hostname = (RFCMatch[3] !== NIL_VALUE) ? RFCMatch[3] : undefined;
    logObj.appName = (RFCMatch[4] !== NIL_VALUE) ? RFCMatch[4] : undefined;
    if (RFCMatch[5] && RFCMatch[5] !== NIL_VALUE) {
      const procId = Number.parseInt(RFCMatch[5], 10);
      if (!Number.isNaN(procId)) {
        logObj.processId = procId;
      }
    }

    logObj.messageId = (RFCMatch[6] !== NIL_VALUE) ? RFCMatch[6] : undefined;
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
      let year = new Date().getFullYear();
      if (BSDMatch[6]) {
        year = Number.parseInt(BSDMatch[6]!);
      }
      logObj.timestamp = new Date(
        `${BSDMatch[4]} ${BSDMatch[5]} ${year} ${BSDMatch[7]}`,
      );
    } else {
      logObj.timestamp = new Date();
    }
    logObj.hostname = (BSDMatch[8] && BSDMatch[8] !== NIL_VALUE)
      ? BSDMatch[8]
      : undefined;
    logObj.appName = (BSDMatch[10] && BSDMatch[10] !== NIL_VALUE)
      ? BSDMatch[10]
      : undefined;
    if (BSDMatch[12] && BSDMatch[12] !== NIL_VALUE && BSDMatch[12] !== '') {
      const procId = Number.parseInt(BSDMatch[12], 10);
      if (!Number.isNaN(procId)) {
        logObj.processId = procId;
      }
    }
    const message = BSDMatch[13];
    logObj.message = message ? message.trim() : '';
  }
  return logObj;
};

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

  let log = `<${pri}>${version} ${logObj.timestamp.toISOString()} ${
    logObj.hostname ?? NIL_VALUE
  } ${logObj.appName ?? NIL_VALUE} ${logObj.processId ?? NIL_VALUE} ${
    logObj.messageId ?? NIL_VALUE
  } `;
  if (logObj.structuredData) {
    for (const [key, value] of Object.entries(logObj.structuredData)) {
      log += `[${key}`;
      for (const [k, v] of Object.entries(value)) {
        log += ` ${k}="${v}"`;
      }
      log += '] ';
    }
  }
  log += logObj.message;
  return log;
};
