import { ModelDefinition } from "../types/mod.ts";
import { DataTypes } from "../types/mod.ts";

const data: Array<ModelDefinition> = [
  {
    name: "Users",
    table: "Users",
    schema: "public",
    connection: "default",
    columns: {
      id: {
        type: DataTypes.INTEGER,
      },
      name: {
        type: DataTypes.VARCHAR,
        isNullable: true,
      },
      email: {
        type: DataTypes.VARCHAR,
        isNullable: true,
      },
    },
  },
  {
    name: "Groups",
    table: "Groups",
    schema: "public",
    connection: "default",
    columns: {
      id: {
        type: DataTypes.INTEGER,
      },
      name: {
        type: DataTypes.VARCHAR,
        isNullable: true,
      },
    },
    primaryKeys: ["id"],
  },
];

export const consolidate = (
  datas: ModelDefinition[],
): Record<string, ModelDefinition> => {
  const consolidated: Record<string, ModelDefinition> = {};
  datas.forEach((data) => {
    consolidated[data.name] = data;
  });
  Deno.writeFileSync(
    "./consolidated_write.ts",
    new TextEncoder().encode(
      `export const consolidated = ${
        JSON.stringify(consolidated, undefined, "  ")
      }`,
    ),
  );
  return consolidated;
};

consolidate(data);
