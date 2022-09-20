import { assertEquals } from "../../dev_dependencies.ts";
import { Database } from "../Database.ts";
import { Filters } from "../mod.ts";
import { TestModel, TestType } from "./TestModel.ts";

await Database.load("default", {
  dialect: "SQLITE",
  memory: true,
});

// await TestModel.createTable();
Deno.test({
  name: "[module='norm' dialect='sqlite'] Test creation of table",
  async fn(): Promise<void> {
    await TestModel.createTable();
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "[module='norm' dialect='sqlite'] Insertion into table",
  async fn(): Promise<void> {
    const data: Array<Partial<TestType>> = [];
    for (let i = 0; i < 100; i++) {
      data.push({
        Name: `Test User ${i}`,
        Email: `Testuser${i}@gmail.com`,
        hasCrypto: (Math.random() >= 0.5),
      });
    }
    const result = await TestModel.insert(data);
    assertEquals(result.totalRows, 100);
    // Check randomly if data matches
    if (result.rows) {
      for (let i = 0; i < 10; i++) {
        const id = Math.floor(Math.random() * 100);
        assertEquals(data[id].Name, result.rows[id].Name);
      }
    }
  },
});

Deno.test({
  name: "[module='norm' dialect='sqlite'] Selection from table",
  async fn(): Promise<void> {
    const sel = await TestModel.select();
    assertEquals(
      sel.paging?.limit.toString(),
      "10",
    );
    assertEquals(sel.totalRows.toString(), "100");
  },
});

Deno.test({
  name: "[module='norm' dialect='sqlite'] Update single row",
  async fn(): Promise<void> {
    const updFilter: Filters<TestType> = {
      Id: {
        $eq: Math.floor(Math.random() * 100),
      },
    };
    const update: Partial<TestType> = {
      Name: "newName1",
    };
    const upd = await TestModel.update(update, updFilter);
    assertEquals(upd.totalRows.toString(), "1");
    if (upd.rows) {
      assertEquals(upd.rows[0].Name, "newName1");
    }
  },
});

Deno.test({
  name: "[module='norm' dialect='sqlite'] Update multiple rows",
  async fn(): Promise<void> {
    const updFilter: Filters<TestType> = {
      hasCrypto: {
        $eq: false,
      },
    };
    const update: Partial<TestType> = {
      Status: false,
    };
    const upd = await TestModel.update(update, updFilter);
    if (upd.rows) {
      // assertEquals(upd.rows[0].Status, false);
    }
  },
});

Deno.test({
  name: "[module='norm' dialect='sqlite'] Delete single row",
  async fn(): Promise<void> {
    const delFilter: Filters<TestType> = {
      Id: {
        $eq: Math.floor(Math.random() * 100),
      },
    };
    const del = await TestModel.delete(delFilter);
    assertEquals(del.totalRows.toString(), "1");
    // check if it exists
    const sel = await TestModel.select(delFilter);
    assertEquals(sel.totalRows.toString(), "0");
  },
});

Deno.test({
  name: "[module='norm' dialect='sqlite'] Delete multiple rows",
  async fn(): Promise<void> {
    const delFilter: Filters<TestType> = {
      Name: {
        $eq: "noCryptoName",
      },
    };
    const cnt = await TestModel.count(delFilter);
    const del = await TestModel.delete(delFilter);
    assertEquals(cnt.totalRows.toString(), del.totalRows.toString());
    // check if it exists
    const sel = await TestModel.select(delFilter);
    assertEquals("0", sel.totalRows.toString());
  },
});

Deno.test({
  name: "[module='norm' dialect='sqlite'] Truncate table",
  async fn(): Promise<void> {
    const _del = await TestModel.truncate();
    const sel = await TestModel.count();
    assertEquals("0", sel.totalRows.toString());
  },
});

Deno.test({
  name: "[module='norm' dialect='sqlite'] Drop table",
  async fn(): Promise<void> {
    await TestModel.dropTable();
  },
});
