import { RemoteServerConnectionOptions } from '../Options.ts';

export type MongoConnectionOptions = RemoteServerConnectionOptions & {
  username?: string;
  password?: string;
  ssl?: boolean;
  connectionTimeout: number;
};
