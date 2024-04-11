import { Severities } from '../../syslog/mod.ts';

export type LogObject = {
  appName: string;
  severity: Severities;
  message: string;
  params?: Record<string, unknown>;
  timestamp: Date;
  // Identify from where this came from
  source?: string;
};
