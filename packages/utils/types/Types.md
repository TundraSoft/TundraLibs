# Type Utilities

Advanced TypeScript utility types for type manipulation and transformation.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Overview

The Types module provides a comprehensive collection of TypeScript utility types for advanced type manipulation, transformation, and composition. These types enable better type safety, improved developer experience, and more expressive type definitions.

**Pass a `type` alias, not an `interface`.** `Entries`, `Immutable`,
`Mutable`, `Paths`, `PathValue` and `FlattenEntity` constrain their
argument to `Record<string, unknown>`, and an interface will not satisfy
it — `Index signature for type 'string' is missing in type 'MyShape'`.
Interfaces are open, since declaration merging lets another file add
members later, so TypeScript withholds the implicit index signature that
proves the shape is a closed, string-keyed bag; a `type` alias with the
same members is closed and qualifies. When the shape is generated or
comes from a third-party package, intersect it:

```typescript
import type { Entries, Paths } from '@tundralibs/utils/types';

interface Generated {
  host: string;
  port: number;
}

type MyShape = Generated & Record<string, unknown>;

type ShapeEntries = Entries<MyShape>;
type ShapePaths = Paths<MyShape>;
```

## Installation

**Deno:**

```bash
deno add @tundralibs/utils
```

**Bun:**

```bash
bunx jsr add @tundralibs/utils
```

**Node.js:**

```bash
npx jsr add @tundralibs/utils
```

**Direct import (Deno):**

```typescript
import type { DeepReadOnly, FlattenEntity } from 'jsr:@tundralibs/utils/types';
```

The `types` sub-path carries the whole type surface and nothing else —
importing it never loads a runtime module. The same types are also
re-exported from the package root (`@tundralibs/utils`) alongside the
runtime helpers.

## Table of Contents

