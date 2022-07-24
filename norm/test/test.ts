import { Model } from "../Model.ts";
import type { FilterColumns, Filters } from "../types.ts";
import { DataTypes } from "../types.ts";
import Guardian from "../../guardian/mod.ts";

// console.log(`${new URL('', import.meta.url).pathname}`);

const testSchema = {
  table: "dummy",
  columns: {
    id: {
      name: "id",
      dataType: DataTypes.INTEGER,
      isPrimary: true,
      validator: Guardian.number().integer().min(1),
    },
    name: {
      dataType: DataTypes.VARCHAR,
      uniqueKey: "p1",
      validator: Guardian.string().min(3),
    },
    email: {
      dataType: DataTypes.VARCHAR,
      uniqueKey: "p12",
      validator: Guardian.string().email("Invalid email address provided"),
    },
  },
} as const;

export type Test = FilterColumns<typeof testSchema>;
export const testModal = new Model<Test>(testSchema);

await testModal.truncate();
// Now generate inserts
const insData: Array<Test> = [];
for (let i = 0; i < 100; i++) {
  insData.push({
    id: i,
    name: `Abhinav A ${i}`,
    email: `abhai2k+${i}@gmail.com`,
  });
}
try {
  const insOp = await testModal.insert(insData);
  console.log(insOp);
} catch (e) {
  console.log(e);
}

const selFilters: Filters<Test> = {
  name: {
    $like: "%90",
  },
};
const selOp = await testModal.select(selFilters);
console.log(selOp);

// Ok lets try updating a single row
const updData: Test = {
  id: Math.floor(Math.random() * 100),
  name: "Bharath V",
  email: "bharath.v@gmail.com",
};
console.log("df");
try {
  console.log(await testModal.update(updData));
} catch (e) {
  console.log(e);
}

// Lets try a bulk update on UK
// const updDataBlk: Partial<Test> = {
//   name: "Bharath V",
//   email: "bharath.v@gmail.com"
// };

// console.log(await testModal.update(updDataBlk));

// Update - UK violation
const updDataUK: Partial<Test> = {
  id: 2,
  name: "Bharath V",
  email: "bharath.v@gmail.com",
};

console.log(await testModal.update(updDataUK));

// console.log(await testModal.checkConstraints({id: 1234, name: 'test', email: 'abhinav@gmail.com'}));

// const insData = JSON.parse(
//   '{"id": 1234, "name": "test", "email": "abhai2k@gmail.com"}',
// );
// // const ins = await testModal.insert([insData])

// const updData = {
//   id: 123,
//   name: "test",
//   email: "abhai2k",
// };
// console.log(await testModal.update(updData, { id: 123 }));
// // console.log(ins);
