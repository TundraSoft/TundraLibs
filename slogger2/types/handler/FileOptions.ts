import type { HandlerOptions } from './Options.ts';

export type FileHandlerOptions = HandlerOptions & {
  path: string;
  name: string; // Supports variables like {appName} etc
  maxSize?: number; // Max file size
};
