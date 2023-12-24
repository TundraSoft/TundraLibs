import { RemoteServerConnectionOptions } from '../Options.ts';

export type MariaConnectionOptions = RemoteServerConnectionOptions & {
  poolSize?: number;
  connectionTimeout?: number;
  idleTimeout?: number;
  tls?: {
    sslMode: 'disabled' | 'verify_identity';
    caCerts?: string[];
  };
};
