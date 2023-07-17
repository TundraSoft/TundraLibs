import type { CacheSettings } from './CacheSettings.ts';

export type CacheValue<T = unknown> = Required<CacheSettings> & {
  value: T;
};
