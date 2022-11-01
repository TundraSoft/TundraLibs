import { AbstractClient } from "../AbstractClient.ts";
import type { DataQueryResult, MongoConfig, QueryResult, SelectQueryOptions } from "../types/mod.ts";
import { MongoDBClient } from '../../dependencies.ts'
import { Filter } from "https://deno.land/x/mongo@v0.31.1/mod.ts";

export class MongoClient<O extends MongoConfig = MongoConfig>
  extends AbstractClient<O> {
    
  declare protected _client: MongoDBClient;
  constructor(config: NonNullable<O> | O) {
    super(config);
  }

  public override async select<Entity extends Record<string, unknown> = Record<string, unknown>>(options: SelectQueryOptions<Entity>): Promise<DataQueryResult<Entity>> {
    try {
      await this._init();
      const start = performance.now();
      const database = options.schema || this._getOption('database'), 
        retVal: DataQueryResult<Entity> = {
        type: "SELECT", 
        sql: '',
        time: 0, 
        data: [],
        count: 0,
        paging: options.paging,
        }, 
        db = this._client.database(database), 
        collection = db.collection<Entity>(options.table);
      // Get the results
      // Options (second param can be)
      // findOne?: boolean;
      // skip?: number;
      // limit?: number;
      // projection?: Document;
      // sort?: Document;
      // noCursorTimeout?: boolean;
      // /**
      //  * The maximum time of milliseconds the operation is allowed to take
      //  */
      // maxTimeMS?: number;
      retVal.data = await collection.find(options.filters as Filter<Entity>, {}).toArray();
      retVal.time = performance.now() - start;
      return retVal;
    } catch (e) {
      // TODO - Handle the error
      throw e;
    }
  }

  public async count<Entity extends Record<string, unknown> = Record<string, unknown>>(options: SelectQueryOptions<Entity>): Promise<QueryResult<Entity>> {
    try {
      await this._init();
      const start = performance.now();
      const database = options.schema || this._getOption('database'), 
        retVal: QueryResult<Entity> = {
        type: "SELECT", 
        sql: '',
        time: 0, 
        count: 0,
        }, 
        db = this._client.database(database), 
        collection = db.collection<Entity>(options.table);
      // Get the results
      retVal.count = await collection.countDocuments(options.filters as Filter<Entity>);
      retVal.time = performance.now() - start;
      return retVal;
    } catch (e) {
      // TODO - Handle the error
      throw e;
    }
  }

  protected async _init(): Promise<void> {
  }

  protected async _close(): Promise<void> {
  }

  protected async _execute(_qry: string, _params?: unknown[] | undefined): Promise<void> {
    await 1;
    return;
  }

  protected async _query<Entity>(_qry: string, _params?: Record<string, unknown>): Promise<Entity[]> {
    await 1;
    return [];
  }

  protected async _getVersion(): Promise<void> {
    await 1;
    this._version = this._client.buildInfo?.version as string;
  }
}


const client = new MongoDBClient()
await client.connect({
  db: "test",
  servers: [
    {
      host: "localhost",
      port: 50798
    }
  ]
});

interface UserSchema {
  _id: number, 
  Id: string;
  username: string;
  password: string;
}

const adb = client.database('admin');
console.log(client.buildInfo)
// var MongoClient = require('mongodb').MongoClient
// var url = 'mongodb://localhost:27017/test'
// var conn = MongoClient.connect(url, function(err, db) {
//     var adminDb = db.admin();
//     adminDb.serverStatus(function(err, info) {
//         console.log(info.version);
//     })
// })

const db = client.database("test");
const users = db.collection<UserSchema>("users123");
// const insertId = await users.insertOne({
//   _id: 1,
//   id: '34wefwdsf23r', 
//   username: "user1",
//   password: "pass1",
// });
console.log(await users.find().toArray());

// console.log(insertId);


// compression?: string[];
// certFile?: string;
// keyFile?: string;
// keyFilePassword?: string;
// tls?: boolean;
// safe?: boolean;
// credential?: Credential;
// db: string;
// servers: Server[];
// retryWrites?: boolean;
// appname?: string;
