export type AbstractCacherOptions = {
  engine: 'MEMORY' | 'REDIS';
  defaultExpiry?: number;
};
