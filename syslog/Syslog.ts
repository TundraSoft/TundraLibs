import type { StructuredData, SyslogObject } from './types/mod.ts';
import { Facilities, Formats, Patterns, Severities } from './const/mod.ts';

export const Syslog = (): SyslogObject => {
  const validateStructureData = (
    structuredData: Record<string, StructuredData>,
  ) => {
    Object.entries(structuredData).forEach(([id, data]) => {
      // SDID must be alphanumeric@numeric
      if (!id.match(/^[a-z0-9_.-]{1,32}@[0-9]{1,}$/i)) {
        throw new Error(`Invalid structuredData id ${id}`);
      }
      Object.entries(data).forEach(([key, value]) => {
        if (!key.match(/^[a-z0-9_.-]{1,32}$/i)) {
          throw new Error(`Invalid structuredData key ${key}`);
        }
        if (!value.match(/^[^ \]\[]+$/)) {
          throw new Error('Invalid structuredData value');
        }
      });
    });
  };

  const proxyHandler: ProxyHandler<SyslogObject> = {
    get(target, prop) {
      switch (prop) {
        // case 'prival':
        case 'pri':
          return target.facility * 8 + target.severity;
        // case 'isoDateTime':
        //   return target.dateTime.toISOString();
        // case 'bsdDateTime':
        //   return `${target.dateTime.toDateString()} ${target.dateTime.toTimeString()}`;
        case 'toString':
          return (format: string = Formats.RFC5424) =>
            stringify(target, format);
        default:
          return target[prop as keyof SyslogObject];
      }
    },
    set(target, prop, value) {
      switch (prop) {
        case 'version':
          if (value !== '1') {
            throw new Error('Invalid version');
          }
          target.version = value;
          return true;
        // case 'prival':
        case 'pri':
          if (value < 0 || value > 191) {
            throw new Error('Invalid pri');
          }
          target.facility = Math.floor(value / 8);
          target.severity = value % 8;
          return true;
        case 'dateTime': {
          let dt: Date;
          if (!(value instanceof Date)) {
            try {
              dt = new Date(value);
            } catch {
              console.log('Invalid dateTime provided', value);
              throw new Error('Invalid dateTime provided');
            }
          } else {
            dt = value;
          }
          target.dateTime = dt;
          return true;
        }
        // case 'bsdDateTime':
        //   target.dateTime = new Date(value);
        //   return true;
        // case 'isoDateTime':
        //   target.dateTime = new Date(value);
        //   return true;
        case 'severity':
          if (value < 0 || value > 7) {
            throw new Error('Invalid severity');
          }
          target.severity = value;
          return true;
        case 'facility':
          if (value < 0 || value > 23) {
            throw new Error('Invalid facility');
          }
          target.facility = value;
          return true;
        case 'msgId':
          target.msgId = value;
          return true;
        case 'hostName':
          target.hostName = value.trim();
          return true;
        case 'appName':
          target.appName = value.trim();
          return true;
        case 'procId':
          target.procId = value;
          return true;
        case 'structuredData':
          // Validate structuredData
          validateStructureData(value);
          target.structuredData = value;
          return true;
        case 'message':
          target.message = value.trim();
          return true;
        default:
          throw new Error(`Invalid/unsupported property ${prop.toString()}`);
      }
    },
  };
  return new Proxy<SyslogObject>(
    {
      version: '1',
      dateTime: new Date(),
      facility: Facilities.LOCAL0,
      severity: Severities.EMERGENCY,

    } as SyslogObject,
    proxyHandler,
  );
};

