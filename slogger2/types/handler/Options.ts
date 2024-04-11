import { Severities } from '../../../syslog/mod.ts';
import type { LogObject } from '../LogObject.ts';

export type HandlerOptions = {
  severity: Severities;
  formatter: (log: LogObject) => string;
};
