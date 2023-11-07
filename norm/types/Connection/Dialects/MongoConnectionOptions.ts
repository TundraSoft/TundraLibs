import { ConnectionOptions } from '../Options.ts';

export type MongoConnectionOptions = ConnectionOptions & {
  host: string;
  username: string;
  password?: string;
  port?: number;
  ssl?: boolean;
};
