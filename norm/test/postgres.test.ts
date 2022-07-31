import { assertEquals } from "../../dev_dependencies.ts";
// import { path } from "../../dependencies.ts";
import { Guardian } from "../../guardian/mod.ts";
import { Database } from "../Database.ts";
import { Model } from "../Model.ts";
import {
  // CountQueryOptions,
  DataTypes,
  // SelectQueryOptions,
} from "../types/mod.ts";
import type { Filters, ModelType } from "../types/mod.ts";

await Database.load("postgres", {
  dialect: "POSTGRES",
  host: "localhost",
  user: "postgres",
  password: "postgres",
  database: "postgres",
  // tls: {
  //   enabled: true,
  // },
});
const db = Database.get("postgres");
// db.createTable({

// })

type cityModel = {
  id: number;
  name: string;
  countrycode: string;
  district: string;
  population: number;
};

Deno.test({
  name: "[module='norm' dialect='postgres'] Test connection to DB",
  async fn() {
    await db.connect();
  },
});

// Deno.test({
//   name: "[module='norm' dialect='postgres'] Test count query",
//   async fn() {
//     const result = await db.count({
//       table: "city",
//       columns: {
//         name: "name",
//       },
//     } as CountQueryOptions<cityModel>);
//     assertEquals(Number(result.totalRows), 4079);
//   },
// });

// Deno.test({
//   name: "[module='norm' dialect='postgres'] Test count query with filters",
//   async fn() {
//     const result = await db.count({
//       table: "city",
//       columns: {
//         name: "name",
//         district: "district",
//       },
//       filters: {
//         district: "Karnataka",
//       },
//     } as CountQueryOptions<cityModel>);
//     assertEquals(Number(result.totalRows), 17);
//   },
// });

// Deno.test({
//   name: "[module='norm' dialect='postgres'] Test selection with sorting",
//   async fn() {
//     const result = await db.select({
//       table: "city",
//       columns: {
//         name: "name",
//         population: "population",
//       },
//       sort: { population: "DESC" },
//     } as SelectQueryOptions<cityModel>);
//     assertEquals(Number(result.totalRows), 4079);
//     if (result && result.rows && result.rows.length > 0) {
//       assertEquals(result.rows[0].population, 10500000);
//     }
//   },
// });

// Deno.test({
//   name: "[module='norm' dialect='postgres'] Test pagination functionality with select",
//   async fn() {
//     const result = await db.select({
//       table: "city",
//       columns: {
//         name: "name",
//         population: "population",
//       },
//       sort: { population: "DESC" },
//       paging: { size: 10, page: 2 },
//     } as SelectQueryOptions<cityModel>);
//     assertEquals(Number(result.totalRows), 4079);
//     if (result && result.rows && result.rows.length > 0) {
//       assertEquals(result.rows[0].name, "Tokyo");
//     }
//   },
// });

// Deno.test({
//   name: "[module='norm' dialect='postgres'] Test table describe functionality",
//   async fn() {
//     const result = await db.getTableDefinition("city");
//     assertEquals(result.columns.name.name, "name");
//     assertEquals(result.columns.id.isPrimary, true);
//     assertEquals(
//       result.columns.district.uniqueKey &&
//         result.columns.district.uniqueKey.has("city_unique"),
//       true,
//     );
//     assertEquals(result.columns.countrycode.length, 3);
//     assertEquals(result.columns.population.dataType, "INTEGER");
//   },
// });

// await db.close();

const WaitlistModelDefinition = {
  name: "WaitList",
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
      uniqueKey: new Set(["mobile"]),
      validator: Guardian.string().mobile(),
      relatesTo: {
        mobileType: "id",
      },
    },
    name: {
      dataType: DataTypes.VARCHAR,
      validator: Guardian.string().min(3),
      uniqueKey: new Set(["name_email"]),
    },
    email: {
      dataType: DataTypes.VARCHAR,
      validator: Guardian.string().email(),
      uniqueKey: new Set(["name_email"]),
    },
    hasCrypto: {
      dataType: DataTypes.BOOLEAN,
      isNullable: true,
      validator: Guardian.boolean().optional(),
    },
    createdDate: {
      dataType: DataTypes.TIMESTAMP,
      validator: Guardian.date(),
    },
  },
  pageSize: 5,
} as const;

