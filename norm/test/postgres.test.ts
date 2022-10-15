import { assertEquals } from "../../dev_dependencies.ts";
import { Database } from "../Database.ts";
import {
  CountQueryOptions,
  Filters,
  // Model,
  // ModelDefinition,
  // ModelType,
  SelectQueryOptions,
} from "../mod.ts";
import { TestModel, TestType } from "./TestModel.ts";
import { Sysinfo } from "../../sysinfo/mod.ts";
import { CityModel, CityRawType } from "./CityModel.ts";
import { path } from "../../dependencies.ts";

await Database.load("default", {
  dialect: "POSTGRES",
  host: await Sysinfo.getEnv("POSTGRES_HOST") || "localhost",
  user: await Sysinfo.getEnv("POSTGRES_USER") || "postgres",
  password: await Sysinfo.getEnv("POSTGRES_PASS") || "postgrespw",
  database: "postgres",
  port: await Sysinfo.getEnv("POSTGRES_PORT") || 49153,
});

// const a = Database.getModel('CityModel'),
//   b = Database.getModelDefinition('CityModel'),
//   c = a as Model<typeof b, ModelType<typeof b>>;
// const res = await c.select({
//   Id: 1
// });

Deno.test({
  name: "[module='norm' dialect='postgres'] Test creation of table",
  async fn(): Promise<void> {
    await TestModel.createTable();
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "[module='norm' dialect='postgres'] Insertion into table",
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
  name: "[module='norm' dialect='postgres'] Selection from table",
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
  name: "[module='norm' dialect='postgres'] Update single row",
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
  name: "[module='norm' dialect='postgres'] Update multiple rows",
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
      assertEquals(upd.rows[0].Status, false);
    }
  },
});

Deno.test({
  name: "[module='norm' dialect='postgres'] Delete single row",
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
  name: "[module='norm' dialect='postgres'] Delete multiple rows",
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
  name: "[module='norm' dialect='postgres'] Truncate table",
  async fn(): Promise<void> {
    const _del = await TestModel.truncate();
    const sel = await TestModel.count();
    assertEquals("0", sel.totalRows.toString());
  },
});

Deno.test({
  name: "[module='norm' dialect='postgres'] Drop table",
  async fn(): Promise<void> {
    await TestModel.dropTable();
  },
});

Deno.test({
  name: "[module='norm' dialect='postgres'] Test creation of table with seed",
  async fn(): Promise<void> {
    await CityModel.dropTable();
    await CityModel.createTable(
      undefined,
      undefined,
      path.join(
        path.dirname(path.fromFileUrl(new URL("", import.meta.url))),
        "fixtures",
        "CityData.json",
      ),
    );
    const cnt = await CityModel.count();
    assertEquals(cnt.totalRows.toString(), "50");
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

Deno.test({
  name: "[module='norm' dialect='postgres'] Test count query",
  async fn() {
    const result = await Database.get("default").count({
      table: "City",
      columns: {
        Name: "Name",
      },
    } as CountQueryOptions<CityRawType>);
    assertEquals(Number(result.totalRows), 50);
  },
});

Deno.test({
  name: "[module='norm' dialect='postgres'] Test count query with filters",
  async fn() {
    const result = await Database.get("default").count({
      table: "City",
      columns: {
        Name: "Name",
        District: "District",
      },
      filters: {
        District: "Karnataka",
      },
    } as CountQueryOptions<CityRawType>);
    assertEquals(Number(result.totalRows), 2);
  },
});

Deno.test({
  name: "[module='norm' dialect='postgres'] Test selection with sorting",
  async fn() {
    const result = await Database.get("default").select({
      table: "City",
      columns: {
        Name: "Name",
        Population: "Population",
      },
      sort: { Population: "DESC" },
    } as SelectQueryOptions<CityRawType>);
    assertEquals(Number(result.totalRows), 50);
    if (result && result.rows && result.rows.length > 0) {
      assertEquals(String(result.rows[0].Population), "10500000");
    }
  },
});

Deno.test({
  name:
    "[module='norm' dialect='postgres'] Test pagination functionality with select",
  async fn() {
    const result = await Database.get("default").select({
      table: "City",
      columns: {
        Name: "Name",
        Population: "Population",
      },
      sort: { Population: "DESC" },
      paging: { limit: 10, page: 2 },
    } as SelectQueryOptions<CityRawType>);
    assertEquals(Number(result.totalRows), 50);
    if (result && result.rows && result.rows.length > 0) {
      assertEquals(result.rows[0].Name, "Pune");
    }
  },
});

Deno.test({
  name: "[module='norm' dialect='postgres'] Test table describe functionality",
  async fn() {
    const result = await Database.get("default").getTableDefinition("City");
    assertEquals(result.columns.Name.name, "Name");
    assertEquals(result.columns.Id.isPrimary, true);
    assertEquals(
      result.columns.District.uniqueKey &&
        result.columns.District.uniqueKey.has("city_cu_unique"),
      true,
    );
    assertEquals(result.columns.CountryCode.length, 3);
    assertEquals(result.columns.Population.dataType, "BIGINT");
    await CityModel.dropTable();
  },
});
