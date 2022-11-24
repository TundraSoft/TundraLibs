export const consolidated = {
  "Users": {
    "name": "Users",
    "table": "Users",
    "schema": "public",
    "connection": "default",
    "columns": {
      "id": {
        "type": "INTEGER"
      },
      "name": {
        "type": "VARCHAR",
        "isNullable": true
      },
      "email": {
        "type": "VARCHAR",
        "isNullable": true
      }
    }
  },
  "Groups": {
    "name": "Groups",
    "table": "Groups",
    "schema": "public",
    "connection": "default",
    "columns": {
      "id": {
        "type": "INTEGER"
      },
      "name": {
        "type": "VARCHAR",
        "isNullable": true
      }
    },
    "primaryKeys": [
      "id"
    ]
  }
}