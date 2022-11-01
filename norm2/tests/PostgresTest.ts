import { DatabaseManager } from '../DatabaseManager.ts';
import { SelectQueryOptions } from '../types/mod.ts';
import { assertEquals } from "../../dev_dependencies.ts";

// Define the connection
DatabaseManager.register({
  name: 'PGTest', 
  dialect: 'POSTGRES',
  host: 'localhost',
  port: 50797,
  userName: 'postgres',
  password: 'postgrespw',
  database: 'postgres',
  poolSize: 10,
});

const DBCon = DatabaseManager.get('PGTest');
const opt: SelectQueryOptions = {
  table: "test",
  columns: {
    id: "id",
    name: "name",
  },
  paging: {
    limit: 10, 
    page: 1, 
  }, 
  sort: {
    id: "ASC",
  }
}
console.log(DBCon.generateSelectQuery(opt));

