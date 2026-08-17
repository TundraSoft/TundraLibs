import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { RESTlerRequestError } from '../mod.ts';
import type { RESTlerResponseHandler } from '../mod.ts';
import { WeatherAPI } from './fixtures/weather/WeatherAPI.ts';
import type {
  ForecastResponse,
  WeatherResponse,
} from './fixtures/weather/types.ts';

// Mock data
const mockWeatherResponse: WeatherResponse = {
  coord: {
    lon: -0.1257,
    lat: 51.5085,
  },
  weather: [
    {
      id: 803,
      main: 'Clouds',
      description: 'broken clouds',
      icon: '04d',
    },
  ],
  base: 'stations',
  main: {
    temp: 15.5,
    feels_like: 14.9,
    temp_min: 13.7,
    temp_max: 16.7,
    pressure: 1013,
    humidity: 76,
  },
  visibility: 10000,
  wind: {
    speed: 4.12,
    deg: 220,
  },
  clouds: {
    all: 75,
  },
  dt: 1665496192,
  sys: {
    type: 2,
    id: 2019646,
    country: 'GB',
    sunrise: 1665470880,
    sunset: 1665510929,
  },
  timezone: 3600,
  id: 2643743,
  name: 'London',
  cod: 200,
};

const mockForecastResponse: ForecastResponse = {
  cod: '200',
  message: 0,
  cnt: 1,
  list: [
    {
      dt: 1665496192,
      main: {
        temp: 15.5,
        feels_like: 14.9,
        temp_min: 13.7,
        temp_max: 16.7,
        pressure: 1013,
        sea_level: 1013,
        grnd_level: 1010,
        humidity: 76,
        temp_kf: 0,
      },
      weather: [
        {
          id: 803,
          main: 'Clouds',
          description: 'broken clouds',
          icon: '04d',
        },
      ],
      clouds: {
        all: 75,
      },
      wind: {
        speed: 4.12,
        deg: 220,
        gust: 5.5,
      },
      visibility: 10000,
      pop: 0,
      sys: {
        pod: 'd',
      },
      dt_txt: '2022-10-11 12:00:00',
    },
  ],
  city: {
    id: 2643743,
    name: 'London',
    coord: {
      lat: 51.5085,
      lon: -0.1257,
    },
    country: 'GB',
    population: 1000000,
    timezone: 3600,
    sunrise: 1665470880,
    sunset: 1665510929,
  },
};

