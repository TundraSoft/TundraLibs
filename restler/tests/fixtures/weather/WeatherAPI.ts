import { RESTler } from '../../../RESTler.ts';
import type {
  RESTlerEndpoint,
  RESTlerMethodPayload,
  RESTlerOptions,
  RESTlerRequestOptions,
} from '../../../types/mod.ts';
import type { ForecastResponse, WeatherResponse } from './types.ts';

/**
 * Example client for OpenWeatherMap API, which requires API key authentication
 * https://openweathermap.org/api
 */
export class WeatherAPI extends RESTler {
  public readonly vendor = 'OpenWeatherMap';
  private readonly apiKey: string;

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

    this.apiKey = apiKey;
  }

  /**
   * Override the auth injector to add API key to all requests
   */
  protected override _authInjector(
    request: RESTlerEndpoint,
    _options: RESTlerMethodPayload & RESTlerRequestOptions,
  ): void {
    // Add the API key to the request query parameters
    request.query = {
      ...request.query,
      appid: this.apiKey,
    };
  }

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
    const response = await this._makeRequest<WeatherResponse>(
      {
        path: '/weather',
        query: {
          q: city,
          units: units,
        },
      },
      { method: 'GET' },
    );
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
    const response = await this._makeRequest<WeatherResponse>(
      {
        path: '/weather',
        query: {
          lat: lat.toString(),
          lon: lon.toString(),
          units: units,
        },
      },
      { method: 'GET' },
    );
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
    const response = await this._makeRequest<ForecastResponse>(
      {
        path: '/forecast',
        query: {
          q: city,
          units: units,
        },
      },
      { method: 'GET' },
    );
    return response.body || null;
  }
}
