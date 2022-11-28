export default {
  name: "UserGroups",
  table: "UserGroups",
  schema: "DuperSchema",
  connection: "default",
  columns: {
    UserId: {
      type: "INTEGER",
    },
    GroupId: {
      type: "INTEGER",
    },
  },
  uniqueKeys: {
    "user_group": new Set(["UserId", "GroupId"]),
  },
  foreignKeys: {
    "user": {
      model: "User",
      relationShip: {
        UserId: "Id",
      },
    },
    "group": {
      model: "Groups",
      relationShip: {
        GroupId: "Id",
      },
    },
  },
} as const;
