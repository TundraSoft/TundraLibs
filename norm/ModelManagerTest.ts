import { DataTypes } from "./types/mod.ts";
import { Guardian } from "../guardian/mod.ts";
import { ModelManager } from "./ModelManager.ts";

const CountriesDefinition = {
  name: "CountryModel",
  connection: "default",
  table: "Countries",
  schema: "Common",
  columns: {
    Id: {
      type: DataTypes.INTEGER,
    },
    Name: {
      type: DataTypes.VARCHAR,
      length: 255,
      validator: Guardian.string().max(255),
    },
    ShortCode: {
      type: DataTypes.CHAR,
      length: 2,
      validator: Guardian.string().max(2),
      disableUpdate: true,
    },
    Code: {
      type: DataTypes.CHAR,
      length: 3,
      validator: Guardian.string().max(3),
      disableUpdate: true,
    },
    CurrencyId: {
      name: "CurrencyId",
      type: DataTypes.INTEGER,
      validator: Guardian.number().integer(),
    },
    FlagImageId: {
      name: "FlagImageId",
      type: DataTypes.UUID,
      isNullable: true,
      notNullOnce: true,
      validator: Guardian.string(),
    },
  },
  primaryKeys: new Set(["Id"]),
  uniqueKeys: {
    name: new Set(["Name"]),
    shortcode: new Set(["ShortCode"]),
    code: new Set(["Code"]),
  },
  foreignKeys: {
    CurrencyImage: {
      model: "ImageModel",
      columns: {
        FlagImageId: "Id",
      },
    },
  },
  pageSize: 25,
} as const;

ModelManager.register(CountriesDefinition);

const ImageDefinition = {
  name: "ImageModel",
  connection: "default",
  table: "Images",
  schema: "Common",
  columns: {
    Id: {
      type: DataTypes.UUID,
      insertDefault: "UUID",
    },
    Name: {
      type: DataTypes.VARCHAR,
      length: 255,
      validator: Guardian.string().max(255),
    },
    OrganisationCode: {
      type: DataTypes.VARCHAR,
      length: 10,
      validator: Guardian.string().max(10),
      isNullable: true,
      notNullOnce: true,
    },
    FilePath: {
      type: DataTypes.VARCHAR,
      length: 255,
      validator: Guardian.string().max(255),
    },
    ImageType: {
      type: DataTypes.VARCHAR,
      length: 10,
      validator: Guardian.string().max(255).upperCase().oneOf([
        "SVG",
        "PNG",
        "JPG",
        "JPEG",
        "BMP",
        "GIF",
        "TIFF",
      ]),
    },
  },
  primaryKeys: new Set(["Id"]),
  uniqueKeys: {
    OrgImageName: new Set(["Name", "OrganisationCode"]),
  },
  pageSize: 25,
} as const;

ModelManager.register(ImageDefinition);

ModelManager.validateModels();

const sql = ModelManager.generateDDL({
  dialect: "POSTGRES",
  // schema: 'Common',
  // tables: ['Images'],
  seedData: {
    ImageModel: [
      { Id: "df", Name: "daf", FilePath: "df", ImageType: "SVG" },
    ],
  },
});

console.log(sql);
