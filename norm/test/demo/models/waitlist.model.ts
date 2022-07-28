import { ModelDefinition, DataTypes } from "../../../types/mod.ts";
import { Guardian } from "../../../../guardian/mod.ts";
import '../db/db.ts'
import { Model } from "../../../Model.ts";


const WaitlistModelDefinition: ModelDefinition = {
  connection: "testdb",
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

const WaitlistModel = new Model(WaitlistModelDefinition);

export type { ModelDefinition };
export { WaitlistModel };
