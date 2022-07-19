import { BaseModel } from "../BaseModel.ts"
import { Database } from "../Database.ts";
import { ModelSchema, DataTypes, ClientConfig } from "../types.ts";
import { Validator } from "../../validator/mod.ts";

const dbCon: ClientConfig = {
  dialect: "POSTGRES", 
  host: "", 
  username: "", 
  password: "--", 
  database: "testdb", 
  port: 5432, 
  pool: 5, 
  tls: {
    enabled: true
  }
}

type modelSchema = {
  id: number, 
  name: string, 
  email: string
}

const DummySchema: ModelSchema<modelSchema> = {
  connection: 'default', 
  schema: 'public', 
  table: 'dummy', 
  columns: {
    id: {
      isPrimary: true, 
      dataType: DataTypes.INTEGER
    }, 
    name: {
      dataType: DataTypes.VARCHAR, 
      validators: [
        {
          cb: Validator.minLength, 
          args: [10], 
          msg: 'Minimum length of 10 expected'
        }
      ]
    }, 
    email: {
      dataType: DataTypes.VARCHAR, 
      validators: [
        {
          cb: Validator.email, 
          msg: 'Not a valid email'
        }
      ]
    }
  }
}

// class testModel extends BaseModel<modelSchema> {
//   constructor() {
//     super(DummySchema);
//   }
// }

await Database.spoofGetDatabase('default', dbCon);

// const d = new testModel();
// d.validate({
//   id: 13, 
//   name: 'dfg dfgdf gdfg', 
//   email: 'daf'
// });

const d = Database.newModel<modelSchema>('test', DummySchema);

d.validate({
  id: 13, 
  name: 'dsfsd sdf asd sdf', 
  email: 'adsfasd@rmail.com'
})

console.log(await d.select());
