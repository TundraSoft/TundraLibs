import { DataTypes, ModelType } from "../types/mod.ts";
import { Guardian } from "../../guardian/mod.ts";
import { Model } from "../Model.ts";

const CityModelDefinition = {
  name: "CityModel",
  connection: "default",
  table: "City",
  columns: {
    Id: {
      type: DataTypes.SERIAL,
    },
    Name: {
      type: DataTypes.VARCHAR,
      validator: Guardian.string().max(255),
    },
    CountryCode: {
      type: DataTypes.VARCHAR,
      length: 3,
      validator: Guardian.string().max(3),
    },
    District: {
      type: DataTypes.TEXT,
    },
    Population: {
      type: DataTypes.BIGINT,
    },
  },
  primaryKeys: new Set(["Id"]),
  uniqueKeys: {
    "name": new Set(["Name", "CountryCode", "District"]),
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