export const parse = (log: string): SyslogObject => {
  const logObj = Syslog(),
    BSDMatch = log.match(Patterns.RFC3164),
    RFCMatch = log.match(Patterns.RFC5424);
  //<165>Aug 24 1987 05:34:00 mymachine myproc[10]: %% It\'s time to make the do-nuts.  %%  Ingredients: Mix=OK, Jelly=OK #Devices: Mixer=OK, Jelly_Injector=OK, Frier=OK # Transport: Conveyer1=OK, Conveyer2=OK # %%
  if (RFCMatch) {
    logObj.pri = parseInt(RFCMatch[1]);
    logObj.dateTime = new Date(Date.parse(RFCMatch[2].trim()));
    logObj.hostName = RFCMatch[3];
    logObj.appName = RFCMatch[4];
    logObj.procId = (RFCMatch[5] === '-') ? undefined : parseInt(RFCMatch[5]);
    logObj.msgId = RFCMatch[6];
    // process structuredData & message
    let structAndMessage = log.substring(RFCMatch[0].length);
    if (structAndMessage.match(Patterns.STRUCT)) {
      // console.log(structAndMessage.match(regExp.STRUCT));
      const structData = structAndMessage.matchAll(Patterns.STRUCT);
      const sd: Record<string, StructuredData> = {};
      for (const struct of structData) {
        structAndMessage = structAndMessage.substring(struct[0].length)
          .trim();
        // Get the id
        const structIdLookup = struct[0].match(Patterns.STRUCTID);
        let s: StructuredData;
        if (structIdLookup) {
          s = {};
          // Get the rest
          let keyValuePairs = struct[0].substring(
              structIdLookup[0].length,
              struct[0].length - 1,
            ).trim(),
            keyValueMatch = keyValuePairs.match(Patterns.STRUCTKEYS);
          while (keyValueMatch) {
            s[keyValueMatch[1]] = keyValueMatch[3];
            keyValuePairs = keyValuePairs.substring(keyValueMatch[0].length)
              .trim();
            keyValueMatch = keyValuePairs.match(Patterns.STRUCTKEYS);
          }
          // logObj.setStructuredData(structIdLookup[1].trim(), s);
          sd[structIdLookup[1].trim()] = s;
          // console.log(s);
        } else {
          throw new Error(`Malformed structured data received: ${struct}`);
        }
      }
      logObj.structuredData = sd;
      if (structAndMessage.length > 0) {
        logObj.message = structAndMessage;
      }
    }
  } else if (BSDMatch) {
    logObj.pri = parseInt(BSDMatch[2]);
    if (BSDMatch[3]) {
      // console.log(BSDMatch);
      let year = new Date().getFullYear();
      if (!BSDMatch[6]) {
        year = parseInt(BSDMatch[6]);
      }
      logObj.dateTime = new Date(
        year + ' ' + BSDMatch[4] + ' ' + BSDMatch[5] + ' ' + BSDMatch[7],
      );
    } else {
      // No Date :(
      logObj.dateTime = new Date();
    }
    logObj.hostName = BSDMatch[8];
    logObj.appName = BSDMatch[10];
    logObj.procId = (BSDMatch[12]) ? parseInt(BSDMatch[12]) : undefined;
    logObj.message = BSDMatch[13].trim();
  }
  return logObj;
};

export const stringify = (
  log: SyslogObject,
  format: string = Formats.RFC5424,
): string => {
  const computedValues: Record<string, string> = {
    prival: (log.facility * 8 + log.severity).toString(),
    severity: log.severity.toString(),
    severityname: Severities[log.severity],
    facility: log.facility.toString(),
    facilityname: Facilities[log.facility],
    version: log.version || '1',
    datetimeiso: log.dateTime.toISOString(),
    datetimebsd:
      `${log.dateTime.toDateString()} ${log.dateTime.toTimeString()}`,
    host: log.hostName || '-',
    appname: log.appName || '-',
    procid: log.procId ? log.procId.toString() : '-',
    msgid: log.msgId ? log.msgId : '-',
    structureddata: '-',
    message: log.message || '-',
  };
  //#region Structured Data
  if (log.structuredData && Object.keys(log.structuredData).length > 0) {
    let sd = '-';
    sd = '';
    Object.entries(log.structuredData).forEach(([id, data]) => {
      const sdDataKeys: Array<string> = [];
      Object.entries(data).forEach(([key, value]) => {
        sdDataKeys.push(`${key}="${value}"`);
      });
      sd += `[${id} ${sdDataKeys.join(' ')}]`;
    });
    computedValues.structureddata = sd;
  }

  return format.replaceAll(/{([^\s}]+)}/g, (match, name): string => {
    const key = name.trim().toLowerCase();
    // Return precomputed value if available, otherwise fallback to dynamic computation
    return computedValues[key] ?? match;
  });
};
