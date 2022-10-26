import {
  // CountQueryOptions,
  DataTypes,
  ModelType,
  // SelectQueryOptions,
} from "../types/mod.ts";
import { Guardian } from "../../guardian/mod.ts";
import { Model } from "../Model.ts";

const TestDefinition = {
  name: "TestModel",
  connection: "default",
  table: "Test",
  columns: {
    Id: {
      type: DataTypes.SERIAL,
    },
    UId: {
      name: "uid",
      type: DataTypes.UUID,
      validator: Guardian.string().uuid(),
      insertDefault: "UUID",
    },
    Name: {
      type: DataTypes.VARCHAR,
      validator: Guardian.string().max(255),
    },
    Email: {
      type: DataTypes.VARCHAR,
      validator: Guardian.string().email(),
    },
    Status: {
      type: DataTypes.BOOLEAN,
      insertDefault: true,
      updateDefault: false,
    },
    hasCrypto: {
      type: DataTypes.BOOLEAN,
      isNullable: true,
    },
    CreatedDate: {
      type: DataTypes.TIMESTAMP,
      validator: Guardian.date(),
      isNullable: false,
      insertDefault: "CURRENT_TIMESTAMP",
    },
  },
  primaryKeys: new Set(["Id"]),
  uniqueKeys: {
    "name_email": new Set(["Name", "Email"]),
  },
  pageSize: 10,
} as const;

export const TestModel = new Model(TestDefinition);

export type TestType = ModelType<typeof TestDefinition>;
