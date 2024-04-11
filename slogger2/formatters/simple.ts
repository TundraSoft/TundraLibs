import type { LogObject } from '../types/mod.ts';

export const simpleFormatter = (log: LogObject): string => {
  // First replace params in message
  return `${log.appName}: [${log.severity} ${log.timestamp.toISOString()}] - ${log.message} ${
    log.params ? JSON.stringify(log.params) : ''
  }`;
};
