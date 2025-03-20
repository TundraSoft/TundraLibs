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

type StructuredDataKey = `${string}@${string}`;

export interface SyslogObject {
  facility: SyslogFacilities;
  // facilityName: SyslogFacility;
  severity: SyslogSeverities;
  // severityName: SyslogSeverity;
  timestamp: Date;
  hostname?: string;
  appName?: string;
  processId?: number;
  messageId?: string;
  structuredData?: Record<StructuredDataKey, Record<string, string>>;
  message: string;
}

const Patterns = {
  'RFC3164':
    /^(<(\d+)>)(([Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec]+)?\s*(\d{1,2})\s*(\d{4})?\s*(\d{1,2}:\d{1,2}:\d{1,2}))?\s*([^\s\:]+)?\s*(([^\s\:\[]+)?(\[(\d+)\])?)?:(.+)/i,
  'RFC5424':
    /^<(\d+)?>\d (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\S+)\s*([^\s]+)\s*([^\s]+)\s*([^\s]+)\s*([^\s]+)\s*/i,
  'STRUCT': /\[[^\]]+\]\s*/g,
  'STRUCTID': /\[((\w+)@(\d+))\s*/,
  'STRUCTKEYS': /([\w.-]+)\s*=\s*(["'])((?:(?=(\\?))\3.)*?)\2/,
}; //NOSONAR

function parsePri(
  pri: number,
): {
  facility: SyslogFacilities;
  severity: SyslogSeverities;
} {
  if (pri < 0 || pri > 191) {
    throw new Error(`Invalid priority value: ${pri}`);
  }
  const facKey =
    SyslogFacilities[Math.floor(pri / 8)] as keyof typeof SyslogFacilities;
  const sevKey = SyslogSeverities[pri % 8] as keyof typeof SyslogSeverities;
  return {
    facility: SyslogFacilities[facKey],
    severity: SyslogSeverities[sevKey],
  };
}

function parseStructuredData(structAndMessage: string): {
  structuredData?: Record<StructuredDataKey, Record<string, string>>;
  message?: string;
} {
  if (!structAndMessage) {
    return { message: undefined };
  }
  const sd: Record<StructuredDataKey, Record<string, string>> = {};
  if (new RegExp(Patterns.STRUCT, '').test(structAndMessage)) {
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
          if (keyValueMatch[1] && keyValueMatch[3]) {
            s[keyValueMatch[1]] = keyValueMatch[3];
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
    structuredData: sd,
    message: structAndMessage.length > 0 ? structAndMessage : undefined,
  };
}

export const parse = (log: string): SyslogObject => {
  if (!log) {
    throw new Error('Empty log message');
  }
  const logObj: SyslogObject = {
      facility: SyslogFacilities.KERN,
      // facilityName: 'KERN',
      severity: SyslogSeverities.DEBUG,
      // severityName: 'DEBUG',
      timestamp: new Date(),
      message: '',
    },
    BSDMatch = Patterns.RFC3164.exec(log),
    RFCMatch = Patterns.RFC5424.exec(log);
  if (RFCMatch) {
    const pri = parseInt(RFCMatch[1]!);
    const { facility, severity } = parsePri(pri);
    logObj.facility = facility;
    logObj.severity = severity;
    logObj.timestamp = new Date(Date.parse(RFCMatch[2]!.trim()));
    logObj.hostname = (RFCMatch[3] !== '-') ? RFCMatch[3] : undefined;
    logObj.appName = (RFCMatch[4] !== '-') ? RFCMatch[4] : undefined;
    if (RFCMatch[5] && RFCMatch[5] !== '-') {
      logObj.processId = parseInt(RFCMatch[5]!) as number;
    }

    logObj.messageId = (RFCMatch[6] !== '-') ? RFCMatch[6] : undefined;
    const { structuredData, message } = parseStructuredData(
      log.substring(RFCMatch[0].length),
    );
    logObj.structuredData = structuredData;
    if (message) {
      logObj.message = message;
    }
  } else if (BSDMatch) {
    const pri = parseInt(BSDMatch[2]!);
    const { facility, severity } = parsePri(pri);
    logObj.facility = facility;
    logObj.severity = severity;
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
    logObj.hostname = (BSDMatch[8] === '-') ? undefined : BSDMatch[8];
    logObj.appName = (BSDMatch[10] === '-') ? undefined : BSDMatch[10];
    logObj.processId = (BSDMatch[12] && BSDMatch[12] !== '-')
      ? parseInt(BSDMatch[12])
      : undefined;
    logObj.message = BSDMatch[13]!.trim();
  }
  return logObj;
};

export const stringify = (logObj: SyslogObject): string => {
  if (!logObj.message && !logObj.structuredData) {
    throw new Error('Either message or structured data must be provided');
  }
  if (
    logObj.processId !== undefined &&
    (isNaN(logObj.processId) || logObj.processId < 0)
  ) {
    throw new Error('Invalid process ID');
  }
  const pri = logObj.facility * 8 + logObj.severity;
  let log = `<${pri}>${logObj.timestamp.toISOString()} ${
    logObj.hostname ?? '-'
  } ${logObj.appName ?? '-'} ${logObj.processId ?? '-'} ${
    logObj.messageId ?? '-'
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
