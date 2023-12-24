import { Facilities, Severities } from '../const/mod.ts';

export type StructuredData = {
  [key: string]: string;
};

export type SyslogObject = {
  version: '1';
  pri: number;
  dateTime: Date;
  severity: Severities;
  facility: Facilities;
  msgId?: string;
  hostName?: string;
  appName?: string;
  procId?: number;
  structuredData?: Map<string, StructuredData>;
  message: string;
};
