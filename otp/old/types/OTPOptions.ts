import type { OTPAlgo } from './OTPAlgo.ts';

type BaseOTPOptions = {
  type: 'HOTP' | 'TOTP';
  algo: OTPAlgo;
  length: number;
  key: string;
}

export type HOTPOptions = BaseOTPOptions & {
  type: 'HOTP';
  counter: number;
}

export type TOTPOptions = BaseOTPOptions & {
  type: 'TOTP';
  period: number;
}

export type OTPOptions = HOTPOptions | TOTPOptions;