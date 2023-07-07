import { Options } from '../options/mod.ts';
import { path } from '../dependencies.ts';

type RESTlerEvents = {
  start: () => void;
  success: () => void;
  error: () => void;
  timeout: () => void;
  run: () => void;
};

type RESTlerOptions = {
  endpointURL: string;
  timeout: number;
  version?: string;
};

class RESTler<T extends RESTlerOptions> extends Options<T, RESTlerEvents> {
  constructor(options: Partial<T>) {
    const def: Partial<RESTlerOptions> = {
      // timeout: 60000,
      timeout: options.timeout || 60000,
    };
    super(options, def as Partial<T>);
  }

  protected _makeEndpoint(
    endPoint: string,
    searchParams?: URLSearchParams,
  ): string {
    const url = new URL(
      path.posix.join(this._getOption('endpointURL'), endPoint),
    );
    if (searchParams) {
      searchParams.sort();
      url.search = searchParams.toString();
    }
    return url.toString();
  }
}
