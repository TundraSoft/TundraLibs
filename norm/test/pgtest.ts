import { Guardian } from "../../guardian/mod.ts";
import { Database } from "../Database.ts";
import { Model } from "../Model.ts";
import {
  DataTypes,
  Filters,
  ModelDefinition,
  ModelType,
} from "../types/mod.ts";

await Database.load("default", {
  dialect: "POSTGRES",
  host: "****",
  user: "****",
  password: "****",
  database: "testdb",
  tls: {
    enabled: true,
  },
});

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
