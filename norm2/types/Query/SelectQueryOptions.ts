import { FlattenEntity } from "../utils/mod.ts";
import type { BaseQueryOptions } from "./BaseQueryOptions.ts";

export type SelectQueryOptions<Entity extends Record<string, unknown> = Record<string, unknown>, Y = FlattenEntity<Entity>> = BaseQueryOptions<Entity, Y> & {
}