- [Immutability](#immutability)
  - [DeepReadOnly](#deepreadonly)
  - [DeepWritable](#deepwritable)
  - [Immutable](#immutable)
  - [Mutable](#mutable)
- [Selective Modifiers](#selective-modifiers)
  - [MakeReadOnly](#makereadonly)
  - [MakeRequired](#makerequired)
  - [MakeOptional](#makeoptional)
- [Object Transformation](#object-transformation)
  - [FlattenEntity](#flattenentity)
  - [Paths](#paths)
  - [PathValue](#pathvalue)
  - [Simplify](#simplify)
- [Property Filtering](#property-filtering)
  - [ExcludeNever](#excludenever)
  - [PickByType](#pickbytype)
  - [OmitByType](#omitbytype)
- [Type Extraction](#type-extraction)
  - [Entries](#entries)
  - [UnArray](#unarray)
- [Advanced Manipulation](#advanced-manipulation)
  - [UnionToIntersection](#uniontointersection)

---

## Immutability

### DeepReadOnly

Recursively applies readonly constraints to all properties of a type and its nested objects.

```typescript
import type { DeepReadOnly } from '@tundralibs/utils/types';

type User = {
  id: number;
  profile: {
    name: string;
    settings: {
      theme: 'light' | 'dark';
      notifications: boolean;
    };
  };
};

type ImmutableUser = DeepReadOnly<User>;
// All nested properties are readonly
```

**Use Cases:**

- Immutable data structures for state management
- API response types that shouldn't be modified
- Configuration objects that need protection
- Redux/Flux state shape definitions

---

### DeepWritable

Recursively removes readonly constraints from all properties of a type and its nested objects.

```typescript
import type { DeepWritable } from '@tundralibs/utils/types';

type ReadonlyConfig = {
  readonly database: {
    readonly host: string;
    readonly port: number;
  };
};

type MutableConfig = DeepWritable<ReadonlyConfig>;
// All nested properties are now mutable
```

**Use Cases:**

- Creating mutable copies from immutable API responses
- Form editing from readonly configuration objects
- Testing scenarios requiring mutable data
- Library integrations that need mutable types

---

### Immutable

Makes all properties of an object type readonly at the top level (shallow).

```typescript
import type { Immutable } from '@tundralibs/utils/types';

type User = {
  id: number;
  name: string;
  email: string;
};

type ImmutableUser = Immutable<User>;
// Equivalent to Readonly<User>
```

**Use Cases:**

- Creating immutable configuration objects
- Protecting API response types from modification
- Function parameters that shouldn't be mutated

**Note:** For deep immutability, use `DeepReadOnly`.

---

### Mutable

Removes readonly modifiers from all properties of an object type at the top level (shallow).

```typescript
import type { Mutable } from '@tundralibs/utils/types';

type ReadonlyUser = {
  readonly id: number;
  readonly name: string;
};

type MutableUser = Mutable<ReadonlyUser>;
// readonly modifiers removed
```

**Use Cases:**

- Creating mutable copies from readonly types
- Form editing from readonly initial data
- Testing with mutable data

**Note:** For deep mutability, use `DeepWritable`.

---

## Selective Modifiers

### MakeReadOnly

Makes only specified properties of an object readonly while leaving others mutable.

```typescript
import type { MakeReadOnly } from '@tundralibs/utils/types';

type User = {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'user';
};

type ProtectedUser = MakeReadOnly<User, 'id' | 'role'>;
// Result: {
//   readonly id: number;
//   name: string;
//   email: string;
//   readonly role: 'admin' | 'user';
// }
```

**Use Cases:**

- Configuration objects with immutable core settings
- Entity types with protected ID fields
- State management with immutable keys
- API response types with readonly metadata

**Note:** This differs from TypeScript's `Readonly<T>` which makes ALL properties readonly.

---

### MakeRequired

Makes only specified properties of an object required while leaving others as-is.

```typescript
import type { MakeRequired } from '@tundralibs/utils/types';

type FormData = {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
};

type RequiredForm = MakeRequired<FormData, 'name' | 'email'>;
// Result: {
//   name: string;
//   email: string;
//   phone?: string;
//   address?: string;
// }
```

**Use Cases:**

- Form validation with required fields
- API request types with mandatory parameters
- Configuration with required core settings
- Type narrowing for conditional logic

**Note:** This differs from TypeScript's `Required<T>` which makes ALL properties required.

---

### MakeOptional

Makes only specified properties of an object optional while keeping others required.

```typescript
import type { MakeOptional } from '@tundralibs/utils/types';

type User = {
  id: number;
  name: string;
  email: string;
  phone: string;
};

type CreateUserRequest = MakeOptional<User, 'phone'>;
// Result: {
//   id: number;
//   name: string;
//   email: string;
//   phone?: string;
// }
```

**Use Cases:**

- API endpoints with optional parameters
- Update/patch operations
- Configuration objects with sensible defaults
- Database entity updates

**Note:** This differs from TypeScript's `Partial<T>` which makes ALL properties optional.

---

## Object Transformation

### FlattenEntity

Recursively flattens nested objects to dot-notation keys with configurable identifier prefix.

```typescript
import type { FlattenEntity } from '@tundralibs/utils/types';

type BlogPost = {
  title: string;
  author: {
    name: string;
    email: string;
  };
  comments: Array<{
    text: string;
    userId: number;
  }>;
};

type FlatBlogPost = FlattenEntity<BlogPost>;
// Result: {
//   $title: string;
//   $author.$name: string;
//   $author.$email: string;
//   $comments.$text: string;              // Any element (contains query)
//   $comments.[0].$text: string;          // Specific index access
//   $comments.$userId: number;
//   $comments.[0].$userId: number;
// }
```

**Key Features:**

- Generates **both** array access patterns:
  - `$comments.$text` - for contains/includes queries (any element)
  - `$comments.[0].$text` - for specific index access
- Customizable identifier prefix (default `$`)
- Supports arbitrarily deep nesting

**Use Cases:**

- MongoDB-style query and filter generation
- Database entity mapping and ORM integration
- API response normalization
- Configuration file processing
- Search index document creation

**Examples:**

```typescript
import type { FlattenEntity } from '@tundralibs/utils/types';

type Config = {
  server: {
    host: string;
  };
};

// Custom identifier
type FlatConfig = FlattenEntity<Config, '', '_'>;
// Uses underscore: _server._host

// Query builder usage
const query = {
  '$comments.$text': { $contains: 'keyword' }, // Any comment
  '$comments.[0].$text': 'First comment', // Specific index
};
```

---

### Paths

Generates all possible paths through an object type using dot notation.

```typescript
import type { Paths } from '@tundralibs/utils/types';

type Config = {
  database: {
    host: string;
    credentials: {
      username: string;
      password: string;
    };
  };
};

type ConfigPaths = Paths<Config>;
// Result: {
//   database: Config['database'];
//   'database.host': string;
//   'database.credentials': Config['database']['credentials'];
//   'database.credentials.username': string;
//   'database.credentials.password': string;
// }
```

**Use Cases:**

- Configuration management systems
- Form field path generation
- Object property observers/watchers
- Data binding utilities

---

### PathValue

Extracts the type of a nested property from a dot-notation path.

```typescript
import type { PathValue } from '@tundralibs/utils/types';

type AppConfig = {
  server: {
    host: string;
    port: number;
    ssl: {
      enabled: boolean;
      cert: string;
    };
  };
};

type HostType = PathValue<AppConfig, 'server.host'>; // string
type PortType = PathValue<AppConfig, 'server.port'>; // number
type SslEnabled = PathValue<AppConfig, 'server.ssl.enabled'>; // boolean
type Invalid = PathValue<AppConfig, 'invalid.path'>; // never
```

**Features:**

- Type-safe path navigation
- Returns `never` for invalid paths
- Supports arbitrarily deep nesting
- Full IntelliSense support

**Use Cases:**

- Type-safe configuration getters
- Form field value types
- API response property extraction
- Dynamic property access with type safety

---

### Simplify

Flattens complex intersection types for better IntelliSense display.

```typescript
import type { Simplify } from '@tundralibs/utils/types';

type A = { x: number; y: string };
type B = { z: boolean };
type C = A & B;

// Without Simplify: A & B (shows as intersection)
type SimplifiedC = Simplify<C>;
// Shows as: { x: number; y: string; z: boolean }
```

**Use Cases:**

- Improving developer experience with type hints
- Simplifying composed types from multiple utility types
- Better error messages from TypeScript compiler
- Type display in IDE for complex generic types

**Note:** This is purely cosmetic - it doesn't change type behavior, only how it displays.

---

## Property Filtering

### ExcludeNever

Removes properties with a value type of `never` from object types.

```typescript
import type { ExcludeNever } from '@tundralibs/utils/types';

type InputType = {
  validProp: string;
  invalidProp: never;
  anotherValidProp: number;
  anotherInvalidProp: never;
};

type CleanType = ExcludeNever<InputType>;
// Result: {
//   validProp: string;
//   anotherValidProp: number;
// }
```

**Use Cases:**

- Cleaning up generated types from complex type operations
- API response type filtering
- Conditional property inclusion/exclusion
- Type-safe object transformations

---

### PickByType

Selects only properties from an object that match a specified value type.

```typescript
import type { PickByType } from '@tundralibs/utils/types';

type User = {
  id: number;
  name: string;
  email: string;
  age: number;
  active: boolean;
};

type StringProps = PickByType<User, string>;
// Result: { name: string; email: string; }

type NumericProps = PickByType<User, number>;
// Result: { id: number; age: number; }
```

**Use Cases:**

- Extracting function properties (methods) from classes
- Selecting only numeric or string properties
- Creating type-specific subsets of objects
- Validation schema generation

---

### OmitByType

Removes all properties from an object that match a specified value type.

```typescript
import type { OmitByType } from '@tundralibs/utils/types';

type UserClass = {
  id: number;
  name: string;
  email: string;
  save(): Promise<void>;
  delete(): Promise<void>;
};

type UserData = OmitByType<UserClass, Function>;
// Result: { id: number; name: string; email: string; }
```

**Use Cases:**

- Removing function properties from object types
- Filtering out optional or nullable properties
- Creating data-only types (no methods)
- Serialization type generation

---

## Type Extraction

### Entries

Converts an object type to an array of `[key, value]` tuple types.

```typescript
import type { Entries } from '@tundralibs/utils/types';

type User = {
  id: number;
  name: string;
  email: string;
  active: boolean;
};

type UserEntries = Entries<User>;
// Result: (['id', number] | ['name', string] | ['email', string] | ['active', boolean])[]
```

**Use Cases:**

- Type-safe object iteration with `Object.entries()`
- Building type-safe mappers and transformers
- Form data serialization with type preservation
- Configuration validation and transformation

**Example:**

```typescript
import type { Entries } from '@tundralibs/utils/types';

type Config = {
  host: string;
  port: number;
};

function processConfig(config: Config): void {
  const entries = Object.entries(config) as Entries<Config>;
  entries.forEach(([key, value]) => {
    // Fully typed key and value
    console.log(`${key}: ${value}`);
  });
}
```

---

### UnArray

Extracts the element type from array types.

```typescript
import type { UnArray } from '@tundralibs/utils/types';

type StringArray = string[];
type StringElement = UnArray<StringArray>; // string

type NumberArray = number[];
type NumberElement = UnArray<NumberArray>; // number

// Tuples become union types
type MixedTuple = [string, number, boolean];
type TupleElement = UnArray<MixedTuple>; // string | number | boolean

// Non-arrays remain unchanged
type SingleString = string;
type UnwrappedString = UnArray<SingleString>; // string
```

**Type Behavior:**

- `Array<T>` → `T`
- `readonly T[]` → `T`
- `[T, U, V]` (tuple) → `T | U | V`
- `T` (non-array) → `T`

**Use Cases:**

- Generic functions that work with both arrays and single values
- Type narrowing in conditional logic
- Building flexible APIs that accept arrays or single items
- Processing function parameters with overloaded signatures

---

## Advanced Manipulation

### UnionToIntersection

Transforms union types into intersection types.

```typescript
import type { UnionToIntersection } from '@tundralibs/utils/types';

type A = { x: number };
type B = { y: string };
type C = { z: boolean };

type Union = A | B | C;
type Intersection = UnionToIntersection<Union>;
// Result: { x: number } & { y: string } & { z: boolean }
// Effectively: { x: number; y: string; z: boolean }
```

**Algorithm:**
Uses distributive conditional types and contravariance in function parameter positions to collapse unions into intersections.

**Use Cases:**

- Object merging type operations
- Advanced type composition utilities
- Library API design requiring type combination
- Plugin system type definitions

**Example:**

```typescript
import type { UnionToIntersection } from '@tundralibs/utils/types';

// Type-safe object merging
function mergeObjects<T extends Record<string, unknown>[]>(
  ...objects: T
): UnionToIntersection<T[number]> {
  return Object.assign({}, ...objects) as UnionToIntersection<T[number]>;
}

const merged = mergeObjects(
  { a: 1, b: 'hello' },
  { c: true, d: [1, 2, 3] },
);
// Type: { a: number; b: string; c: boolean; d: number[] }
```

**Limitations:**

- Only works with object types (Record<string, unknown>)
- May not preserve exact type semantics in all edge cases
- Can increase TypeScript compilation complexity

---

## Type Comparison Matrix

| Type                | Depth   | Operation          | Built-in Alternative |
| ------------------- | ------- | ------------------ | -------------------- |
| DeepReadOnly        | Deep    | Add readonly       | None                 |
| DeepWritable        | Deep    | Remove readonly    | None                 |
| Immutable           | Shallow | Add readonly       | `Readonly<T>`        |
| Mutable             | Shallow | Remove readonly    | None                 |
| MakeReadOnly        | N/A     | Selective readonly | None                 |
| MakeRequired        | N/A     | Selective required | `Required<T>`*       |
| Optional            | N/A     | Selective optional | `Partial<T>`*        |
| PickByType          | N/A     | Filter by type     | None                 |
| OmitByType          | N/A     | Exclude by type    | None                 |
| FlattenEntity       | Deep    | Flatten to paths   | None                 |
| Simplify            | N/A     | Flatten display    | None                 |
| UnionToIntersection | N/A     | Union to Intersect | None                 |

\* Built-in operates on ALL properties, ours on SELECTED properties

---

## Best Practices

### When to Use Deep vs Shallow

**Use Deep types** (`DeepReadOnly`, `DeepWritable`) when:

- Working with deeply nested configuration objects
- State management in Redux/Flux patterns
- API responses with multiple nesting levels

**Use Shallow types** (`Immutable`, `Mutable`) when:

- Only top-level protection is needed
- Performance is critical (simpler types compile faster)
- Working with flat data structures

### Selective vs All-Properties

**Use Selective types** (`MakeReadOnly`, `MakeRequired`, `Optional`) when:

- Only certain fields should be modified
- Creating specialized type variants
- Implementing business rules at type level

**Use Built-in types** (`Readonly<T>`, `Required<T>`, `Partial<T>`) when:

- All properties should be affected
- Standard TypeScript patterns are sufficient

### Performance Considerations

- Deep types increase TypeScript compilation time for very nested structures
- Recommended maximum nesting depth: 10 levels
- Use `Simplify` to improve IntelliSense performance with complex intersections
- Prefer simpler types when performance is critical

---

## Related Documentation

- [← Back to Utils](../README.md)
- [Utils Documentation](../README.md)
- [JSR Package](https://jsr.io/@tundralibs/utils)

## License

MIT © TundraLibs
