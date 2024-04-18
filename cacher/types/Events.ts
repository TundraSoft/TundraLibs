export type CacherEvents = {
  ready: (name: string) => void;
  delete: (name: string, key: string) => void;
  error: (name: string, error: Error) => void;
};
