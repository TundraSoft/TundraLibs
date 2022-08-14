import { BaseGuardian } from "../BaseGuardian.ts";
import { type } from "../utils.ts";
import type {
  FunctionParameters,
  FunctionType,
  GuardianProxy,
} from "../types.ts";

/**
 * StringGuardian
 *
 * Guardian class for String data type
 *
 * @class StringGuardian
 */
export class StringGuardian<
  P extends FunctionParameters = [string],
> extends BaseGuardian<FunctionType<string, P>> {
  //#region Manipulators
  /**
   * capitalize
   *
   * Capitalizes the first letter of the sentence
   *
   * @returns GuardianProxy<this>
   */
  capitalize(): GuardianProxy<this> {
    return this.transform((str: string) =>
      str.charAt(0).toUpperCase() + str.slice(1)
    );
  }

  /**
   * lowerCase
   *
   * Converts the string to lower case
   *
   * @returns GuardianProxy<this>
   */
  lowerCase(): GuardianProxy<this> {
    return this.transform((str: string) => str.toLowerCase());
  }

  /**
   * upperCase
   *
   * Converts the string to upper case
   *
   * @returns GuardianProxy<this>
   */
  upperCase(): GuardianProxy<this> {
    return this.transform((str: string) => str.toUpperCase());
  }

  /**
   * camelCase
   *
   * Converts the string to camel case
   *
   * @returns GuardianProxy<this>
   */
  camelCase(): GuardianProxy<this> {
    return this.transform((str: string) =>
      str.replace(/[^a-zA-Z0-9]/g, " ").split(" ").map((word) =>
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join("")
    );
  }

  /**
   * snakeCase
   *
   * Converts the string to snake case
   *
   * @returns GuardianProxy<this>
   */
  snakeCase(): GuardianProxy<this> {
    return this.transform((str: string) =>
      str.replace(/[^a-zA-Z0-9]/g, " ").split(" ").map((word) =>
        word.charAt(0).toLowerCase() + word.slice(1)
      ).join("_")
    );
  }

  /**
   * trim
   *
   * Removes white space from start and end of the string
   *
   * @returns GuardianProxy<this>
   */
  trim(): GuardianProxy<this> {
    return this.transform((str: string) => str.trim());
  }

  /**
   * replace
   *
   * Replaces a substring with another substring
   *
   * @param search string to search for
   * @param replace string to replace with
   * @returns GuardianProxy<this>
   */
  replace(search: string, replace: string): GuardianProxy<this> {
    return this.transform((str: string) => str.replace(search, replace));
  }

  //#endregion Manipulators

  //#region Validators
  /**
   * notEmpty
   *
   * Ensures the string is not empty
   *
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  notEmpty(message?: string): GuardianProxy<this> {
    return this.test(
      (str: string) => str.length > 0,
      message || `Expect string to be not empty`,
    );
  }

  /**
   * min
   *
   * Checks if the string is at least `len` characters long
   *
   * @param len number length of the string
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  min(len: number, message?: string): GuardianProxy<this> {
    return this.test(
      (str: string) => str.length >= len,
      message || `Expect string to be at least ${len} characters long`,
    );
  }

  /**
   * max
   *
   * Checks if the string is at most `len` characters long
   *
   * @param len number length of the string
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  max(len: number, message?: string): GuardianProxy<this> {
    return this.test(
      (str: string) => str.length <= len,
      message || `Expect string to be at most ${len} characters long`,
    );
  }

  /**
   * between
   *
   * Checks if the string is between `min` and `max` characters long
   *
   * @param min number Minimum length of the string
   * @param max number Maximum length of the string
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  between(min: number, max: number, message?: string): GuardianProxy<this> {
    return this.test(
      (str: string) => str.length >= min && str.length <= max,
      message ||
        `Expect string to be between ${min} and ${max} characters long`,
    );
  }
  /**
   * pattern
   *
   * Checks if the string matches the pattern
   *
   * @param reg RegExp Pattern to match
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  pattern(reg: RegExp, message?: string): GuardianProxy<this> {
    return this.test(
      (str: string) => reg.test(str),
      message || `Expect string to match pattern ${reg.toString()}`,
    );
  }

  /**
   * pan
   *
   * Checks if the string is a valid PAN number (INDIA)
   * *NOTE* - It actually does not confirm the validity, just checks the format
   *
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  pan(message?: string): GuardianProxy<this> {
    return this.pattern(
      /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/,
      message || `Expect string to be a valid PAN`,
    );
  }

  /**
   * aadhaar
   *
   * Checks if the string is a valid AADHAAR number (INDIA)
   * *NOTE* - It actually does not confirm the validity, just checks the format
   *
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  aadhaar(message?: string): GuardianProxy<this> {
    return this.pattern(
      /^[2-9]{1}[0-9]{3}\\s[0-9]{4}\\s[0-9]{4}$/,
      message || `Expect string to be a valid Aadhaar`,
    );
  }

  /**
   * email
   *
   * Checks if the string is a valid email address
   * *NOTE* - It actually does not confirm the validity, just checks the format
   *
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  email(message?: string): GuardianProxy<this> {
    return this.pattern(
      /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
      message || `Expect string to be a valid email`,
    );
  }

  /**
   * mobile
   *
   * Checks if the string is a valid mobile number.
   * *NOTE* - It actually does not confirm the validity, just checks the format
   *
   * @param pattern RegExp Pattern of mobile number to match. Defaults to /^[9|8|7|6][0-9]{9}$/
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  mobile(
    pattern = /^[6-9][0-9]{9}$/,
    message?: string,
  ): GuardianProxy<this> {
    return this.pattern(
      pattern,
      message || `Expect string to be a valid phone number`,
    );
  }

  /**
   * ifsc
   *
   * Checks if the string is a valid banking IFSC code format.
   * *NOTE* - It actually does not confirm the validity, just checks the format
   *
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  ifsc(message?: string): GuardianProxy<this> {
    return this.pattern(
      /^[A-Z]{4}0[A-Z0-9]{6}$/,
      message || `Expect string to be a valid IFSC code`,
    );
  }

  /**
   * gst
   *
   * Checks if the string is a valid GST number.
   * *NOTE* - It actually does not confirm the validity, just checks the format
   *
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  gst(message?: string): GuardianProxy<this> {
    return this.pattern(
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
      message || `Expect string to be a valid GST number`,
    );
  }

  /**
   * ipv4
   *
   * Checks if the string is a valid IPv4 address.
   * *NOTE* - It actually does not confirm the validity, just checks the format
   *
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  ipv4(message?: string): GuardianProxy<this> {
    return this.pattern(
      /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
      message || `Expect string to be a valid IPv4 address`,
    );
  }

  // ipv6(message?: string): GuardianProxy<this>  {
  //   return this.pattern(/^(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?:(?::[0-9a-fA-F]{1,4}){1,6})|:(?:(?::[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(?::[0-9a-fA-F]{0,4}%[0-9a-zA-Z]{1,}|:(?::[0-9a-fA-F]{1,4}){0,2}%[0-9a-zA-Z]{1,})$/, message || `Expect string to be a valid IPv6 address`);
  // }

  /**
   * url
   *
   * Checks if the string is a valid URL.
   *
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  url(message?: string): GuardianProxy<this> {
    return this.pattern(
      /^(?:http(s)?:\/\/)?[\w.-]+(?:\.[\w\.-]+)+[\w\-\._~:/?#[\]@!\$&'\(\)\*\+,;=.]+$/,
      message || `Expect string to be a valid URL`,
    );
  }

  /**
   * domain
   *
   * Checks if the string is a valid domain name.
   * *NOTE* - It actually does not confirm the validity, just checks the format
   *
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  domain(message?: string): GuardianProxy<this> {
    return this.pattern(
      /^(?:http(s)?:\/\/)?[\w.-]+(?:\.[\w\.-]+)+[\w\-\._~:/?#[\]@!\$&'\(\)\*\+,;=.]+$/,
      message || `Expect string to be a valid domain`,
    );
  }

  /**
   * hostName
   *
   * Checks if the string is a valid host name.
   * *NOTE* - It actually does not confirm the validity, just checks the format
   *
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  hostName(message?: string): GuardianProxy<this> {
    return this.pattern(
      /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$/,
      message || `Expect string to be a valid host name`,
    );
  }

  /**
   * uuid
   *
   * Checks if the string is a valid UUID.
   *
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  uuid(message?: string): GuardianProxy<this> {
    return this.pattern(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      message || `Expect string to be a valid UUID`,
    );
  }

  /**
   * card
   *
   * Checks if the string is a valid credit card number.
   * *NOTE* - It actually does not confirm the validity, just checks the format
   *
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  card(message?: string): GuardianProxy<this> {
    return this.pattern(
      /^(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|6(?:011|5[0-9][0-9])[0-9]{12}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|(?:2131|1800|35\d{3})\d{11})$/,
      message || `Expect string to be a valid card number`,
    );
  }

  /**
   * cvv
   *
   * Checks if the string is a valid CVV.
   * *NOTE* - It actually does not confirm the validity, just checks the format
   *
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  cvv(message?: string): GuardianProxy<this> {
    return this.pattern(
      /^[0-9]{3,4}$/,
      message || `Expect string to be a valid CVV`,
    );
  }

  /**
   * visa
   *
   * Checks if the string is a valid Visa card number.
   * *NOTE* - It actually does not confirm the validity, just checks the format
   *
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  visa(message?: string): GuardianProxy<this> {
    return this.pattern(
      /^4[0-9]{12}(?:[0-9]{3})?$/,
      message || `Expect string to be a valid Visa card number`,
    );
  }

  /**
   * mastercard
   *
   * Checks if the string is a valid Mastercard card number.
   * *NOTE* - It actually does not confirm the validity, just checks the format
   *
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  mastercard(message?: string): GuardianProxy<this> {
    return this.pattern(
      /^5[1-5][0-9]{14}$/,
      message || `Expect string to be a valid Mastercard card number`,
    );
  }

  /**
   * amex
   *
   * Checks if the string is a valid American Express card number.
   * *NOTE* - It actually does not confirm the validity, just checks the format
   *
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  amex(message?: string): GuardianProxy<this> {
    return this.pattern(
      /^3[47][0-9]{13}$/,
      message || `Expect string to be a valid American Express card number`,
    );
  }

  /**
   * discover
   *
   * Checks if the string is a valid Discover card number.
   * *NOTE* - It actually does not confirm the validity, just checks the format
   *
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  discover(message?: string): GuardianProxy<this> {
    return this.pattern(
      /^6(?:011|5[0-9]{2})[0-9]{12}$/,
      message || `Expect string to be a valid Discover card number`,
    );
  }

  /**
   * diners
   *
   * Checks if the string is a valid Diners card number.
   * *NOTE* - It actually does not confirm the validity, just checks the format
   *
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  diners(message?: string): GuardianProxy<this> {
    return this.pattern(
      /^3(?:0[0-5]|[68][0-9])[0-9]{11}$/,
      message || `Expect string to be a valid Diners card number`,
    );
  }

  /**
   * jcb
   *
   * Checks if the string is a valid JCB card number.
   * *NOTE* - It actually does not confirm the validity, just checks the format
   *
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  jcb(message?: string): GuardianProxy<this> {
    return this.pattern(
      /^(?:2131|1800|35\d{3})\d{11}$/,
      message || `Expect string to be a valid JCB card number`,
    );
  }

  /**
   * rupay
   *
   * Checks if the string is a valid RuPay card number.
   * *NOTE* - It actually does not confirm the validity, just checks the format
   *
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  rupay(message?: string): GuardianProxy<this> {
    return this.pattern(
      /^6(?!011)(?:0[0-9]{14}|52[12][0-9]{12})$/,
      message || `Expect string to be a valid Rupay card number`,
    );
  }

  /**
   * upiId
   *
   * Checks if the string is a valid UPI ID.
   * *NOTE* - It actually does not confirm the validity, just checks the format
   *
   * @param message string Message to use when validation fails
   * @returns GuardianProxy<this>
   */
  upiId(message?: string): GuardianProxy<this> {
    return this.pattern(
      /^[a-zA-Z0-9]{12}$/,
      message || `Expect string to be a valid UPI ID`,
    );
  }

  /**
   * pinCode
   *
   * Validates if the provided value is a valid pincode
   *
   * @param regex RegExp The pin code pattern to match
   * @param message String The message to use when validation fails
   * @returns GuardianProxy<this>
   */
  pinCode(
    regex = /^[1-9]{1}[0-9]{2}\\s{0, 1}[0-9]{3}$/,
    message?: string,
  ): GuardianProxy<this> {
    return this.pattern(
      regex,
      message || `Expect string to be a valid pin code`,
    );
  }
  //#endregion Validators
}

export const stringGuard = new StringGuardian(type("string")).proxy();
