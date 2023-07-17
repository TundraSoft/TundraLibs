import type { BaseCacherOptions } from './mod.ts';

export type RedisCacherOptions = BaseCacherOptions & {
  mode: 'REDIS';
  host: string;
  port: number;
  password?: string;
  db?: number;
  tls?: boolean;
};
