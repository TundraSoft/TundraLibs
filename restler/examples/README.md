# RESTler Example API Integrations

This directory contains example implementations of API clients using the RESTler library.

## Examples

### 1. JSONPlaceholder API

A simple public API with no authentication.

```typescript
import { JSONPlaceholderAPI } from './jsonplaceholder/JSONPlaceholderAPI.ts';

// Create client
const jsonApi = new JSONPlaceholderAPI();

// Make requests
const posts = await jsonApi.getPosts();
const user = await jsonApi.getUser(1);
const newPost = await jsonApi.createPost({
  userId: 1,
  title: 'My New Post',
  body: 'This is the content of my post.',
});
```

### 2. OpenWeatherMap API

An API requiring API key authentication.

```typescript
import { WeatherAPI } from './weather/WeatherAPI.ts';

// Create client with API key
const weatherApi = new WeatherAPI('your-api-key-here');

// Make requests
const londonWeather = await weatherApi.getCurrentWeather('London,uk');
const forecast = await weatherApi.getForecast('New York,us', 'imperial');
const locationWeather = await weatherApi.getWeatherByCoordinates(
  40.7128,
  -74.0060,
);
```

### 3. Docker API

A Unix socket API example.

```typescript
import { DockerAPI } from './docker/DockerAPI.ts';

// Create client (defaults to /var/run/docker.sock)
const dockerApi = new DockerAPI();

// Make requests
const containers = await dockerApi.listContainers(true);
const images = await dockerApi.listImages();
const info = await dockerApi.getSystemInfo();

// Container management
await dockerApi.startContainer('container-id');
await dockerApi.stopContainer('container-id');
```

## Running the Examples

These examples demonstrate how to structure API clients using RESTler. To run them:

1. Make sure you have Deno installed
2. For the Weather API, you'll need an API key from [OpenWeatherMap](https://openweathermap.org/api)
3. For the Docker API, you'll need Docker installed and running

You can run an example like this:

```bash
deno run --allow-net --allow-read --allow-env example-script.ts
```

Where `example-script.ts` imports and uses one of the example API clients.
