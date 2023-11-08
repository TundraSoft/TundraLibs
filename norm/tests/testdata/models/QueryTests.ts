import { DefaultModel } from './DataModel.ts';
import type { DefaultModel as DefaultModelType } from './DataModel.ts';
import type { SelectQuery, InsertQuery, UpdateQuery, DeleteQuery } from '../../../types/Query/mod.ts';

const _insQuery: InsertQuery<DefaultModelType['User']> = {
  model: 'User',
  columns: ['Id', 'Name'],
  data: [{
    Id: 1,
    Name: 'a',
  }],
}

const _selectQuery: SelectQuery<DefaultModelType['User']> = {
  model: 'User',
  columns: ['Id', 'Name'],
  where: {
    Name: {
      $in: ['a', 'b'],
    },
  },
  orderBy: {
    Id: 'ASC',
  },
  limit: 10,
  offset: 0,
}


// type DeepWriteable<T> = { -readonly [P in keyof T]: DeepWriteable<T[P]> };

// const model = {
//   User: {
//     name: 'users', 
//     columns: {
//       id: {
//         name: 'id',
//         type: 'INTEGER',
//       },
//       name: {
//         name: 'name',
//         type: 'VARCHAR',
//       },
//     },
//     primaryKeys: ['id'],
//   }
// } as const;

// const a: DeleteQuery<DeepWriteable<typeof model['User']>> = {
//   model: 'User',
//   columns: ['id', 'name'], 
//   where: {
//     name: {
//       $in: ['a', 'b'],
//     },
//   }
// }