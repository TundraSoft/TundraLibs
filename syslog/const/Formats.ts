export enum Formats {
  RFC5424 =
    '<{prival}>{version} {dateTimeISO} {host} {appName} {procId} {msgId} {structuredData} {message}',
  RFC3164 = '<{prival}>{dateTimeBSD} {host} {appName}[{procId}]: {message}',
  SIMPLE = '[{severityName}-{msgId}] {dateTimeISO} {message}',
}
