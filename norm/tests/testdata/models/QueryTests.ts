// import { DefaultModel } from './DataModel.ts';
// import { DefaultModel as DefaultModelType } from './DataModel.ts';

// import type {
//   ColumnType,
//   ModelDefinition,
//   TableDefinition,
// } from '../../../types/Definitions/mod.ts';
// import type {
//   DeleteQuery,
//   InsertQuery,
//   SelectQuery,
//   UpdateQuery,
// } from '../../../types/Query/mod.ts';
// import type {
//   TableNumericColumns,
//   TablePrimaryKey,
// } from '../../../types/Definitions/Inferred.ts';

// const _insQuery: InsertQuery<DefaultModelType['User']> = {
//   model: 'User',
//   columns: {
//     Id: 'id',
//     Name: 'name',
//     Email: 'email_address',
//     CreatedAt: 'created_at',
//     Password: 'password',
//   },
//   data: [{
//     Id: 1,
//     Name: 'a',
//   }],
// };

// const _selectQuery: SelectQuery<DefaultModelType['User']> = {
//   model: 'User',
//   columns: {
//     'Id': 'id',
//     'Name': 'name',
//     'Email': 'email_address',
//     'CreatedAt': 'created_at',
//     'Password': 'password',
//   },
//   where: {
//     Name: {
//       $in: ['a', 'b'],
//     },
//   },
//   orderBy: [['Id', 'ASC']],
//   limit: 10,
//   offset: 0,
// };

// type Result<TD extends TableDefinition = TableDefinition> = {
//   [CN in keyof TD['columns']]: ColumnType<TD['columns'][CN]['type']>;
// };
// type Res<
//   X extends SelectQuery<DefaultModelType['User']> = SelectQuery<
//     DefaultModelType['User']
//   >,
// > = {
//   [K in keyof X['columns']]: X['columns'][K];
// };

// const nc: TableNumericColumns<DefaultModelType['User']> = 'Id';

// class T<
//   DM extends ModelDefinition = ModelDefinition,
//   T extends keyof DM = keyof DM,
// > {
//   constructor(public model: T) {}

//   select<X extends Record<string, unknown> = Record<string, unknown>>(
//     // query: SelectQuery<DM[T]>,
//   ): Result<DM[T]> & X {
//     return {} as Result<DM[T]> & X;
//   }
// }
// const a = new T<DefaultModelType, 'User'>('User');
// const x = a.select<{ adf: string }>(_selectQuery);

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
