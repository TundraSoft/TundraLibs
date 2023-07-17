import { BaseGuardian } from '../BaseGuardian.ts';
import { StringGuardian } from './StringGuardian.ts';
import { NumberGuardian } from './NumberGuardian.ts';
import { BigintGuardian } from './BigintGuardian.ts';
import { DateGuardian } from './DateGuardian.ts';
import { BooleanGuardian } from './BooleanGuardian.ts';
import { ObjectGuardian } from './ObjectGuardian.ts';
import { ArrayGuardian } from './ArrayGuardian.ts';
import { array, type } from '../utils/mod.ts';

import type {
  FunctionParameters,
  FunctionType,
  GuardianProxy,
} from '../types/mod.ts';

const BooleanMap = {
  true: true,
  false: false,
  t: true,
  f: false,
  yes: true,
  no: false,
  y: true,
  n: false,
  1: true,
  0: false,
};

/**
 * UnknownGuardian
 *
 * A simple proxy to start off as unknown then switch to a more specific type
 */
export class UnknownGuardian<
  P extends FunctionParameters = [unknown],
> extends BaseGuardian<FunctionType<unknown, P>> {
  /**
   * string
   *
   * Set the value to be a string.
   *
   * @param message string Error message
   * @returns GuardianProxy<StringGuardian<P>> The guardian proxy for string
   */
  string(message?: string): GuardianProxy<StringGuardian<P>> {
    return this.transform((input) => {
      if (typeof input === 'string') {
        return input;
      }
      if (
        input === null ||
        (typeof input === 'object' &&
          // deno-lint-ignore ban-types
          (input as unknown as object).toString === Object.prototype.toString)
      ) {
        throw new Error(message || `Expect value to be a string`);
      }
      return String(input);
    }, StringGuardian);
  }

  /**
   * number
   *
   * Set the value to be a number.
   *
   * @param message string Error message
   * @returns GuardianProxy<NumberGuardian<P>> The guardian proxy for number
   */
  number(message?: string): GuardianProxy<NumberGuardian<P>> {
    return this.transform((input) => {
      if (typeof input === 'number') {
        return input;
      }
      const value = Number(input);

      if (isNaN(value) && (input as unknown) !== 'NaN') {
        throw new Error(message || `Expect value to be a number`);
      }

      return value;
    }, NumberGuardian);
  }

  /**
   * bigint
   *
   * Set the value to be a bigint.
   *
   * @param message string Error message
   * @returns GuardianProxy<BigintGuardian<P>> The guardian proxy for bigint
   */
  bigint(message?: string): GuardianProxy<BigintGuardian<P>> {
    return this.transform((input) => {
      if (typeof input === 'bigint') {
        return input;
      }
      const value = BigInt(String(input));

      if (typeof value === 'bigint') {
        return value;
      }

      if ((input as unknown) !== 'NaN') {
        throw new Error(message || `Expect value to be a BigInt`);
      }

      return value;
    }, BigintGuardian);
  }

  /**
   * date
   *
   * Set the value to be a date.
   *
   * @param message string Error message
   * @returns GuardianProxy<DateGuardian<P>> The guardian proxy for date
   */
  date(message?: string): GuardianProxy<DateGuardian<P>> {
    return this.transform((input) => {
      if (input instanceof Date) {
        return input;
      }
      if (typeof input === 'number' || typeof input === 'string') {
        const value = new Date(input);

        if (!isNaN(value.getTime())) {
          return value;
        }
      }
      throw new Error(message || `Expect value to be a date`);
    }, DateGuardian);
  }

  /**
   * boolean
   *
   * Set the value to be a boolean.
   *
   * @param message string Error message
   * @returns GuardianProxy<BooleanGuardian<P>> The guardian proxy for boolean
   */
  boolean(message?: string): GuardianProxy<BooleanGuardian<P>> {
    return this.transform((input) => {
      if (typeof input === 'boolean') {
        return input;
      }
      const key = String(input).trim().toLowerCase(),
        value = BooleanMap[key as keyof typeof BooleanMap];
      if (value == null) {
        throw new Error(message || `Expect value to be a boolean`);
      }
      return value;
    }, BooleanGuardian);
  }

  /**
   * object
   *
   * Set the value to be an object.
   *
   * @param message string Error message
   * @returns GuardianProxy<ObjectGuardian<P>> The guardian proxy for object
   */
  object(message?: string): GuardianProxy<ObjectGuardian<P>> {
    return this.transform(type('object', message), ObjectGuardian);
  }

  /**
   * array
   *
   * Set the value to be an array.
   *
   * @param message string Error message
   * @returns GuardianProxy<ArrayGuardian<P>> The guardian proxy for array
   */
  array(message?: string): GuardianProxy<ArrayGuardian<unknown[], P>> {
    return this.transform(array(null, message), ArrayGuardian);
  }
}

export const Guardian = new UnknownGuardian((input: unknown): unknown => input)
  .proxy();
