# Validator

General data validation helper functions.

### TODO

- [ ] Add test cases
- [ ] Add live validators (example check if email inbox actually exists etc)

## Usage

```ts
import { Validator } from "./mod.ts";
Validator.pan("ABCA12340D");
```

### Validators

1. [regexMatch](####regexMatch)
2. [mobile](####regexMatch)
3. [email](####email)
4. [pan](####email)
5. [aadhaar](####aadhaar)
6. [ifsc](####ifsc)
7. [gst](####gst)
8. [ipv4](####ipv4)

#### regexMatch

```ts
regexMatch(data: string, pattern: RegExp): boolean
```

`data: string` - The data to test

`pattern: RegExp` - The regular expression to match for

`return - boolean` - True if the data matches, false if it failes

Match data against a regular expression.

#### mobile

```ts
mobile(data: number, format: RegExp = IN_MOBILE_REGEX): boolean
```

`data: number` - The mobile number to check

`format: RegExp` - The regular expression used to check. Defaults to India
numbers

`return - Boolean` - True if it is valid, false if it does not.

Validate a mobile number against a pattern provided. This does not check if the
number actually exists, just if it is valid format

#### email

```ts
email(data: string): boolean
```

`data: data` - The email address to validate

`returns - boolean` - True if it is valid, false if it does not.

Validates if given string is valid email address or not

#### pan

```ts
pan(data: string): boolean
```

`data: string` - PAN number to check for validity

`returns - boolean` - True if it is valid, false if it does not.

Checks if the provided data is a valid Permanent Account Number (PAN)

_NOTE_ Does not check if it is actual PAN, just if it matches the format

#### aadhaar

```ts
aadhaar(data: string): boolean
```

`data: string` - The AADHAAR number to validate

`returns - boolean` - True if it is valid, false if it does not.

Checks if provided data is valid AADHAAR number

_NOTE_ Does not check if AADHAAR exists, only if it matches pattern

#### ifsc

```ts
ifsc(data: string): boolean
```

`data: string` - The IFSC code to validate

`returns - boolean` - True if it is valid, false if it does not.

Checks if the provided data matches valid IFSC code

_NOTE_ Does not check if IFSC exists

#### gst

```ts
gst(data: string): boolean
```

`data: string` - The GST number to validate

`returns - boolean` - True if it is valid, false if it does not.

Checks if provided data matches valid GST code

_NOTE_ Does not check if GST number exists.

#### ipv4

```ts
ipv4(data: string): boolean
```

`data: string` - The IPv4 address to check

`returns - boolean` - True if it is valid, false if it does not.

Checks if provided data is a valid IPV4 address
