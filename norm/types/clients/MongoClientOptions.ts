import { ClientOptions } from './ClientOptions.ts';

export type MongoClientOptions = ClientOptions & {
  dialect: 'MONGODB';
  port: number;
  username: string;
  password: string;
  database: string;
  ssl?: boolean;
};
