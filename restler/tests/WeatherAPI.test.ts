import * as asserts from '$asserts';
import { WeatherAPI } from './fixtures/weather/WeatherAPI.ts';
import type {
  ForecastResponse,
  WeatherResponse,
} from './fixtures/weather/types.ts';

// Store original fetch
const originalFetch = globalThis.fetch;

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

// Function to setup API and mock fetch with param tracking
const setupWeatherTest = () => {
  let capturedParams = {
    apiKey: null as string | null,
    units: null as string | null,
  };

  globalThis.fetch = async (input: string | URL | Request) => {
    const url = input.toString();
    const urlObj = new URL(url);

    // Capture query parameters for verification
    capturedParams.apiKey = urlObj.searchParams.get('appid');
    capturedParams.units = urlObj.searchParams.get('units');

    if (url.includes('/weather')) {
      return new Response(
        JSON.stringify(mockWeatherResponse),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    } else if (url.includes('/forecast')) {
      return new Response(
        JSON.stringify(mockForecastResponse),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      '{}',
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  };

  const API_KEY = 'test-api-key-12345';
  const api = new WeatherAPI(API_KEY);

  return { api, capturedParams };
};

const cleanupMock = () => {
  globalThis.fetch = originalFetch;
};

Deno.test('RESTler.Example', async (h) => {
  await h.step('WeatherAPI', async (t) => {
    await t.step('should include API key in requests', async () => {
      try {
        const { api, capturedParams } = setupWeatherTest();
        await api.getCurrentWeather('London');
        asserts.assertEquals(capturedParams.apiKey, 'test-api-key-12345');
      } finally {
        cleanupMock();
      }
    });

    await t.step('should get current weather by city name', async () => {
      try {
        const { api } = setupWeatherTest();
        const weather = await api.getCurrentWeather('London');
        asserts.assertNotEquals(weather, null);
        asserts.assertEquals(weather?.name, 'London');
        asserts.assertEquals(weather?.main.temp, 15.5);
      } finally {
        cleanupMock();
      }
    });

    await t.step('should get current weather by coordinates', async () => {
      try {
        const { api, capturedParams } = setupWeatherTest();
        const weather = await api.getWeatherByCoordinates(51.5085, -0.1257);
        asserts.assertNotEquals(weather, null);
        asserts.assertEquals(weather?.name, 'London');
        asserts.assert(capturedParams.apiKey !== null);
      } finally {
        cleanupMock();
      }
    });

    await t.step('should get weather forecast', async () => {
      try {
        const { api } = setupWeatherTest();
        const forecast = await api.getForecast('London');
        asserts.assertNotEquals(forecast, null);
        asserts.assertEquals(forecast?.city.name, 'London');
        asserts.assertEquals(forecast?.list.length, 1);
      } finally {
        cleanupMock();
      }
    });

    await t.step('should include units in requests', async () => {
      try {
        const { api, capturedParams } = setupWeatherTest();
        await api.getCurrentWeather('London', 'imperial');
        asserts.assertEquals(capturedParams.units, 'imperial');
      } finally {
        cleanupMock();
      }
    });
  });
});
