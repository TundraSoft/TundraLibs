export type QueryResults<
  Entity extends Record<string, unknown> = Record<string, unknown>,
> = {
  sql: string;
  time: number;
  count: number;
  data: Entity[];
};
