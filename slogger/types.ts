import type {
  LogFacilities,
  LogSeverities,
  SyslogObject,
} from "../syslog/mod.ts";

export type LogConfig = {
  appName: string;
  hostName: string;
  pid: number;
  severity: LogSeverities;
  facility: LogFacilities;
};

export type HandlerType =
  | "CONSOLE"
  | "BLACKHOLE"
  | "FILE"
  | "POST"
  | "SYSLOG"
  | "CUSTOM";

export type HandlerOptions = {
  type: HandlerType;
  appName: string;
  hostName: string;
  severity: LogSeverities;
  format?: string;
};

export type ConsoleHandlerOptions = HandlerOptions & {
  colorFormat: boolean;
};

export type FileHandlerOptions = HandlerOptions & {
  path: string;
  fileName: string;
  buferSize: number;
  rotate?: number;
};

export type SyslogOptions = HandlerOptions & {
  serverHost: string;
  serverPort: number;
  serverType: "udp"; // TCP we will support later
  structureData: unknown;
};

export type POSTHandlerOptions = HandlerOptions & {
  url: string;
  headers?: Headers | (() => Headers);
  body?: (log: SyslogObject) => FormData;
};

export type CustomHandlerOptions = HandlerOptions & {
  callback: (log: string) => void;
};
