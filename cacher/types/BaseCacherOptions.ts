export type BaseCacherOptions = {
  name: string;
  mode: 'MEMORY' | 'REDIS';
  defaultExpiry?: number;
};
