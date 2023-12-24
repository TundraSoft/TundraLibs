// import { OptionKeys } from '../../../options/mod.ts';
// import { AbstractClient } from '../../AbstractConnection.ts';
// import type { MongoConnectionOptions, NormEvents } from '../../types/mod.ts';
// import {
//   // NormBaseError,
//   NormConfigError,
//   // NormNotConnectedError,
//   // NormQueryError,
// } from '../../errors/mod.ts';

// import type {
//   // MongoClientOptions,
//   // MongoCollection,
//   MongoDB,
// } from '../../../dependencies.ts';
// import {
//   MongoDBClient,
//   // MongoServerError
// } from '../../../dependencies.ts';

// export class MongoClient extends AbstractClient<MongoConnectionOptions> {
//   protected _client: MongoDBClient | undefined = undefined;
//   protected _db: MongoDB | undefined = undefined;

//   constructor(
//     name: string,
//     options: OptionKeys<MongoConnectionOptions, NormEvents>,
//   ) {
//     if (options.dialect !== 'MONGO') {
//       throw new NormConfigError('Invalid value for dialect passed', {
//         name: name,
//         dialect: 'MONGO',
//         target: 'dialect',
//         value: options.dialect,
//       });
//     }
//     if (options.host === undefined || options.host.trim() === '') {
//       throw new NormConfigError('Invalid value for host', {
//         name: name,
//         dialect: options.dialect,
//         target: 'host',
//         value: options.host,
//       });
//     }
//     if (options.password?.trim().length === 0) {
//       options.password = undefined;
//     }
//     if (options.username?.trim().length === 0) {
//       options.username = undefined;
//     }
//     const defaults: Partial<MongoConnectionOptions> = {
//       port: 27017,
//       ssl: false,
//       connectionTimeout: 10,
//     };
//     super(name, options, defaults);
//   }

//   protected async _connect(): Promise<void> {
//     this._client = new MongoDBClient();
//     await this._client.connect('');
//     const db = this._client.database(this._getOption('database'));
//     throw new Error('Method not implemented.');
//   }

//   protected _close(): Promise<void> {
//     throw new Error('Method not implemented.');
//   }

//   protected _execute(sql: string): Promise<void> {
//     throw new Error('Method not implemented.');
//   }

//   protected _query<
//     R extends Record<string, unknown> = Record<string, unknown>,
//   >(query: string): Promise<R[]> {
//     throw new Error('Method not implemented.');
//   }

//   protected _normaliseQuery(
//     sql: string,
//     params?: Record<string, unknown> | undefined,
//   ): string {
//     throw new Error('Method not implemented.');
//   }
// }

// // const client = new MongoDBClient('mongodb://mongo:mongopw@localhost:27071');
// // await client.connect();
// // const db = client.db('test');
// // // await db.collection<{_id: string, name: string }>('test').insertOne({_id: crypto.randomUUID(), name: 'test'});
// // console.log(
// //   await db.collection('test').find({
// //     name: {
// //       $regex: 'test',
// //     },
// //   }).toArray(),
// // );
// // await client.close();
