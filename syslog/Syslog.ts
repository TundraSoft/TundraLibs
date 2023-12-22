import { StructuredData, SyslogObject } from './types/mod.ts';
import { Facilities, Formats, Patterns, Severities } from './const/mod.ts';

/**
 * Syslog
 * Syslog class helps in manipulating RFC standard syslog object. It supports both RFC5424 and
 * RFC3164.
 * By default, it will default to RFC5424. If RFC3164 is passed, it will convert to RFC5424
 *
 * @TODO - Add validations for all getters and setters
 * @TODO - Handle slightly malformed messages - "<13>Mar 15 11:22:40 myhost.com     0    11,03/15/12,11:22:38,§ó·s,10.10.10.171,,40C6A91373B6,"
 * @TODO - Handle just message without prival - Mar 15 11:22:40 myhost.com     0    11,03/15/12,11:22:38,§ó·s,10.10.10.171,,40C6A91373B6,
 */
export class Syslog {
  protected _version = '1';
  protected _severity!: Severities;
  protected _facility!: Facilities;
  protected _msgId!: string | undefined;
  protected _message!: string | undefined;
  protected _appName!: string | undefined;
  protected _procId!: number | undefined;
  protected _hostName!: string | undefined;
  protected _dateTime!: Date;
  protected _structuredData: Map<string, StructuredData> = new Map();

  /**
   * constructor
   *
   * @param message string The log message string
   * @param severity LogSeverities The severity of the log message, defaults to INFORMATION
   * @param facility LogFacilities The facility which is generating the log. Defaults to USER0/LOCAL0
   */
  constructor(
    message?: string,
    severity = Severities.INFORMATIONAL,
    facility = Facilities.LOCAL0,
  ) {
    if (message) {
      this._message = message.trim();
    }
    this.facility = facility;
    this.severity = severity;
    this.dateTime = new Date();
    // this.msgId = nanoid(12, alphaNumeric);
  }

  //#region Getters and Setters
  /**
   * version
   *
   * get the version number. Always returns 1
   *
   * @type {string}
   */
  get version(): string {
    return this._version;
  }

  /**
   * severity
   *
   * Get or Set Log Severities.
   *
   * @type {Severities}
   */
  get severity(): Severities {
    return this._severity;
  }

  set severity(value: Severities) {
    this._severity = value;
  }

  /**
   * severityName
   *
   * Helper to get the Log Severity Name
   *
   * @type {string}
   */
  get severityName(): string {
    return Severities[this.severity];
  }

  /**
   * facility
   *
   * Get or set the Log Facilities
   *
   * @type {Facilities}
   */
  get facility(): Facilities {
    return this._facility;
  }

  set facility(value: Facilities) {
    this._facility = value;
  }

  /**
   * facilityName
   *
   * Helper to get the Log Facility Name
   *
   * @type {string}
   */
  get facilityName(): string {
    return Facilities[this.facility];
  }

  /**
   * msgId
   *
   * Get or Set a message ID
   *
   * @type {string}
   */
  get msgId(): string | undefined {
    return this._msgId;
  }

  set msgId(value: string | '-' | undefined) {
    if (value === '-') {
      value = undefined;
    }
    this._msgId = value;
  }

  /**
   * message
   *
   * Get or Set the actual log message
   *
   * @type {string}
   */
  get message(): string | undefined {
    return this._message;
  }

  set message(value: string | '-' | undefined) {
    if (value === '-') {
      value = undefined;
    }
    this._message = value;
  }

  /**
   * appName
   *
   * Get or Set the application name
   *
   * @type {string}
   */
  get appName(): string | undefined {
    return this._appName;
  }

  set appName(value: string | '-' | undefined) {
    if (value === '-') {
      value = undefined;
    } else if (value && value.match(/\s+/)) {
      // replace space with -
      value = value.replaceAll(/\s+/g, '-');
    }
    this._appName = value;
  }

  /**
   * procId
   *
   * Get or Set the process id (PID)
   *
   * @type {number}
   */
  get procId(): number | undefined {
    return this._procId;
  }

  set procId(value: number | '-' | undefined) {
    if (value === '-') {
      value = undefined;
    }
    this._procId = value;
  }

  /**
   * host
   *
   * Get/Set the host
   *
   * @type {string}
   */
  get hostName(): string | undefined {
    return this._hostName;
  }

