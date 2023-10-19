# OTP

Generate n digit OTP for for 2FA. Supports Google authenticator and other
similar plugins, or if need be use SMS to send the OTP.

Supports both HOTP (Hash based OTP) and TOTP (Time based OTP) modes.

## Usage

```ts
#region HOTP
const HOTPOptions: iOTPOptions = {
  type: "HOTP", // HOTP or TOTP
  key: "12345678901234567890", // Key to use, if not specified new one will be generated
  algo: "SHA-1", // Algo to use, options are SHA-1, SHA-256, SHA-384, SHA-512
  counter: -1, // By default it is set as 0
  length: 6,
}
const otp: OTP = new OTP(HOTPOptions);
const otpValue = await otp.generate();
// Validate
otp.validate(otpValue);
#endregion HOTP

#region TOTP
const TOTPOptions: iOTPOptions = {
  type: "TOTP", // HOTP or TOTP
  key: "12345678901234567890", // Key to use, if not specified new one will be generated
  algo: "SHA-1", // Algo to use, options are SHA-1, SHA-256, SHA-384, SHA-512
  window: 30, // Window for which the OTP is valid, defaults to 30seconds
  length: 6,
}
const totp: OTP = new OTP(TOTPOptions);
const totpValue = await totp.generate();
// Validate
totp.validate(otpValue);
#endregion TOTP
```

## Methods

### newKey

```ts
static newKey(length = 32): string
```

`length: number` - The length of the key to generate

`returns - string` - The key generated

Static method to generate key for the HMAC function

### constructor

```ts
constructor(options: iOTPOptions)
```

`options: iOTPOptions` - The options for generating otp.

```ts
type iOTPOptions = {
  algo: OTPAlgo; // The algorithm to use, supported SHA-1, SHA-256, SHA-384, SHA-512
  type: OTPType; // HOTP or TOTP
  length: number; // Length of the OTP to generate
  key: string; // Key to use for OTP generation, if not provided, a new one will be generated
  counter?: number; // The counter value used for HOTP
  period?: number; // Period for which OTP is valid, used by TOTP
};
```

### generate

```ts
generate(counter?: number): Promise<string>
```

`counter: number` - The counter (for HOTP) or unix epoch (for TOTP) to generate.

`returns - Promise<string>` - The generated OTP

### verify

```ts
validate(
    value: string,
    iteration = 1,
  ): Promise<boolean>
```

`value: string` - The OTP value to validate

`iteration: number` - Number of iterations to check. Usually set to 1

`returns - Promise<boolean>` - True if OTP value found within iteration
parameters

### export

```ts
export(): iOTPOptions
```

`returns - iOTPOptions` - Returns the otp options data. Useful to export config
and store to be used later
