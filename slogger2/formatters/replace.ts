import type { LogObject } from '../types/mod.ts';

export const replaceFormatter = (format: string) => {
  return (log: LogObject): string => {
    // First replace params in message
    let message = format.replaceAll(/\{message\}/g, log.message);
    // Now replace the rest then params
    if (log.params) {
      for (const key in log.params) {
        let value = log.params[key];
        if (value instanceof Date) {
          value = value.toISOString();
        } else if (typeof value === 'object') {
          value = JSON.stringify(value);
        } else {
          value = value || '';
        }
        message = message.replaceAll(`{${key}}`, value as string);
      }
    }
    message = message.replaceAll(/\{appName\}/g, log.appName);
    message = message.replaceAll(/\{severity\}/g, log.severity.toString());
    message = message.replaceAll(/\{isoDate\}/g, log.timestamp.toISOString());
    message = message.replaceAll(
      /\{timestamp\}/g,
      log.timestamp.getTime().toString(),
    );
    message = message.replaceAll(
      /\{params\}/g,
      log.params ? JSON.stringify(log.params) : '',
    );
    return message;
    //return `${log.appName}: [${log.severity} ${log.timestamp.toISOString()}] - ${log.message}`;
  };
};
