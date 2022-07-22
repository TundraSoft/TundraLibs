import { ObjectProperty, Primitive, ValidatorProxy } from "./types.ts";
import { Validator } from "./BaseValidator.ts";
// import { ValidatorProxy, Validators } from "./types.ts";
import { StringType, StringValidator } from "./StringValidator.ts";
import { NumberType, NumberValidator } from "./NumberValidator.ts";

function getType<T>(val: T): string {
  const type = typeof val;
  if (type === "object") {
    if (val instanceof Date) {
      return "date";
    } else if (val instanceof Array) {
      return "array";
    } else if (val instanceof Map) {
      return "map";
    } else if (val instanceof Set) {
      return "set";
    } else {
      return "object";
    }
  }
  return typeof val;
}

type SchemaDefinition = {
  [K in ObjectProperty]: ValidatorProxy<any> | SchemaDefinition;
}

function compile<S extends SchemaDefinition>(schema: S, options?: {error?: string}) {
  const { error } = options || {};
  const keys = Object.keys(schema);
  const validators: {[K in ObjectProperty]: ValidatorProxy<any>} = {};
  for (const key of keys) {
    const val = schema[key];
    console.log(key, typeof val);
    if (typeof val === "object") {
      // validators.push(compile(val as SchemaDefinition, { error, path: [...(path || []), key] }));
      validators[key] = compile(val as SchemaDefinition, { error });
    } else {
      validators[key] = val as ValidatorProxy<any>;
    }
  }
  
  return (obj: S) => {
    console.log(validators);
    for(const [key, value] of Object.entries(obj)) {
      if (validators[key]) {
        console.log(`Calling validator of ${key} with value ${value}`);
        validators[key](value);
      }
    }
  }
}

const a: SchemaDefinition = {
  a: StringType.email(),
  b: NumberType.min(0),
  c: StringType.optional(), 
  d: {
    a: StringType.min(0),
  }
}

const d = compile(a);
console.log(d);
d({a: "abhai2k@gmail.com", b: 1, c: "", d: {a: ""}});

// function compile<S>(
//   value: S,
//   options?: { error?: string; path?: ObjectProperty[] },
// ) {
//   const { error, path = [] } = options || {};
//   // console.log(`parsing for ${path.join('/')}`);
//   const type = getType(value);
//   let validations: { [key: string]: ValidatorProxy<any> } = {};
//   if (value instanceof Function) {
//     validations[path.join("/")] = value;
//   }

//   if (type === "object") {
//     const obj = value as S;
//     const keys = Object.keys(obj);
//     const validators = keys.map((key) => {
//       console.log(`parsing for ${path.join("/")}/${key}`);
//       const npath: ObjectProperty[] = [...path, key];
//       const child = obj[key as keyof S];
//       return compile(child, { error, path: npath });
//     });
//     validations = validators.reduce((acc, cur) => { return { ...acc, ...cur }; }, {});
//     console.log(`Returning ${path.join("/")}`);
//     console.log(validations);
//     if(path.length > 0) {
//       validations[path.join("/")] = validations;
//       return validations
//     }
//     return (value: S): any => {
//       console.log('in this shit')
//       console.log(validations);
//       return 1
//     };
//   }
//   console.log(validations);
//   return validations;
// }

// const dd = compile({
//   a: NumberType.min(10),
//   b: StringType.min(1).optional,
//   c: { d: NumberType, e: StringType },
// }, { error: "error" });

// console.log(dd);
// dd.call({ a: 1, b: "2", c: { d: 3, e: "4" } });
