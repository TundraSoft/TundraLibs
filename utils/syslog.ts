export enum SyslogSeverities {
  EMERGENCY = 0,
  ALERT = 1,
  CRITICAL = 2,
  ERROR = 3,
  WARNING = 4,
  NOTICE = 5,
  INFO = 6,
  DEBUG = 7,
}

export enum SyslogFacilities {
  KERN = 0,
  USER = 1,
  MAIL = 2,
  DAEMON = 3,
  AUTH = 4,
  SYSLOG = 5,
  LPR = 6,
  NEWS = 7,
  UUCP = 8,
  CRON = 9,
  AUTHPRIV = 10,
  FTP = 11,
  LOCAL0 = 16,
  LOCAL1 = 17,
  LOCAL2 = 18,
  LOCAL3 = 19,
  LOCAL4 = 20,
  LOCAL5 = 21,
  LOCAL6 = 22,
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
    /^(<(\d+)>)(([Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec]+)?\s*(\d{1,2})\s*(\d{4})?\s*(\d{1,2}:\d{1,2}:\d{1,2}))?\s*([^\s\:]+)?\s*(([^\s\:\[]+)?(\[(\d+)\])?)?:(.+)/i, //NOSONAR
  'RFC5424':
    /^<(\d+)?>\d (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\S+)\s*([^\s]+)\s*([^\s]+)\s*([^\s]+)\s*([^\s]+)\s*/i, //NOSONAR
  'STRUCT': /\[[^\]]+\]\s*/g,
  'STRUCTID': /\[((\w+)@(\d+))\s*/,
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
  if (!structAndMessage) {
    return { message: undefined };
  }
  const sd: Record<StructuredDataKey, Record<string, string>> = {};
  if (structAndMessage.match(Patterns.STRUCT)) {
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
      } else {
        throw new Error(`Malformed structured data received: ${struct}`);
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
    const pri = parseInt(priValue, 10);
    const { facility, severity, facilityName, severityName } = parsePri(pri);
    logObj.facility = facility;
    logObj.severity = severity;
    logObj.facilityName = facilityName;
    logObj.severityName = severityName;
    logObj.timestamp = new Date(Date.parse(RFCMatch[2]!.trim()));
    logObj.hostname = (RFCMatch[3] !== NIL_VALUE) ? RFCMatch[3] : undefined;
    logObj.appName = (RFCMatch[4] !== NIL_VALUE) ? RFCMatch[4] : undefined;
    if (RFCMatch[5] && RFCMatch[5] !== NIL_VALUE) {
      const procId = parseInt(RFCMatch[5], 10);
      if (!isNaN(procId)) {
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
    const pri = parseInt(priValue, 10);
    if (isNaN(pri)) {
      throw new Error('Invalid RFC3164 format: Invalid priority value');
    }

    const { facility, severity, facilityName, severityName } = parsePri(pri);
    logObj.facility = facility;
    logObj.severity = severity;
    logObj.facilityName = facilityName;
    logObj.severityName = severityName;
    if (BSDMatch[3]) {
      let year = new Date().getFullYear();
      if (BSDMatch[6]) {
        year = parseInt(BSDMatch[6]!);
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
    if (BSDMatch[12] && BSDMatch[12] !== NIL_VALUE) {
      const procId = parseInt(BSDMatch[12], 10);
      if (!isNaN(procId)) {
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
    (isNaN(logObj.processId) || logObj.processId < 0)
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
