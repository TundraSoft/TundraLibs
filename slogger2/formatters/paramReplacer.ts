import type { LogObject } from '../types/mod.ts';

export const paramReplacerFormatter = (log: LogObject): string => {
  // First replace params in message
  let message = log.message;
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
      message = message.replace(`{${key}}`, value as string);
    }
  }
  return `${log.appName}: [${log.severity} ${log.timestamp.toISOString()}] - ${log.message}`;
};
