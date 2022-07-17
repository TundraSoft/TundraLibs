import { Options } from "../options/mod.ts";
import { alphaNumeric, nanoid } from "../nanoid/mod.ts";
import { base64url } from "../dependencies.ts";

import { JWTClaims, JWTHeaders, JWTOptions } from "./types.ts";

export class JWT extends Options<JWTOptions> {
  #key!: CryptoKey;

  /**
   * constructor(options: Partial<JWTOptions>)
   *
   * Constructor for the JWT library. Sets the configuration
   *
   * @param options Partial<JWTOptions> Default configuration
   */
  constructor(options: Partial<JWTOptions>) {
    const defaults: Partial<JWTOptions> = {
      algo: "HS256",
      issuer: "Tundrasoft",
    };
    super(options, defaults);
    if (!this._hasOption("key")) {
      throw new Error("[module='JWT'] Encryption key must be provided");
    }
  }

  /**
   * sign(claim: JWTClaims)
   *
   * Signs and creates a JWT token. Below items will be set automagically:
   * headers - typ - "JWT"
   * headers - algo - as defined in constructor, defaults to HS256
   * claim - iss - As defined in options, defaults to TundraLibs
   * claim - nbf - current timestamp
   * claim - iat - current timestamp
   * jti - string - a unique 16 alpha numeric id
   *
   * @param claim JWTClaims The claims or payload of the JWT token
   * @returns Promist<string> The JWT Token
   */
  async sign(claim: JWTClaims): Promise<string> {
    await this._importKey();
    const defaults: Partial<JWTClaims> = {
      iss: this._getOption("issuer"),
      nbf: JWT.setDate(),
      iat: JWT.setDate(),
      jti: nanoid(16, alphaNumeric),
    };
    claim = { ...defaults, ...claim };
    this._validateClaims(claim);
    const headers: JWTHeaders = {
        typ: "JWT",
        alg: this._getOption("algo"),
      },
      input = `${base64url.encode(JSON.stringify(headers))}.${
        base64url.encode(JSON.stringify(claim))
      }`,
      sign = await crypto.subtle.sign("HMAC", this.#key, this._encode(input));
    return `${input}.${base64url.encode(sign)}`;
  }

  /**
   * verify(token: string)
   *
   * Verifies the token provided. It also performs validation (if signature is valid) on the
   * dates (iat, nbf and exp if found)
   *
   * @param token string The raw JWT token
   * @returns Promise<JWTClaims> The Claims object
   */
  async verify(token: string): Promise<JWTClaims> {
    await this._importKey();
    const { headers, claim, signature } = this.parseToken(token),
      verify = await crypto.subtle.verify(
        "HMAC",
        this.#key,
        base64url.decode(signature),
        this._encode(
          `${base64url.encode(JSON.stringify(headers))}.${
            base64url.encode(JSON.stringify(claim))
          }`,
        ),
      );

    if (!verify) {
      throw new Error("[module='JWT'] Signature verification of token failed");
    }
    this._validateClaims(claim);
    return claim;
  }

  /**
   * parseToken(token: string)
   *
   * Extracts the token components
   *
   * @param token string The JWT token
   * @returns {headers: JWTHeaders, claim: JWTClaims, signature: string} The extracted token components
   */
  parseToken(
    token: string,
  ): { headers: JWTHeaders; claim: JWTClaims; signature: string } {
    const tokenParts = token.split(".");
    if (tokenParts.length != 3) {
      throw new Error("[module='JWT'] Invalid token provided");
    }
    const headers = JSON.parse(
        new TextDecoder().decode(base64url.decode(tokenParts[0])),
      ),
      claim = JSON.parse(
        new TextDecoder().decode(base64url.decode(tokenParts[1])),
      ),
      signature = tokenParts[2];
    return { headers: headers, claim: claim, signature: signature };
  }

  /**
   * _validateClaims(claim: JWTClaims)
   *
   * Validates the provided claim/payload part. It checks if the dates provided (iat, nbf and exp)
   * are valid epoch timestamps and also if they are valid.
   *
   * @param claim JWTClaims The claim to validate
   */
  protected _validateClaims(claim: JWTClaims) {
    // Validate iat, nbf and exp to be dates
    if (claim.iat) {
      try {
        new Date(claim.iat);
        // Check if issued at is in the future
      } catch {
        throw new Error(
          "[module='JWT'] Claim issue at is not a valid timestamp epoch",
        );
      }
      if (new Date(claim.iat) > new Date()) {
        throw new Error(
          "[module='JWT'] Cannot have claim issue at in the future",
        );
      }
    }
    if (claim.nbf) {
      try {
        new Date(claim.nbf);
      } catch {
        throw new Error(
          "[module='JWT'] Claim not before at is not a valid timestamp epoch",
        );
      }
      if (new Date(claim.nbf) > new Date()) {
        throw new Error(
          "[module='JWT'] Claim Not Before is found to be in the future",
        );
      }
    }
    if (claim.exp) {
      try {
        new Date(claim.exp);
      } catch {
        throw new Error(
          "[module='JWT'] Claim expiry is not a valid timestamp epoch",
        );
      }
      if (new Date(claim.exp) > new Date()) {
        throw new Error("[module='JWT'] Claim has expired!");
      }
    }
  }

  /**
   * _importKey()
   *
   * Imports the provided key
   */
  protected async _importKey() {
    if (!this.#key) {
      switch (this._getOption("algo")) {
        case "HS256":
          this.#key = await crypto.subtle.importKey(
            "raw",
            this._encode(this._getOption("key")),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign", "verify"],
          );
          break;
        case "HS384":
          this.#key = await crypto.subtle.importKey(
            "raw",
            this._encode(this._getOption("key")),
            { name: "HMAC", hash: "SHA-384" },
            false,
            ["sign", "verify"],
          );
          break;
        case "HS512":
          this.#key = await crypto.subtle.importKey(
            "raw",
            this._encode(this._getOption("key")),
            { name: "HMAC", hash: "SHA-512" },
            false,
            ["sign", "verify"],
          );
          break;
        default:
          throw new Error("[module='JWT'] Unknown algo specified");
      }
    }
  }

  /**
   * _encode(data:string)
   * Helper function to convert string data to int 8 array
   *
   * @param data string Data to be encoded to int 8 Array
   * @returns Uint8Array Data converted to int 8 array
   */
  protected _encode(data: string): Uint8Array {
    return new TextEncoder().encode(data);
  }

  /**
   * setDate(difference = 0)
   *
   * Creates numeric epoch timestamp taking into account the "difference" variable passed.
   * Used to generate the timestamps for nbg, iat and exp.
   *
   * @param difference number The difference from current time in seconds
   * @returns number Returns epoch timestamp
   */
  public static setDate(difference = 0): number {
    if (difference) {
      difference = difference * 1000;
    }
    return Math.floor((Date.now() + difference) / 1000);
  }
}

const key = "1AEqUQThWaUarxLIv6l0SzH6ZpIS44xWsAM5xOhi7p76h44NqZfSAM7Hi3afG6wS";
const j = new JWT({
  algo: "HS256",
  key: key,
  issuer: "AV",
});
const jwtSign = await j.sign({
  "userid": "abhinav",
  exp: JWT.setDate(60 * 60),
});
// eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJBViIsIm5iZiI6MTY1ODAxMTM2MTQxNCwiaWF0IjoxNjU4MDExMzYxNDE0LCJqdGkiOiI5Y0JJanpaY2RqOW5ZcHJtIiwidXNlcmlkIjoiYWJoaW5hdiJ9.vX5cXkB_QWDzcTqW65ASekUoo67GYRSYLz2HliI9An8
console.log(jwtSign);
console.log(await j.verify(jwtSign));
