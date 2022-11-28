import type { iOTPOptions } from './types.ts';
import { Options } from '/root/options/mod.ts';
import { alphaNumericCase, nanoid } from '/root/nanoid/mod.ts';
import { sprintf } from '/root/dependencies.ts';

export class OTP extends Options<iOTPOptions> {
  #key!: CryptoKey;

  /**
   * constructor
   * Initialization of class by passing the options. Options are:
   * {
   *    algo: OTPAlgo,
   *    type: OTPType, // HOTP or TOTP
   *    length: number, // length of the OTP
   *    key?: string, // Optional, if null is passed then one will be generated
   *    counter?: number, // Used for HOTP, the counter or hash value last used
   *    period?: number // Time window for which otp is valid for TOTP. Defaults to 30 sec
   * }
   *
   * @param options iOTPOptions Options for class initialization
   */
  constructor(options: iOTPOptions) {
    // if(!options.key) {
    //   options.key = OTP.newKey()
    // }
    // if(options.type === "TOTP" && !options.period) {
    //   options.period = 30;
    // }
    // if(options.type === "HOTP" && !options.counter) {
    //   options.counter = -1;
    // }
    const defaults = {
      period: 30,
      counter: -30,
      key: OTP.newKey(),
    };
    super(options, defaults);
  }

  /**
   * newKey
   * Generates a new key for OTP. The length of the key can be varied as
   * required, but it is recomended to have a minimum key size of 32
   *
   * @param length number The length of the key to generate
   * @returns string The generated key
   */
  public static newKey(length = 32): string {
    return nanoid(length, alphaNumericCase);
  }

  /**
   * generate(counter?: number)
   * Generates an OTP (HOTP or TOTP). Basis type HOTP and TOTP, OTP is generated.
   *
   * @param counter number Counter value to generate OTP for specific time or hash
   * @returns Promise<string> The OTP value
   */
  public async generate(counter?: number): Promise<string> {
    if (this.#key === undefined) {
      await this._importKey();
    }
    if (counter === undefined) {
      switch (this._getOption('type')) {
        case 'HOTP':
          if (this._options.counter === undefined) {
            counter = 0;
          } else {
            counter = this._options.counter + 1;
          }
          // Set the counter value to current
          this._options.counter = counter;
          break;
        case 'TOTP':
          counter = Math.floor(
            Date.now() / 1000 / (this._getOption('period') || 30),
          );
          break;
      }
    }
    const digest = new Uint8Array(
      await crypto.subtle.sign('HMAC', this.#key, this._toInt8Array(counter)),
    );
    const offset = digest[digest.byteLength - 1] & 15;
    const len = this._getOption('length');
    const op = ((
      ((digest[offset] & 127) << 24) |
      ((digest[offset + 1] & 255) << 16) |
      ((digest[offset + 2] & 255) << 8) |
      (digest[offset + 3] & 255)
    ) % (10 ** len)).toString();
    // return op.toString();
    return sprintf('%0' + len + 's', op);
  }

  /**
   * validate(value: string, iteration: number = 1)
   * Validates the value provided by re-generating OTP within the provided window.
   * For TOTP, the timewindow starts from now and iterates till iteration = 0.
   * For HOTP, the counter value starts are current, iterates till iteration = 0
   * NOTE - The counter value in HOTP is not overridden.
   *
   * @param value string The OTP value to check for
   * @param iteration number Number of windows to check. Defaults to 1
   * @returns Promise<boolean> True if OTP value matches within the iteration
   */
  public async validate(
    value: string,
    iteration = 1,
  ): Promise<boolean> {
    if (this.#key === undefined) {
      await this._importKey();
    }
    let counter: number;
    switch (this._getOption('type')) {
      case 'HOTP':
        counter = this._getOption('counter') || 0;
        break;
      case 'TOTP':
        counter = Math.floor(
          Date.now() / 1000 / (this._getOption('period') || 30),
        );
        break;
    }
    while (iteration > 0) {
      const otp: string = await this.generate(counter);
      // Check
      if (value === otp) {
        return true;
      }
      // We need to reduce counter
      counter--;
      iteration--;
    }
    return false;
  }

  /**
   * export()
   * Exports the options so that it can be stored and re-imported later on.
   *
   * @returns iOTPOptions The options value which can be serialised and stored
   */
  public export(): iOTPOptions {
    const config = {
      algo: this._options.algo,
      type: this._options.type,
      length: this._options.length,
      key: this._options.key,
      counter: this._options.counter,
      period: this._options.period,
    };
    if (this._options.type === 'HOTP') {
      delete config.period;
    }
    if (this._options.type === 'TOTP') {
      delete config.counter;
    }
    return config as iOTPOptions;
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
   * _toInt8Array(data: number)
   *
   * @param data number Number to convert to Uint8Array
   * @returns Uint8Array encoded data
   */
  protected _toInt8Array(data: number): Uint8Array {
    // const buff = new ArrayBuffer(8);
    const arr = new Uint8Array(8);
    let acc = data;
    for (let i = 7; i >= 0; i--) {
      if (acc === 0) {
        break;
      }
      arr[i] = acc & 255;
      acc -= arr[i];
      acc /= 256;
    }
    return arr;
  }

  /**
   * _importKey()
   *
   * Imports the provided key
   */
  protected async _importKey() {
    this.#key = await crypto.subtle.importKey(
      'raw',
      this._encode(this._getOption('key')),
      { name: 'HMAC', hash: this._getOption('algo') },
      false,
      ['sign', 'verify'],
    );
  }
}
