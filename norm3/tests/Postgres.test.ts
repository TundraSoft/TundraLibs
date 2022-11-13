import { DataTypes } from "../types/mod.ts";
import type { ModelType } from "../types/mod.ts";

const Test = {
  name: "Test",
  connection: "default",
  schema: "public",
  table: "test",
  columns: {
    id: {
      type: DataTypes.INTEGER,
      isNullable: false,
    },
    name: {
      type: DataTypes.VARCHAR,
      length: 255,
      isNullable: true,
    },
  },
  audit: {
    schema: "public",
    table: "test_audit",
  },
} as const;

export type a = ModelType<typeof Test>;

// ModelManager.registerModel(Test);
