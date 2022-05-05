import { IN_MOBILE_REGEX } from "./constants.ts";

export default {
  /**
   * regexMatch
   * Matches data against a provided pattern
   *
   * @param data string - The Data to match
   * @param pattern RegExp - The pattern to match against
   * @returns boolean - True if it matches, false if it does not
   */
  regexMatch(data: string, pattern: RegExp): boolean {
    return pattern.test(data);
  },
  /**
   * mobile
   * Validates if provided data looks like valid mobile number
   *
   * @param data string - The Data to check
   * @param format RegExp - The pattern to match against
   * @returns boolean - True if it matches, false if it does not
   */
  mobile(data: number, format: RegExp = IN_MOBILE_REGEX): boolean {
    return this.regexMatch(data.toString(), format);
  },
  /**
   * email
   * Validates if given string is valid email address or not
   *
   * @param data string - The Data to check
   * @returns boolean - True if it matches, false if it does not
   */
  email(data: string): boolean {
    return this.regexMatch(
      data,
      /^[a-zA-Z0-9_+&*-]+(?:\.[a-zA-Z0-9_+&*-]+)*@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,7}$/,
    );
  },
  /**
   * pan
   * Checks if the provided data is a valid Permanent Account Number (PAN)
   * *NOTE* Does not check if it is actual PAN, just if it matches the format
   *
   * @param data string - The Data to check
   * @returns boolean - True if it matches, false if it does not
   */
  pan(data: string): boolean {
    return this.regexMatch(data, /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/);
  },
  /**
   * aadhaar
   * Checks if provided data is valid AADHAAR number
   * *NOTE* Does not check if AADHAAR exists, only if it matches pattern
   *
   * @param data string - The Data to check
   * @returns boolean - True if it matches, false if it does not
   */
  aadhaar(data: string): boolean {
    return this.regexMatch(data, /^[2-9]{1}[0-9]{3}\\s[0-9]{4}\\s[0-9]{4}$/);
  },
  /**
   * ifsc
   * Checks if the provided data matches valid IFSC code
   * *NOTE* Does not check if IFSC exists
   *
   * @param data string - The Data to check
   * @returns boolean - True if it matches, false if it does not
   */
  ifsc(data: string): boolean {
    return this.regexMatch(data, /^[A-Z]{4}0[A-Z0-9]{6}$/);
  },
  /**
   * gst
   * Checks if provided data matches valid GST code
   * *NOTE* Does not check if GST number exists.
   *
   * @param data string - The Data to check
   * @returns boolean - True if it matches, false if it does not
   */
  gst(data: string): boolean {
    return this.regexMatch(
      data,
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
    );
  },
  /**
   * ipv4
   * Checks if provided data is a valid IPV4 address
   *
   * @param data string - The Data to check
   * @returns boolean - True if it matches, false if it does not
   */
  ipv4(data: string): boolean {
    return this.regexMatch(
      data,
      /^((25[0-5]|(2[0-4]|1\d|[1-9]|)\d)(\.(?!$)|$)){4}$/,
    );
  },
};
