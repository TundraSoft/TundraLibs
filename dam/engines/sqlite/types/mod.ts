import type { EngineOptions } from '../../../types/mod.ts';

export type SQLiteEngineOptions = EngineOptions & {
  engine: 'SQLITE';
  type: 'MEMORY' | 'FILE';
  storagePath?: string;
};
