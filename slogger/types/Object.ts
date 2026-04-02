import { SyslogSeverities, SyslogSeverity } from '../utils/mod.ts';

export type SlogObject = {
  id: string;
  appName: string;
  hostname: string;
  level: SyslogSeverities;
  levelName: SyslogSeverity;
  date: Date;
  timestamp: number;
  isoDate: string;
  message: string;
  context?: Record<string, unknown>;
};
