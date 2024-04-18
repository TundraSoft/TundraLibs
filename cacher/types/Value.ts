import type { CacheSettings } from './Settings.ts';

export type CacheValue<T = unknown> = Required<CacheSettings> & {
  data: T;
};
