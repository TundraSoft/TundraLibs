import type { HandlerOptions } from './Options.ts';
import type { LogObject } from '../LogObject.ts';

export type HTTPHandlerOptions = HandlerOptions & {
  url: string;
  header: Record<string, string>;
  method: 'POST' | 'PUT';
  send?: (data: LogObject) => Promise<void>;
};
