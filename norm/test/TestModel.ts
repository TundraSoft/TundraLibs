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
      dataType: DataTypes.SERIAL,
      isPrimary: true,
    },
    UId: {
      name: "uid",
      dataType: DataTypes.UUID,
      validator: Guardian.string().uuid(),
      insertDefault: "UUID",
    },
    Name: {
      dataType: DataTypes.VARCHAR,
      validator: Guardian.string().max(255),
      uniqueKey: new Set(["name_email"]),
    },
    Email: {
      dataType: DataTypes.VARCHAR,
      validator: Guardian.string().email(),
      uniqueKey: new Set(["name_email"]),
    },
    Status: {
      dataType: DataTypes.BOOLEAN,
      insertDefault: true,
      updateDefault: false,
    },
    hasCrypto: {
      dataType: DataTypes.BOOLEAN,
      isNullable: true,
    },
    CreatedDate: {
      dataType: DataTypes.TIMESTAMP,
      validator: Guardian.date(),
      isNullable: false,
      insertDefault: "CURRENT_TIMESTAMP",
    },
  },
  pageSize: 10,
} as const;

export const TestModel = new Model(TestDefinition);

export type TestType = ModelType<typeof TestDefinition>;
