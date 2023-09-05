export type QueryResults<Entity extends Record<string, unknown> = Record<string, unknown>> = {
  sql: string;
  count: number;
  data: Entity[]
}