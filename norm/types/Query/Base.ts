export type BaseQuery<
  M extends Record<string, unknown> = Record<string, unknown>,
> = {
  source: string[];
  columns: Record<string, string>;
};
