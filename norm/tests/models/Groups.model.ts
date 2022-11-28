export default {
  name: "Groups",
  table: "Groups",
  schema: "SuperSchema",
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
    Enabled: {
      type: "BOOLEAN",
      isNullable: true,
    },
  },
  primaryKeys: new Set(["Id"]),
  uniqueKeys: {
    "name": new Set(["Name"]),
  },
} as const;