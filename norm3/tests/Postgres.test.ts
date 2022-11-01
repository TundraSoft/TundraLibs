import { PostgresClient } from "../clients/PostgresClient.ts";
import { assertEquals } from "../../dev_dependencies.ts";

const workingConfig = {
    dialect: "POSTGRES",
    host: "localhost",
    port: 54842,
    userName: "postgres",
    password: "postgrespw",
    database: "postgres",
  },
  invalidDBConfig = {
    dialect: "POSTGRES",
    host: "localhost",
    port: 54842,
    userName: "postgres",
    password: "postgrespw",
    database: "postgres",
  },
  invalidUserConfig = {
    dialect: "POSTGRES",
    host: "localhost",
    port: 54842,
    userName: "postgres1",
    password: "postgrespw",
    database: "postgres",
  },
  invalidUserConfig2 = {
    dialect: "POSTGRES",
    host: "localhost",
    port: 54842,
    userName: "postgres",
    password: "postgrespw1",
    database: "postgres",
  },
  invalidHostConfig = {
    dialect: "POSTGRES",
    host: "google.com",
    port: 54842,
    userName: "postgres",
    password: "postgrespw1",
    database: "postgres",
  },
  invalidPortConfig = {
    dialect: "POSTGRES",
    host: "localhost",
    port: 54841,
    userName: "postgres",
    password: "postgrespw1",
    database: "postgres",
  };
// const client = new PostgresClient("test", {

// });

Deno.test({
  name: "[module='norm' dialect='postgres'] Test connection",
  async fn(): Promise<void> {
    await client.connect();
  },
  sanitizeResources: false,
  sanitizeOps: false,
});

// TODO - Test case for connection failure

Deno.test({
  name: '[module="norm" dialect="postgres"] Test ping',
  async fn(): Promise<void> {
    const result = await client.ping();
    assertEquals(result, true);
  },
});
