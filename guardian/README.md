# Guardian

Typescript supports typings, but they are not available at evaluation. Guardian
provides type validation and additional wrappers around validating the data
ensuring data sanity and reliability.

This library is strongly inspired by
[Computed Types](https://github.com/neuledge/computed-types). This was built
basis computed types, but with changes which made more sense to me.

## Usage

```ts
import {
  dateGuard,
  Guardian,
  numberGuard,
  stringGuard,
  Struct,
} from "./mod.ts";
import type { Type } from "./mod.ts";

// Checkf if a string is between 1-100 characters and is a valid email
const emailCheck = stringGuard.min(1).max(100).email();
// To use it simply run
const validatedEmail = emailCheck("testemail@provider.com");
// returns testemail@provider.com
const invalidEmail = emailCheck("asdfdf");
// throws invalid email error

// Structured object
const test = Struct({
  name: stringGuard.min(5),
  email: stringGuard.email().optional(),
  dob: dateGuard,
});
// Generate type
type testType = Type<typeof test>;
/*
 testType = {
  name: string,
  dob: Date,
  email?: string | undefined
 }
 */
// to validate
const testOP = test({ name: "Abhinav A V", email: "my@email.com" });
```

## TODO

- [ ] Date Validator - Add parsing date from number or string
- [ ] Struct - Currently it is strictly typed (only defined will be returned),
      support returning even undefined
- [ ] Async support to be checked
- [ ] Tests!!!
- [ ] Documentation
