export type OTPAlgo = "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";

export type OTPType = "HOTP" | "TOTP";

export type iOTPOptions = {
  algo: OTPAlgo;
  type: OTPType;
  length: number;
  key: string;
  counter?: number;
  period?: number;
};
