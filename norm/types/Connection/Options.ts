import { Dialects } from '../Dialects.ts';

export type ConnectionOptions = {
  dialect: Dialects;
  encryptionKey?: string;
};
