import { RESTler, RESTlerRequestError } from '../../../mod.ts';
import type {
  RESTlerEndpoint,
  RESTlerOptions,
  RESTlerResponseHandler,
} from '../../../mod.ts';
import type { ForecastResponse, WeatherResponse } from './types.ts';

/**
 * Example client for OpenWeatherMap API, which requires API key authentication
 * https://openweathermap.org/api
 */
export class WeatherAPI extends RESTler {
  public readonly vendor = 'OpenWeatherMap';
  private readonly __apiKey: string;

  /**
   * Create a new OpenWeatherMap API client
   * @param apiKey Your OpenWeatherMap API key
   * @param options Additional RESTler options
   */
  constructor(apiKey: string, options?: Partial<RESTlerOptions>) {
    super({
      baseURL: 'https://api.openweathermap.org/data/2.5',
      ...options,
    });

    this.__apiKey = apiKey;
  }

  /**
   * Substitute the `fetch` implementation used by this instance. Exposed as a
   * test seam so tests can supply a stub `fetch` without reassigning the
   * global `fetch` (which compat captures at import time).
   */
  public setFetch(fn: typeof fetch) {
    this._fetch = fn;
  }

  /**
   * Override the auth injector to add the API key to all requests.
   */
  protected override _authInjector(
    endpoint: RESTlerEndpoint,
  ): void {
    // Add the API key to the request query parameters
    endpoint.query = {
      ...endpoint.query,
      appid: this.__apiKey,
    };
  }

  /**
   * OpenWeatherMap reports errors via a `cod` field inside the JSON body
   * (e.g. `{"cod":"404","message":"city not found"}`), so this vendor-wide
   * response handler translates that convention into a thrown
   * {@link RESTlerRequestError}. It applies to every request unless a
   * per-call handler is passed to `_makeRequest` (which takes precedence).
   */
  protected override _responseHandler: RESTlerResponseHandler = (response) => {
    const body = response.body as
      | { cod?: number | string; message?: string }
      | undefined;
    if (body?.cod !== undefined && Number(body.cod) >= 400) {
      throw new RESTlerRequestError(
        body.message ?? `OpenWeatherMap reported error cod ${body.cod}`,
        {
          vendor: this.vendor,
          request: { url: response.url, method: 'GET', timeout: 30 },
        },
      );
    }
  };

  /**
   * Get current weather for a city
   * @param city City name (e.g., "London,uk")
   * @param units Units of measurement (metric or imperial)
   * @returns Current weather data or null if not found
   */
  async getCurrentWeather(
    city: string,
    units: 'metric' | 'imperial' = 'metric',
  ): Promise<WeatherResponse | null> {
    const response = await this._makeRequest<WeatherResponse>({
      path: '/weather',
      method: 'GET',
      query: {
        q: city,
        units: units,
      },
    });
    return response.body || null;
  }

  /**
   * Get current weather by geographic coordinates
   * @param lat Latitude coordinate
   * @param lon Longitude coordinate
   * @param units Units of measurement (metric or imperial)
   * @returns Current weather data or null if not found
   */
  async getWeatherByCoordinates(
    lat: number,
    lon: number,
    units: 'metric' | 'imperial' = 'metric',
  ): Promise<WeatherResponse | null> {
    const response = await this._makeRequest<WeatherResponse>({
      path: '/weather',
      method: 'GET',
      query: {
        lat: lat.toString(),
        lon: lon.toString(),
        units: units,
      },
    });
    return response.body || null;
  }

  /**
   * Get 5-day forecast for a city
   * @param city City name (e.g., "London,uk")
   * @param units Units of measurement (metric or imperial)
   * @returns Forecast data or null if not found
   */
  async getForecast(
    city: string,
    units: 'metric' | 'imperial' = 'metric',
  ): Promise<ForecastResponse | null> {
    const response = await this._makeRequest<ForecastResponse>({
      path: '/forecast',
      method: 'GET',
      query: {
        q: city,
        units: units,
      },
    });
    return response.body || null;
  }
}
