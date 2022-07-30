import { assertEquals } from "../../dev_dependencies.ts";
import { Guardian } from "../../guardian/mod.ts";
import { Database } from "../Database.ts";
import { Model } from "../Model.ts";
import { DataTypes } from "../types/mod.ts";
import type { Filters, ModelType } from "../types/mod.ts";

await Database.load("sqlite", {
  dialect: "SQLITE",
  memory: true,
});

const WaitlistModelDefinition = {
  connection: "sqlite",
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
      uniqueKey: "name_email",
    },
    email: {
      dataType: DataTypes.VARCHAR,
      validator: Guardian.string().email(),
      uniqueKey: "name_email",
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
//   name: "[module='norm' dialect='sqlite'] Test creation of schema",
//   fn(): void {

//   },
// });
await WaitlistModel.dropTable();

Deno.test({
  name: "[module='norm' dialect='sqlite'] Test creation of table",
  async fn(): Promise<void> {
    await WaitlistModel.createTable();
  },
});

Deno.test({
  name: "[module='norm' dialect='sqlite'] Insertion into table",
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
  name: "[module='norm' dialect='sqlite'] Selection from table",
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
  name: "[module='norm' dialect='sqlite'] Update single row",
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
  name: "[module='norm' dialect='sqlite'] Update multiple rows",
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
  name: "[module='norm' dialect='sqlite'] Delete single row",
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
  name: "[module='norm' dialect='sqlite'] Delete multiple rows",
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
  name: "[module='norm' dialect='sqlite'] Truncate table",
  async fn(): Promise<void> {
    const _del = await WaitlistModel.truncate();
    const sel = await WaitlistModel.count();
    assertEquals("0", sel.totalRows.toString());
  },
});

Deno.test({
  name: "[module='norm' dialect='sqlite'] Drop table",
  async fn(): Promise<void> {
    await WaitlistModel.dropTable();
  },
});

// // Deno.test({
// //   name: "[module='norm' dialect='sqlite'] Drop schema",
// //   async fn(): Promise<void> {
// //   },
// // });
