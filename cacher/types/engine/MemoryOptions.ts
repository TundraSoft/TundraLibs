import type { CacherOptions } from '../Options.ts';

export type MemoryOptions = CacherOptions & {
  engine: 'MEMORY';
};
