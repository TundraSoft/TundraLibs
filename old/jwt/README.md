# JWT

Sign and verify JWT tokens.

## Usage

```ts
#region JWT
const JWTOptions: JWTOptions = {
  algo: "HS256", 
  issuer: "SomeApplication", 
  key: "1AEqUQThWaUarxLIv6l0SzH6ZpIS44xWsAM5xOhi7p76h44NqZfSAM7Hi3afG6wS"
}
const j = new JWT(JWTOptions);
// Sign
const jwtSign = await j.sign({ "userid": "abhinav", exp: JWT.setDate(60 * 60)});
// Verify
await j.verify(jwtSign)
// Get token parts - This does not validate the token (signature) or the dates!
j.parseToken(jwtSign)
#endregion JWT
```

## Methods

### setDate

```ts
static setDate(difference = 0): number
```

`difference: number` - The difference from current time in seconds

`returns - number` - Returns epoch timestamp

Creates numeric epoch timestamp taking into account the "difference" variable
passed. Used to generate the timestamps for nbg, iat and exp.

### constructor

```ts
constructor(options: Partial<JWTOptions>)
```

`options: Partial<JWTOptions>` - JWT Configuration

```ts
type type JWTOptions = {
  algo: JWTAlgo; // Algorithm to use, possible values are "HS256", "HS384", "HS512"
  issuer?: string; // Issuer (iss) value. Defaults to Tundrasoft
  key: string; // The key
};
```

### generate

```ts
sign(claim: JWTClaims): Promise<string>
```

`claim: JWTClaims` - The claims/payload part of the JWT token

`returns - Promise<string>` - The JWT token

```ts
type JWTClaims = {
  sub?: string; // Subject
  aud?: string; // audience
  exp?: number; // expiry date (epoch timestamp)
  nbf?: number; // not before (epoch timestamp)
  iat?: number; // issued at (epoch timestamp)
  jti?: string; // JWT Token ID
  [key: string]: unknown; // Other payload information
};
```

### verify

```ts
verify(token: string): Promise<JWTClaims>
```

`token: string` - The token

`returns - Promise<JWTClaims>` - The JWT Claim/Payload data. Will throw error if
the signature does not match or if exp, nbf and iat are not valid

### export

```ts
parseToken(token: string): { headers: JWTHeaders; claim: JWTClaims; signature: string }
```

`returns - { headers: JWTHeaders; claim: JWTClaims; signature: string }` -
Returns the header, claim and signature components of the token
