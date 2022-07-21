import { Validator } from "./BaseValidator.ts";
import { type } from "./utils.ts";
import type { FunctionType, ValidatorProxy, FunctionParameters } from "./types.ts";


export class StringValidator<
  P extends FunctionParameters = [string],
> extends Validator<FunctionType<string, P>> {

  //#region Generators
  genUUID(): ValidatorProxy<this>  {
    return this.transform(() => crypto.randomUUID().toString());
  }

  //#region Manipulators
  capitalize(): ValidatorProxy<this> {
    return this.transform((str: string) => str.charAt(0).toUpperCase() + str.slice(1));
  }
  //#endregion Manipulators

  //#region Validators
  min(len: number, message?: string): ValidatorProxy<this>  {
    return this.test((str: string) => str.length >= len, message || `Expect string to be at least ${len} characters long`);
  }

  max(len: number, message?: string): ValidatorProxy<this>  { 
    return this.test((str: string) => str.length <= len, message || `Expect string to be at most ${len} characters long`);
  }

  pattern(reg: RegExp, message?: string): ValidatorProxy<this>  {
    return this.test((str: string) => reg.test(str), message || `Expect string to match pattern ${reg.toString()}`);
  }

  pan(message?: string): ValidatorProxy<this>  {
    return this.pattern(/^[a-zA-Z]{2}[0-9]{2}[a-zA-Z]{1}[0-9]{6}$/, message || `Expect string to be a valid PAN`);
  }

  aadhaar(message?: string): ValidatorProxy<this>  {
    return this.pattern(/^\d{4} \d{4} \d{4}$/, message || `Expect string to be a valid Aadhaar`);
  }

  email(message?: string): ValidatorProxy<this>  {
    return this.pattern(/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/, message || `Expect string to be a valid email`);
  }

  phone(pattern = /^[9|8|7|6][0-9]{9}$/, message?: string): ValidatorProxy<this>  {
    return this.pattern(pattern, message || `Expect string to be a valid phone number`);
  }

  ifsc(message?: string): ValidatorProxy<this>  {
    return this.pattern(/^[A-Z]{4}0[A-Z0-9]{6}$/, message || `Expect string to be a valid IFSC code`);
  }

  gst(message?: string): ValidatorProxy<this>  {
    return this.pattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, message || `Expect string to be a valid GST number`);
  }

  ipv4(message?: string): ValidatorProxy<this>  {
    return this.pattern(/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/, message || `Expect string to be a valid IPv4 address`);
  }

  // ipv6(message?: string): ValidatorProxy<this>  {
  //   return this.pattern(/^(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?:(?::[0-9a-fA-F]{1,4}){1,6})|:(?:(?::[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(?::[0-9a-fA-F]{0,4}%[0-9a-zA-Z]{1,}|:(?::[0-9a-fA-F]{1,4}){0,2}%[0-9a-zA-Z]{1,})$/, message || `Expect string to be a valid IPv6 address`);
  // }

  url(message?: string): ValidatorProxy<this>  {
    return this.pattern(/^(?:http(s)?:\/\/)?[\w.-]+(?:\.[\w\.-]+)+[\w\-\._~:/?#[\]@!\$&'\(\)\*\+,;=.]+$/, message || `Expect string to be a valid URL`);
  }

  domain(message?: string): ValidatorProxy<this>  {
    return this.pattern(/^(?:http(s)?:\/\/)?[\w.-]+(?:\.[\w\.-]+)+[\w\-\._~:/?#[\]@!\$&'\(\)\*\+,;=.]+$/, message || `Expect string to be a valid domain`);
  }

  hostName(message?: string): ValidatorProxy<this>  {
    return this.pattern(/^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$/, message || `Expect string to be a valid host name`);
  }

  uuid(message?: string): ValidatorProxy<this>  {
    return this.pattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, message || `Expect string to be a valid UUID`);
  }
  
  //#endregion Validators
}

export const StringType = new StringValidator(type("string")).proxy();

const a = StringType.genUUID().max(36).optional();

console.log(a());