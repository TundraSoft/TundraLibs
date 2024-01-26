export type BaseQuery<
  M extends Record<string, unknown> = Record<string, unknown>,
> = {
  type: QueryTy
  source: string[];
  columns: Record<string, string>;
};
