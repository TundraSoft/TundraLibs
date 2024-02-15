import type { Dialects } from '../Dialects.ts';

export type ClientOptions = {
  dialect: Dialects;
  encryptionKey?: string;
  slowQueryThreshold?: number;
};
