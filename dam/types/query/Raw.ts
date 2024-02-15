export type RawQuery = {
  type: 'RAW';
  sql: string;
  params?: Record<string, unknown>;
};
