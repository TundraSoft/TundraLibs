import {DBTable, DBFields} from "./types.ts"

export class BaseModel<T extends DBTable> {
  constructor() {}

  fetchAll() {}

  fetchOne() {}

  insertOne() {}

  insertMany() {}

  updateOne() {}

  updateMany() {}

  deleteOne() {}

  deleteMany() {}
  
  validate() {}

}