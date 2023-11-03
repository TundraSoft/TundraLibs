import type { AbstractCacherOptions } from '../AbstractCacherOptions.ts';

export type RedisCacherOptions = AbstractCacherOptions & {
  host: string;
  port: number;
  password?: string;
  db?: number;
  tls?: boolean;
};
