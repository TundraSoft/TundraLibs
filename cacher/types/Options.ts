export type CacherOptions = {
  engine: 'MEMORY' | 'REDIS';
  defaultExpiry?: number;
};