// Function to setup API and mock fetch (via the instance seam) with request
// tracking. The mock captures both the query parameters and the RequestInit
// (e.g. method) the single-arg API builds so tests can assert on them.
const setupWeatherTest = () => {
  const capturedParams = {
    apiKey: null as string | null,
    units: null as string | null,
    lat: null as string | null,
    lon: null as string | null,
    method: null as string | null,
  };

  const mockFetch: typeof fetch = (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const url = input.toString();
    const urlObj = new URL(url);

    // Capture query parameters for verification
    capturedParams.apiKey = urlObj.searchParams.get('appid');
    capturedParams.units = urlObj.searchParams.get('units');
    capturedParams.lat = urlObj.searchParams.get('lat');
    capturedParams.lon = urlObj.searchParams.get('lon');
    // Capture the RequestInit the single-arg API built for this call.
    capturedParams.method = init?.method ?? null;

    if (url.includes('/weather')) {
      return Promise.resolve(
        new Response(
          JSON.stringify(mockWeatherResponse),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    } else if (url.includes('/forecast')) {
      return Promise.resolve(
        new Response(
          JSON.stringify(mockForecastResponse),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    }

    return Promise.resolve(
      new Response(
        '{}',
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  };

  const API_KEY = 'test-api-key-12345';
  const api = new WeatherAPI(API_KEY);
  api.setFetch(mockFetch);

  return { api, capturedParams };
};

// OpenWeatherMap-style vendor error: HTTP 200 whose JSON body carries the
// real failure in a `cod` field. The fixture's vendor-wide `_responseHandler`
// translates this into a thrown RESTlerRequestError.
const vendorErrorFetch: typeof fetch = () =>
  Promise.resolve(
    new Response(
      JSON.stringify({ cod: '404', message: 'city not found' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ),
  );

/**
 * Minimal test-only subclass demonstrating per-call precedence: the second
 * argument of `_makeRequest` overrides the vendor-wide `_responseHandler`.
 * The fixture's domain methods don't expose that argument, so this subclass
 * adds one method that does.
 */
class PerCallWeatherAPI extends WeatherAPI {
  getCurrentWeatherWith(
    city: string,
    handler: RESTlerResponseHandler<
      { cod?: number | string; message?: string }
    >,
  ) {
    return this._makeRequest<{ cod?: number | string; message?: string }>(
      {
        path: '/weather',
        method: 'GET',
        query: { q: city, units: 'metric' },
      },
      { responseHandler: handler },
    );
  }
}

describe('restler.examples.weatherAPI', () => {
  describe('WeatherAPI', () => {
    it('should include API key in requests', async () => {
      const { api, capturedParams } = setupWeatherTest();
      await api.getCurrentWeather('London');
      asserts.assertEquals(capturedParams.apiKey, 'test-api-key-12345');
      // The single-arg API builds a GET request — lock that in.
      asserts.assertEquals(capturedParams.method, 'GET');
    });

    it('should get current weather by city name', async () => {
      const { api } = setupWeatherTest();
      const weather = await api.getCurrentWeather('London');
      asserts.assertNotEquals(weather, null);
      asserts.assertEquals(weather?.name, 'London');
      asserts.assertEquals(weather?.main.temp, 15.5);
    });

    it('should get current weather by coordinates', async () => {
      const { api, capturedParams } = setupWeatherTest();
      const weather = await api.getWeatherByCoordinates(51.5085, -0.1257);
      asserts.assertNotEquals(weather, null);
      asserts.assertEquals(weather?.name, 'London');
      // The coordinates must reach the request unchanged.
      asserts.assertEquals(capturedParams.lat, '51.5085');
      asserts.assertEquals(capturedParams.lon, '-0.1257');
      asserts.assertEquals(capturedParams.apiKey, 'test-api-key-12345');
    });

    it('should get weather forecast', async () => {
      const { api } = setupWeatherTest();
      const forecast = await api.getForecast('London');
      asserts.assertNotEquals(forecast, null);
      asserts.assertEquals(forecast?.city.name, 'London');
      asserts.assertEquals(forecast?.list.length, 1);
    });

    it('should default to metric units in requests', async () => {
      const { api, capturedParams } = setupWeatherTest();
      await api.getCurrentWeather('London');
      asserts.assertEquals(capturedParams.units, 'metric');
    });

    it('should include units in requests', async () => {
      const { api, capturedParams } = setupWeatherTest();
      await api.getCurrentWeather('London', 'imperial');
      asserts.assertEquals(capturedParams.units, 'imperial');
    });

    describe('Response handler', () => {
      it('should throw RESTlerRequestError for an HTTP 200 whose body carries a vendor error', async () => {
        const api = new WeatherAPI('test-api-key-12345');
        api.setFetch(vendorErrorFetch);
        // OWM returns HTTP 200 with {"cod":"404","message":"city not found"}
        // — the vendor-wide handler surfaces it as a RESTlerRequestError.
        await asserts.assertRejects(
          () => api.getCurrentWeather('Atlantis'),
          RESTlerRequestError,
          'city not found',
        );
      });

      it('should still resolve successful responses (cod: 200) with the handler in place', async () => {
        const { api } = setupWeatherTest();
        const weather = await api.getCurrentWeather('London');
        asserts.assertNotEquals(weather, null);
        asserts.assertEquals(weather?.cod, 200);
        asserts.assertEquals(weather?.name, 'London');
        const forecast = await api.getForecast('London');
        asserts.assertNotEquals(forecast, null);
        asserts.assertEquals(forecast?.cod, '200');
      });

      it('should let a per-call handler take precedence over the vendor default', async () => {
        const api = new PerCallWeatherAPI('test-api-key-12345');
        api.setFetch(vendorErrorFetch);
        let perCallRan = false;
        // The per-call handler overrides the vendor default — which would
        // have thrown on cod >= 400 — so the request resolves. It must
        // explicitly return `response.body` to leave it unchanged; the
        // return value IS the result now, there is no mutate-in-place path.
        const response = await api.getCurrentWeatherWith('Atlantis', (r) => {
          perCallRan = true;
          return r.body as { cod?: number | string; message?: string };
        });
        asserts.assert(perCallRan);
        asserts.assertEquals(response.status, 200);
        asserts.assertEquals(response.body?.message, 'city not found');
      });
    });
  });
});
