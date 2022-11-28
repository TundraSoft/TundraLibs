import type { ModelDefinition, ModelType } from "./Model.ts";

export type SchemaDefinition = Record<string, ModelDefinition>;

export type SchemaType<
  SchemaDefinition extends Record<string, ModelDefinition>,
> = {
  -readonly [Key in keyof SchemaDefinition]: ModelType<SchemaDefinition[Key]>;
};
