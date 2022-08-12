import { DataTypes, ModelType } from "../types/mod.ts";
import { Guardian } from "../../guardian/mod.ts";
import { Model } from "../Model.ts";

const CityModelDefinition = {
  name: "CityModel",
  connection: "default",
  table: "City",
  columns: {
    Id: {
      dataType: DataTypes.SERIAL,
      isPrimary: true,
    },
    Name: {
      dataType: DataTypes.VARCHAR,
      validator: Guardian.string().max(255),
      uniqueKey: new Set(["cu"]),
    },
    CountryCode: {
      dataType: DataTypes.VARCHAR,
      length: 3,
      validator: Guardian.string().max(3),
      uniqueKey: new Set(["cu"]),
    },
    District: {
      dataType: DataTypes.TEXT,
      uniqueKey: new Set(["cu"]),
    },
    Population: {
      dataType: DataTypes.BIGINT,
    },
  },
  pageSize: 10,
} as const;

export const CityModel = new Model(CityModelDefinition);
export type CityRawType = {
  Id: number;
  Name: string;
  Countrycode: string;
  District: string;
  Population: number;
};
export type CityModelType = ModelType<typeof CityModelDefinition>;