type Waitlist = ModelType<typeof WaitlistModelDefinition>;

const WaitlistModel = new Model(WaitlistModelDefinition);

// Deno.test({
//   name: "[module='norm' dialect='postgres'] Test creation of schema",
//   fn(): void {

//   },
// });
await WaitlistModel.dropTable();

Deno.test({
  name: "[module='norm' dialect='postgres'] Test creation of table",
  async fn(): Promise<void> {
    await WaitlistModel.createTable();
  },
});

Deno.test({
  name: "[module='norm' dialect='postgres'] Insertion into table",
  async fn(): Promise<void> {
    const data: Array<Waitlist> = [];
    for (let i = 0; i < 100; i++) {
      data.push({
        id: i,
        mobile: "9" + Math.floor(Math.random() * 1000000000),
        email: "testemail" + i + "@gmail.com",
        name: "testname" + i,
        hasCrypto: (Math.random() >= 0.5),
        createdDate: new Date(),
      });
    }
    const result = await WaitlistModel.insert(data);
    assertEquals(100, result.totalRows);
    // Check randomly if data matches
    if (result.rows) {
      for (let i = 0; i < 10; i++) {
        const id = Math.floor(Math.random() * 100);
        assertEquals(data[id].mobile, result.rows[id].mobile);
      }
    }
  },
});

Deno.test({
  name: "[module='norm' dialect='postgres'] Selection from table",
  async fn(): Promise<void> {
    const sel = await WaitlistModel.select();
    assertEquals(
      WaitlistModelDefinition.pageSize.toString(),
      sel.paging?.size.toString(),
    );
    assertEquals("100", sel.totalRows.toString());
  },
});

Deno.test({
  name: "[module='norm' dialect='postgres'] Update single row",
  async fn(): Promise<void> {
    const updFilter: Filters<Waitlist> = {
      id: {
        $eq: Math.floor(Math.random() * 100),
      },
    };
    const update: Partial<Waitlist> = {
      name: "newName1",
    };
    const upd = await WaitlistModel.update(update, updFilter);
    assertEquals("1", upd.totalRows.toString());
    if (upd.rows) {
      assertEquals("newName1", upd.rows[0].name);
    }
  },
});

Deno.test({
  name: "[module='norm' dialect='postgres'] Update multiple rows",
  async fn(): Promise<void> {
    const updFilter: Filters<Waitlist> = {
      hasCrypto: {
        $eq: false,
      },
    };
    const update: Partial<Waitlist> = {
      name: "noCryptoName",
    };
    const upd = await WaitlistModel.update(update, updFilter);
    if (upd.rows) {
      assertEquals("noCryptoName", upd.rows[0].name);
    }
  },
});

Deno.test({
  name: "[module='norm' dialect='postgres'] Delete single row",
  async fn(): Promise<void> {
    const delFilter: Filters<Waitlist> = {
      id: {
        $eq: Math.floor(Math.random() * 100),
      },
    };
    const del = await WaitlistModel.delete(delFilter);
    assertEquals("1", del.totalRows.toString());
    // check if it exists
    const sel = await WaitlistModel.select(delFilter);
    assertEquals("0", sel.totalRows.toString());
  },
});

Deno.test({
  name: "[module='norm' dialect='postgres'] Delete multiple rows",
  async fn(): Promise<void> {
    const delFilter: Filters<Waitlist> = {
      name: {
        $eq: "noCryptoName",
      },
    };
    const cnt = await WaitlistModel.count(delFilter);
    const del = await WaitlistModel.delete(delFilter);
    assertEquals(cnt.totalRows.toString(), del.totalRows.toString());
    // check if it exists
    const sel = await WaitlistModel.select(delFilter);
    assertEquals("0", sel.totalRows.toString());
  },
});

Deno.test({
  name: "[module='norm' dialect='postgres'] Truncate table",
  async fn(): Promise<void> {
    const _del = await WaitlistModel.truncate();
    const sel = await WaitlistModel.count();
    assertEquals("0", sel.totalRows.toString());
  },
});

Deno.test({
  name: "[module='norm' dialect='postgres'] Drop table",
  async fn(): Promise<void> {
    await WaitlistModel.dropTable();
  },
});

// // Deno.test({
// //   name: "[module='norm' dialect='postgres'] Drop schema",
// //   async fn(): Promise<void> {
// //   },
// // });
