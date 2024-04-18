import type { CacherOptions } from '../Options.ts';

export type RedisOptions = CacherOptions & {
  engine: 'REDIS';
  host: string;
  port: number;
  password?: string;
  db?: number;
  tls?: boolean;
};
