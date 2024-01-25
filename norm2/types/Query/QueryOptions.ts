// type Flatten<T extends Record<string, unknown>> = {
//   [K in keyof T]: T[K] extends Record<string, unknown> 
//     ? { 
//         [K2 in keyof T[K]]: `${string & K}.${string & K2}` extends infer NewK 
//           ? NewK extends keyof T 
//             ? never 
//             : NewK extends string 
//               ? { [key in NewK]: T[K][K2] } 
//               : never 
//           : never  
//       }[keyof T[K]]
//     : { [KK in string & K]: T[KK] }
// }[keyof T]

// type Flatten3<T extends Record<string, unknown>> = {
//   [K in keyof T]: T[K] extends Record<string, unknown>
//     ? {
//         [K2 in keyof T[K]]: T[K][K2] extends Record<string, unknown>
//         ? {
//             [K3 in keyof T[K][K2]]: `${string & K}.${string & K2}.${string & K3}` extends infer NewK3
//             ? NewK3 extends keyof T
//               ? never
//               : NewK3 extends string
//               ? { [key in NewK3]: T[K][K2][K3] }
//               : never
//             : never
//           }[keyof T[K][K2]]
//         : `${string & K}.${string & K2}` extends infer NewK2
//         ? NewK2 extends keyof T
//           ? never
//           : NewK2 extends string
//           ? { [key in NewK2]: T[K][K2] }
//           : never
//         : never
//       }[keyof T[K]]
//     : { [KK in string & K]: T[KK] }
// }[keyof T]

type UnionToIntersection<U> = (U extends Record<string, unknown>
  ? (k: U) => void
  : never) extends ((k: infer I) => void)
  ? I extends infer O ? { [D in keyof O]: O[D] } : never
  : never


type KeyCombiner<Parent extends string = '', K extends string = ''> =
  `${Parent}${Parent extends '' ? '' : '.'}${K}`;

type FlattenEntity<T extends Record<string, unknown>, Parent extends string = ''> =  UnionToIntersection<
    {
      [K in keyof T]: T[K] extends Record<string, unknown>
        ? FlattenEntity<T[K], KeyCombiner<Parent, K & string>>
        : & {[KK in KeyCombiner<Parent, K & string>]: T[K]}
    }[keyof T] extends infer O ? { [P in keyof O]: O[P] } : never
  >
// type FlattenEntity<T extends Record<string, unknown>, Parent extends string = ''> = UnionToIntersection<{
//   [K in keyof T]: T[K] extends Record<string, unknown>
//     ? FlattenEntity<T[K], `${Parent}${Parent extends '' ? '' : '.'}${string & K}`>
//     : & { [KK in `${Parent}${Parent extends '' ? '' : '.'}${string & K}`]: T[K] }
// }[keyof T] extends infer O ? { [P in keyof O]: O[P] } : never>;

type test21 = FlattenEntity<{ id: number, name: string, address: { city: string, street: string, zipCode: string } }>

// type UnionToIntersection<U> = 
//   ((U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never);



// type test21 = FlattenEntity<{ id: number, name: string, address: { city: string, street: string, zipCode: string } }>

type FlattenObjectKeys<
  T extends Record<string, unknown>,
  Key = keyof T
> = Key extends string
  ? T[Key] extends Record<string, unknown>
    ? `${Key}.${FlattenObjectKeys<T[Key]>}`
    : `${Key}`
  : never

type FlatKeys = FlattenObjectKeys<{ id: number, name: string, address: { city: string, street: string, zipCode: string } }>

type SelectOptions<Entity extends Record<string, unknown> = Record<string, unknown>> = {
  columns: FlattenObjectKeys<Entity>[];
}

type test = Flatten<{ id: number, name: string, address: { city: string, street: string, zipCode: string } }>
type test2 = FlattenEntity<{ id: number, name: string, address: { city: string, street: string, zipCode: string } }>

const opt: SelectOptions = {
  columns: ['id', 'name', 'address', 'address.city', 'address.street', 'address.zipCode']
}

const opt2: SelectOptions<{ id: number, name: string, address: { city: string, street: string, zipCode: string } }> = {
  columns: ["id", "name", "address.city"]
}



type NonObjectKeysOf<T> = {
  [K in keyof T]: T[K] extends Array<any> ? 
    K : 
    T[K] extends object ? never : K
}[keyof T];

type ProperFlat<T> = NonObjectKeysOf<T>;

type d = ProperFlat<{ id: string, name: string, address: { city: string, street: string, zipCode: string } }>

 