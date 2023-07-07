import { DataTypes } from '../types/mod.ts';
import type { ModelType } from '../types/mod.ts';
import { Model } from '../Model.ts';
import { DatabaseManager } from '../DatabaseManager.ts';

DatabaseManager.register('default', {
  dialect: 'POSTGRES',
  host: 'localhost',
  port: 49153,
  userName: 'postgres',
  password: 'postgrespw',
  database: 'postgres',
});

const Test = {
  name: 'Test',
  connection: 'default',
  schema: 'public',
  table: 'test',
  columns: {
    id: {
      type: DataTypes.INTEGER,
      isNullable: false,
    },
    name: {
      type: DataTypes.VARCHAR,
      length: 255,
      isNullable: true,
    },
  },
  audit: {
    schema: 'public',
    table: 'test_audit',
  },
  permissions: {
    delete: true,
    truncate: true,
  },
} as const;

export type a = ModelType<typeof Test>;

// ModelManager.registerModel(Test);

const test = new Model(Test);

const insertResult = await test.insert([{
  id: 1,
  name: 'test',
}, {
  id: 2,
  name: 'test2',
}]);
console.log('insert', insertResult);

const selectRes = await test.select();
console.log('select', selectRes);

const selectFilt = await test.select({
  id: 3,
});
console.log('selectFilt', selectFilt);

// const count = await test.count({
//   name: {
//     $like: 'tes%'
//   }
// });

// console.log('count', count);
// const update = await test.update({
//   name: 'test3'
// });

// console.log('pdate', update);

// const update2 = await test.update({
//   name: 'test3',
// }, {
//   id: 1
// })
// console.log('update2', update2);

// const del = await test.delete({
//   id: 3
// });
// console.log('del', del);

// const del2 = await test.delete();
// console.log('delete2', del2);

// const truncate = await test.truncate();
// console.log(truncate);
