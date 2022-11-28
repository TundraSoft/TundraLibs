// import { Guardian } from "../../../../guardian/mod.ts";

export default {
  name: "Users",
  table: "Users",
  schema: "TestSchema",
  connection: "default",
  columns: {
    Id: {
      type: "INTEGER",
    },
    Name: {
      type: "VARCHAR",
      isNullable: true,
      disableUpdate: true,
    },
    Email: {
      type: "VARCHAR",
      isNullable: true,
      notNullOnce: true,
    },
  },
  primaryKeys: new Set(["Id"]),
  uniqueKeys: {
    "name_email": new Set(["Name", "Email"]),
  },
} as const;
