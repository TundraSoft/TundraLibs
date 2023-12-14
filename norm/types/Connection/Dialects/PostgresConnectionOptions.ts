import { RemoteServerConnectionOptions } from '../Options.ts';

export type PostgresConnectionOptions = RemoteServerConnectionOptions & {
  poolSize?: number;
  tlsOptions?: {
    enabled: boolean;
    enforce: boolean;
    certificate?: string;
  };
};
