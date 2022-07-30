import {assertEquals} from "../../dev_dependencies.ts";
import {path} from "../../dependencies.ts";
import {Config} from "../../config/Config.ts";
import {Guardian} from "../../guardian/mod.ts";
import {Database} from "../Database.ts";
import {Model} from "../Model.ts";
import {
    DataTypes,
    Filters,
    ModelDefinition,
    ModelType, SelectQueryOptions,CountQueryOptions
} from "../types/mod.ts";

const basePath = path.join(
    path.dirname(path.fromFileUrl(new URL("", import.meta.url))),
    "configs",
);


await Config.load("database", basePath)
await Database.load("default", {
    dialect: "POSTGRES",
    host: Config.get("database", "default", "host"),
    user: Config.get("database", "default", "username"),
    password: Config.get("database", "default", "password"),
    database: Config.get("database", "default", "database"),
    tls: {
        enabled: true,
    },
});
const db = Database.get("default")

type cityModel = {
    id: number,
    name: string,
    countrycode: string,
    district: string,
    population: number
}

Deno.test({
    name: "pgConnectionTest",
    async fn() {
        await db.connect();
        await db.close();
    }
})

Deno.test({
    name: "pgRowCountTest",
    async fn() {
        const result = await db.count({
            table: "city",
            columns: {
                name: "name"
            }
        } as CountQueryOptions<cityModel>);
        assertEquals(result.totalRows, 4079n)
        await db.close();
    }
})

Deno.test({
    name: "pgFilterRowCountTest",
    async fn() {
        const result = await db.count({
            table: "city",
            columns: {
                name: "name",
                district: "district"
            },
            filters: {
                district: "Karnataka"
            }
        } as CountQueryOptions<cityModel>);
        assertEquals(result.totalRows, 17n)
        await db.close();
    }
})

Deno.test({
    name: "pgSortTest",
    async fn() {
        const result = await db.select({
            table: "city",
            columns: {
                name: "name",
                population: "population",
            },
            sort: {population: "DESC"},
        } as SelectQueryOptions<cityModel>);
        assertEquals(result.totalRows, 4079)
        if (result && result.rows && result.rows.length > 0) {
            assertEquals(result.rows[0].population, 10500000)
        }
        await db.close();
    }
})

Deno.test({
    name: "pgPaginationTest",
    async fn() {
        const result = await db.select({
            table: "city",
            columns: {
                name: "name",
                population: "population",
            },
            sort: {population: "DESC"},
            paging: {size: 10, page: 2}
        } as SelectQueryOptions<cityModel>);
        assertEquals(result.totalRows, 4079n)
        if (result && result.rows && result.rows.length > 0) {
            assertEquals(result.rows[0].name, "Tokyo")
        }
        await db.close();
    }
})

Deno.test({
    name: "pgDescribeTest",
    async fn() {
        const result = await db.getTableDefinition("city");
        assertEquals(result.length, 5)
        assertEquals(result[0].isPrimary, true)
        assertEquals(result[1].uniqueKey, "city_unique")
        assertEquals(result[2].length, 3)
        assertEquals(result[3].name, "district")
        assertEquals(result[4].dataType, "INTEGER")
        await db.close();
    }
})

const WaitlistModelDefinition: ModelDefinition = {
  connection: "default",
  schema: "public",
  table: "waitlist",
  columns: {
    id: {
      dataType: DataTypes.SERIAL,
      isPrimary: true,
      validator: Guardian.number().min(1),
    },
    mobile: {
      dataType: DataTypes.VARCHAR,
      uniqueKey: "mobile",
      validator: Guardian.string().mobile(),
    },
    name: {
      dataType: DataTypes.VARCHAR,
      validator: Guardian.string().min(3),
    },
    email: {
      dataType: DataTypes.VARCHAR,
      validator: Guardian.string().email(),
      uniqueKey: "email",
    },
    hasCrypto: {
      dataType: DataTypes.BOOLEAN,
      validator: Guardian.boolean(),
    },
    createdDate: {
      dataType: DataTypes.TIMESTAMP,
      validator: Guardian.date(),
    },
  },
};

type Waitlist = ModelType<typeof WaitlistModelDefinition>;

const WaitlistModel = new Model(WaitlistModelDefinition);
// WaitlistModel.create();
const op = await WaitlistModel.select({
  id: {
    $nin: [1, 2, 3],
  },
} as Filters<Waitlist>);

console.log(op);

// const model: ModelDefinition = {
//   connection: "default",
//   schema: "public",
//   table: "dummy",
//   columns: {
//     id: {
//       name: 'id',
//       dataType: 'INTEGER',
//       isNullable: false,
//       isPrimary: true,
//     },
//     name: {
//       dataType: 'VARCHAR',
//       isNullable: false,
//     },
//     email: {
//       dataType: 'VARCHAR',
//       isNullable: false,
//     }
//   }
// }

// // const M = new Model(model);
// // const sel = await M.select();
// // console.log(sel);
// const db = Database.get("default");
// await db.connect();
// db.createTable({
//   schema: "public",
//   table: "testTable",
//   dropCreate: false,
//   backupCreate: false,
//   columns: {
//     id: {
//       type: DataTypes.INTEGER,
//       isNullable: false,
//       isPrimary: true,
//     },
//     name: {
//       type: DataTypes.VARCHAR,
//       isNullable: false,
//     },
//     email: {
//       type: DataTypes.VARCHAR,
//       isNullable: false,
//     }
//   }
// });
// // const op = await db.query("SELECT * FROM information_schema.tables");
// // console.log(op);
// // const res = await db.query<{N: number}>("SELECT 1 as N FROM information_schema.tables");
//
