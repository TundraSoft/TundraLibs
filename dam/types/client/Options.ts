import type { Dialects } from '../Dialects.ts';

export type ClientOptions = {
  dialect: Dialects; // The SQL dialect to use
  slowQueryThreshold?: number; // In seconds
};
