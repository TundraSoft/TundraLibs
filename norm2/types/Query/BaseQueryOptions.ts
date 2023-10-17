import { FlattenEntity } from "../utils/mod.ts";

export type BaseQueryOptions<Entity extends Record<string, unknown> = Record<string, unknown>, Y = FlattenEntity<Entity>> = {
  table: string;
  schema?: string;
  columns: Array<keyof Y>;
}