  set hostName(value: string | '-' | undefined) {
    if (value === '-') {
      value = undefined;
    } else if (value && value.match(/\s+/)) {
      // replace space with -
      value = value.replaceAll(/\s+/g, '-');
    }
    this._hostName = value;
  }

  /**
   * dateTime
   *
   * get/set the Date Time
   *
   * @type {Date}
   */
  get dateTime(): Date {
    return this._dateTime;
  }

  set dateTime(value: Date) {
    this._dateTime = value;
  }

  /**
   * prival
   *
   * Gets the PRI value. PRI Value is caluclated using formulae: Facility * 8 + Severity
   * PRI value must be between 0 and 191
   *
   * @type {number}
   */
  get prival(): number {
    return this.facility * 8 + this.severity;
  }

  set prival(value: number) {
    if (value < 0 || value > 191) {
      throw new Error(
        `Invalid PRI value ${value}. PRI value must be between 0 and 191`,
      );
    }
    this.facility = value >> 3;
    this.severity = value & 7;
  }
  //#endregion Getters and Setter

  //#region Structured Data
  /**
   * setStructuredData
   *
   * Set a structured data entry
   *
   * @param id string The Structured Data identifier (SDID) example [ABC@1234 key="value"] - here ABC@1234 is the SDID
   * @param data StructuredData The key value entry
   */
  setStructuredData(id: string, data: StructuredData) {
    this._structuredData.set(id, data);
  }

  /**
   * getStructuredData
   *
   * Returns the structured data set basis the SDID
   *
   * @param id string The SDID of which the data is required
   * @returns StructuredData The key value entry
   */
  getStructuredData(id: string): StructuredData | undefined {
    if (this._structuredData.has(id)) {
      return this._structuredData.get(id);
    }
  }

  /**
   * getAllStructuredData
   *
   * Returns a Map of all structured data defined
   *
   * @returns Map<string, StructuredData> Returns all defined structured data
   */
  getAllStructuredData(): Map<string, StructuredData> {
    return this._structuredData;
  }

  /**
   * unsetStructuredData
   *
   * Unset/Delete the structured data belonging to a particular SDID
   *
   * @param id string The SDID which needs to be unset/deleted
   */
  unsetStructuredData(id: string) {
    if (this._structuredData.has(id)) {
      this._structuredData.delete(id);
    }
  }

  /**
   * unsetAllStructuredData
   *
   * Deletes all structured data
   */
  unsetAllStructuredData() {
    this._structuredData.clear();
  }

  /**
   * hasStructuredData
   *
   * Checks if SDID is defined (data can be blank also)
   *
   * @param id string The SDID to check
   * @returns boolean True if SDID is found, else false
   */
  hasStructuredData(id: string): boolean {
    return this._structuredData.has(id);
  }
  /**
   * hasAnyStructuredData
   *
   * Checkes if any Structured Data is defined
   *
   * @returns boolean True if there is atleast 1 SDID defined
   */
  hasAnyStructuredData(): boolean {
    return (this._structuredData.size >= 0);
  }

  //#endregion Structured Data

