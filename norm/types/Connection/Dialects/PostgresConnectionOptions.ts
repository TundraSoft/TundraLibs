import { RemoteServerConnectionOptions } from '../Options.ts';

export type PostgresConnectionOptions = RemoteServerConnectionOptions & {
  tlsOptions?: {
    enabled: boolean;
    enforce: boolean;
    certificate?: string;
  };
};
