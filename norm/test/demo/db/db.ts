import { Database } from "../../../Database.ts"


await Database.load("testdb", {
  dialect: "POSTGRES", 
  host: 'localhost', 
  user: "postgres", 
  password: "1234", 
  port: 5432,
  database: "testdb", 
  tls: {
    enabled: true,
  }
});