  /**
   * toString
   * Output the log message in standard syslog format. It defaults to RFC5424 format. The output can
   * be customised by using below "variables":
   * {prival} - The PRI Value
   * {version} - Syslog version, always set to 1
   * {dateTime} - ISO standard date time (GMT timezone)
   * {hostName} - The host name
   * {appName} - The application name
   * {procId} - The PID
   * {msgId} - The Message ID (by default a unique id is generated)
   * {message} - The log message
   * {severityName} - Severity Name as per LogSeverities
   * {facilityName} - Facility Name as per LogFacilities
   * {structuredData} - Structured data as per RFC5424
   *
   * @param format string The format to which output the log message. Defaults to RFC5424
   * @returns string
   */
  toString(format = Formats.RFC5424) {
    const version = this.version || '1',
      prival = String(this.prival),
      severity = String(this.severity),
      severityName = this.severityName,
      facility = String(this.facility),
      facilityName = this.facilityName,
      appName = this.appName || '-',
      procId = String(this.procId || '-'),
      msgId = this.msgId || '-',
      dateISO = this.dateTime.toISOString(),
      dateBSD = this.dateTime.toDateString() + ' ' +
        this.dateTime.toTimeString(),
      host = this.hostName || '-',
      message = this.message || '';
    let sd = '-';
    //#region Structured Data
    if (this._structuredData.size > 0) {
      sd = '';
      this._structuredData.forEach((data, id) => {
        const sdDataKeys: Array<string> = [];
        Object.entries(data).forEach(([key, value]) => {
          sdDataKeys.push(`${key}="${value}"`);
        });
        sd += `[${id} ${sdDataKeys.join(' ')}]`;
      });
    }
    //#endregion Structured Data
    return format.replaceAll(/{([^\s}]+)}/g, (match, name): string => {
      switch (name.trim().toLowerCase()) {
        case 'prival':
          return prival;
        case 'severity':
          return severity;
        case 'severityname':
          return severityName;
        case 'facility':
          return facility;
        case 'facilityname':
          return facilityName;
        case 'version':
          return version;
        case 'datetime':
        case 'datetimeiso':
          return dateISO;
        case 'datetimebsd':
          return dateBSD;
        case 'hostname':
        case 'host':
          return host;
        case 'appname':
          return appName;
        case 'procid':
          return procId;
        case 'msgid':
          return msgId;
        case 'message':
          return message;
        case 'structureddata':
          return sd;
        default:
          return match;
      }
    });
  }

  /**
   * toJSON
   *
   * Returns the syslog object as JSON data
   *
   * @returns SyslogObject JSON representation
   */
  public toJSON(): SyslogObject {
    const obj: SyslogObject = {
      version: '1',
      pri: this.prival,
      dateTime: this.dateTime,
      severity: this.severity,
      facility: this.facility,
      hostName: this.hostName,
      appName: this.appName,
      procId: this.procId,
      structuredData: this._structuredData,
      msgId: this.msgId,
      message: this.message || '',
    };
    return obj;
  }

  /**
   * serialize
   *
   * Alias for toJSON
   *
   * @returns SyslogObject
   */
  public serialize(): Partial<SyslogObject> {
    return this.toJSON();
  }

  /**
   * parse
   * Parses a log entry and tries to gather as much information as possible into the proper
   * Syslog structure
   *
   * @static
   * @param log string Raw log entry to parse into Syslog object
   * @returns Syslog Instance of Syslog class with the information from log entry
   */
  static parse(log: string): Syslog {
    const logObj = new Syslog(),
      BSDMatch = log.match(Patterns.RFC3164),
      RFCMatch = log.match(Patterns.RFC5424);
    if (RFCMatch) {
      logObj.prival = parseInt(RFCMatch[1]);
      logObj.dateTime = new Date(Date.parse(RFCMatch[2].trim()));
      logObj.hostName = RFCMatch[3];
      logObj.appName = RFCMatch[4];
      logObj.procId = (RFCMatch[5] === '-')
        ? RFCMatch[5]
        : parseInt(RFCMatch[5]);
      logObj.msgId = RFCMatch[6];
      // process structuredData & message
      let structAndMessage = log.substring(RFCMatch[0].length);
      if (structAndMessage.match(Patterns.STRUCT)) {
        // console.log(structAndMessage.match(regExp.STRUCT));
        const structData = structAndMessage.matchAll(Patterns.STRUCT);
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
            logObj.setStructuredData(structIdLookup[1].trim(), s);
            // console.log(s);
          } else {
            throw new Error(`Malformed structured data received: ${struct}`);
          }
        }
        if (structAndMessage.length > 0) {
          logObj.message = structAndMessage;
        }
      }
    } else if (BSDMatch) {
      logObj.prival = parseInt(BSDMatch[2]);
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
  }

  /**
   * fromJSON
   *
   * Initialize a Syslog object with the data from previously serialized Syslog Object
   *
   * @param data Partial<SyslogObject> The object from which to load
   * @static
   */
  public static fromJSON(data: Partial<SyslogObject>): Syslog {
    const obj = new Syslog();
    if (data.pri) {
      obj.prival = data.pri;
    }
    if (data.severity) {
      obj.severity = data.severity;
    }
    if (data.facility) {
      obj.facility = data.facility;
    }
    if (data.dateTime) {
      obj.dateTime = data.dateTime;
    }
    if (data.hostName) {
      obj.hostName = data.hostName;
    }
    if (data.appName) {
      obj.appName = data.appName;
    }
    if (data.procId) {
      obj.procId = data.procId;
    }
    if (data.structuredData) {
      obj._structuredData = data.structuredData;
    }
    if (data.msgId) {
      obj.msgId = data.msgId;
    }
    if (data.message) {
      obj.message = data.message;
    }
    return obj;
  }
}
