import { Model } from "../Model.ts";
import type { FilterColumns } from "../types.ts";
import { DataTypes } from "../types.ts";
import { StringValidator } from "../../validator/mod.ts";

const testSchema = {
  table: "dummy",
  columns: {
    id: {
      name: "id",
      dataType: DataTypes.INTEGER,
      isPrimary: true,
    },
    name: {
      dataType: DataTypes.VARCHAR,
      uniqueKey: "p1",
    },
    email: {
      dataType: DataTypes.VARCHAR,
      uniqueKey: "p12",
      validator: new StringValidator().email("Invalid email address"),
    },
  },
} as const;

export type Test = FilterColumns<typeof testSchema>;
export const testModal = new Model<Test>(testSchema);

// const op = await testModal.select();
// console.log(op);

// console.log(await testModal.checkConstraints({id: 1234, name: 'test', email: 'abhinav@gmail.com'}));

const insData = JSON.parse(
  '{"id": 1234, "name": "test", "email": "abhai2k@gmail.com"}',
);
// const ins = await testModal.insert([insData])

const updData = {
  id: 123,
  name: "test",
  email: "abhai2k",
};
console.log(await testModal.update(updData, { id: 123 }));
// console.log(ins);
