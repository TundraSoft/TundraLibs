export class RESTlerBaseError extends Error {
  protected static _module = 'restler';
  protected _endpoint: string | undefined = undefined;

  constructor(message: string, endpoint?: string) {
    super(RESTlerBaseError._makeMessage(message, endpoint));
    this._endpoint = endpoint;
    Object.setPrototypeOf(this, RESTlerBaseError.prototype);
  }

  get endpoint(): string | undefined {
    return this._endpoint;
  }

  protected static _makeMessage(
    message: string,
    endpoint?: string,
  ): string {
    return `[module='${RESTlerBaseError._module}'${
      (endpoint !== undefined) ? ` endpoint='${endpoint}'` : ``
    }] ${message}`;
  }
}
