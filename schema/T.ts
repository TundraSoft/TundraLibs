//https://stackoverflow.com/questions/62507004/how-can-i-infer-optional-properties-in-typescript
type Schema<T> = {
  [K in keyof T]: SchemaType<T[K]>
}

interface SchemaType<T> {
  optional: boolean
  validate(t: T): boolean
}

const asSchema = <S extends Record<keyof S, { optional: B }>, B extends boolean>(
  s: S
) => s;

const userSchema = asSchema({
  name: {
      optional: true,
      validate(name: string) {
          return name.length > 0 && name.length < 30
      }
  },
  age: {
      optional: false,
      validate(age: number) {
          return age >= 0 && age < 200;
      }
  }
});
/* const userSchema: {
  name: {
      optional: true;
      validate(name: string): boolean;
  };
  age: {
      optional: false;
      validate(age: number): boolean;
  };
} */


type PartialPartial<T, K extends keyof T> = Partial<Pick<T, K>> & Omit<T, K> extends
  infer O ? { [P in keyof O]: O[P] } : never;

type KeysMatching<T, V> = { [K in keyof T]-?: T[K] extends V ? K : never }[keyof T];

type ExtractType<T extends { [K in keyof T]: SchemaType<any> }> = PartialPartial<{
  [K in keyof T]: Parameters<T[K]['validate']>[0]
}, KeysMatching<T, { optional: true }>>


type UserThing = ExtractType<typeof userSchema>;
/* type UserThing = { 
  name?: string | undefined;
  age: number;
} */

class Model<S extends Record<keyof S, SchemaType<any>>, T extends ExtractType<S> = ExtractType<S>> {
  constructor(private schema: S) { }
}

const userModel = new Model(userSchema);
// S is typeof userSchema
// T is {name?: string, age: number}


interface MyModelConstructor {
  new <S extends Record<keyof S, SchemaType<any>>>(schema: S): MyModel<ExtractType<S>>;
}
interface MyModel<T> {
  something: T;
}
const MyModel = Model as any as MyModelConstructor;
const myUserModel = new MyModel(userSchema);
/* const myUserModel: MyModel<{
  name?: string | undefined;
  age: number;
}> */