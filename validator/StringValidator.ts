import { BaseValidator } from "./BaseValidator.ts";

export class StringValidator extends BaseValidator<string> {
  /**
   * minLength
   *
   * Checks if the string is greater than minimum length
   *
   * @param len number Length
   * @param data string The error message
   */
  minLength(len: number, message: string) {
    this._addTest((value: string) => value.length >= len, message);
    return this;
  }
  /**
   * maxLength
   *
   * Checks if the string is lesser than maximum length
   *
   * @param len number Length
   * @param message string The error message
   */
  maxLength(len: number, message: string) {
    this._addTest((value: string) => value.length <= len, message);
    return this;
  }
  /**
   * regexMatch
   *
   * Matches data against a provided pattern
   *
   * @param pattern RegExp - The pattern to match against
   * @param message string - The error message
   */
  pattern(pattern: RegExp, message: string) {
    this._addTest((value: string) => pattern.test(value), message);
    return this;
  }
  /**
   * email
   *
   * Validates if given string is valid email address or not
   *
   * @param message string - The error message
   */
  email(message: string) {
    return this.pattern(
      /^[a-zA-Z0-9_+&*-]+(?:\.[a-zA-Z0-9_+&*-]+)*@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,7}$/,
      message,
    );
  }
  /**
   * pan
   *
   * Checks if the provided data is a valid Permanent Account Number (PAN)
   * *NOTE* Does not check if it is actual PAN, just if it matches the format
   *
   * @param message string - The error message
   */
  pan(message: string) {
    return this.pattern(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, message);
  }
  /**
   * aadhaar
   *
   * Checks if provided data is valid AADHAAR number
   * *NOTE* Does not check if AADHAAR exists, only if it matches pattern
   *
   * @param message string - The error message
   */
  aadhaar(message: string) {
    return this.pattern(/^[2-9]{1}[0-9]{3}\\s[0-9]{4}\\s[0-9]{4}$/, message);
  }
  /**
   * ifsc
   *
   * Checks if the provided data matches valid IFSC code
   * *NOTE* Does not check if IFSC exists
   *
   * @param message string - The error message
   */
  ifsc(message: string) {
    return this.pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/, message);
  }
  /**
   * gst
   *
   * Checks if provided data matches valid GST code
   * *NOTE* Does not check if GST number exists.
   *
   * @param message string - The error message
   */
  gst(message: string) {
    return this.pattern(
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
      message,
    );
  }
  /**
   * ipv4
   *
   * Checks if provided data is a valid IPV4 address
   *
   * @param message string - The error message
   */
  ipv4(message: string) {
    return this.pattern(
      /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)(\.(?!$)|$)){4}$/,
      message,
    );
  }
}
