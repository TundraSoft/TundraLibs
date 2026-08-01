import { describe, it } from '@tundralibs/compat/test';
import { OS } from '@tundralibs/compat';
import * as asserts from '@std/asserts';
import { RESTlerConfigError } from '../mod.ts';
import type { RESTlerOptions } from '../mod.ts';
import { DockerAPI } from './fixtures/docker/DockerAPI.ts';
import type {
  DockerContainer,
  DockerImage,
  DockerInfo,
} from './fixtures/docker/types.ts';

/**
 * Docker Engine API tests.
 *
 * The Docker Engine API talks over a Unix domain socket. With the new
 * RESTler/compat stack the socket transport is resolved inside compat's
 * `fetch` (via `init.unix`), so requests go through the `_fetch` seam
 * rather than `globalThis.fetch` / `Deno.connect`. These tests drive the
 * shared `fixtures/docker/DockerAPI.ts` client (migrated to the
 * one-argument `_makeRequest(endpoint)` API) and stub the request path via
 * the client's `setFetch` seam, so no network or Unix socket is required.
 */

// Mock data
const mockContainers: DockerContainer[] = [
  {
    Id: 'container123',
    Names: ['/test-container'],
    Image: 'ubuntu:latest',
    ImageID: 'sha256:abc123',
    Command: 'bash',
    Created: 1665496192,
    State: 'running',
    Status: 'Up 2 hours',
    Ports: [
      {
        PrivatePort: 80,
        PublicPort: 8080,
        Type: 'tcp',
      },
    ],
    Labels: { 'com.example.label': 'test' },
    HostConfig: {
      NetworkMode: 'bridge',
    },
    NetworkSettings: {
      Networks: {
        bridge: {
          IPAddress: '172.17.0.2',
          IPPrefixLen: 16,
          Gateway: '172.17.0.1',
          MacAddress: '02:42:ac:11:00:02',
        },
      },
    },
    Mounts: [
      {
        Type: 'bind',
        Source: '/host/path',
        Destination: '/container/path',
        Mode: 'rw',
        RW: true,
        Propagation: 'rprivate',
      },
    ],
  },
];

const mockImages: DockerImage[] = [
  {
    Id: 'sha256:image123',
    ParentId: 'sha256:parent123',
    RepoTags: ['ubuntu:latest'],
    RepoDigests: ['ubuntu@sha256:digest123'],
    Created: 1665496192,
    Size: 72000000,
    VirtualSize: 72000000,
    SharedSize: 0,
    Labels: {},
    Containers: 1,
  },
];

const mockInfo: DockerInfo = {
  ID: 'ABCD:EFGH:IJKL:MNOP',
  Containers: 1,
  ContainersRunning: 1,
  ContainersPaused: 0,
  ContainersStopped: 0,
  Images: 1,
  Driver: 'overlay2',
  DriverStatus: [['Pool Name', 'docker-pool']],
  Plugins: {
    Volume: ['local'],
    Network: ['bridge', 'host'],
    Authorization: [],
    Log: ['json-file', 'syslog'],
  },
  MemoryLimit: true,
  SwapLimit: true,
  KernelMemory: true,
  CpuCfsPeriod: true,
  CpuCfsQuota: true,
  CPUShares: true,
  CPUSet: true,
  IPv4Forwarding: true,
  BridgeNfIptables: true,
  BridgeNfIp6tables: true,
  Debug: false,
  NFd: 22,
  OomKillDisable: true,
  NGoroutines: 42,
  SystemTime: '2022-10-11T12:00:00.000000000Z',
  LoggingDriver: 'json-file',
  CgroupDriver: 'systemd',
  NEventsListener: 0,
  KernelVersion: '5.10.0',
  OperatingSystem: 'Ubuntu 20.04 LTS',
  OSType: 'linux',
  Architecture: 'x86_64',
  IndexServerAddress: 'https://index.docker.io/v1/',
  RegistryConfig: {
    AllowNondistributableArtifactsCIDRs: [],
    AllowNondistributableArtifactsHostnames: [],
    InsecureRegistryCIDRs: ['127.0.0.0/8'],
    IndexConfigs: {
      'docker.io': {
        Name: 'docker.io',
        Mirrors: [],
        Secure: true,
        Official: true,
      },
    },
    Mirrors: [],
  },
  NCPU: 8,
  MemTotal: 16000000000,
  DockerRootDir: '/var/lib/docker',
  HttpProxy: '',
  HttpsProxy: '',
  NoProxy: '',
  Name: 'docker-host',
  Labels: [],
  ExperimentalBuild: false,
  ServerVersion: '20.10.10',
  ClusterStore: '',
  ClusterAdvertise: '',
  DefaultRuntime: 'runc',
  LiveRestoreEnabled: false,
  Isolation: '',
  InitBinary: 'docker-init',
  SecurityOptions: ['name=seccomp,profile=default'],
};

/**
 * Subclass that bypasses the real socket-path filesystem check so the
 * construction tests can use an arbitrary (non-existent) socket path.
 */
class DockerAPIMock extends DockerAPI {
  protected override _validateSocketPath(
    _value: unknown,
  ): _value is RESTlerOptions['socketPath'] {
    return true;
  }
}

/** Shape captured from each stubbed request, for request-side assertions. */
type CapturedRequest = {
  method?: string;
  body?: BodyInit | null;
  unix?: string;
  url: string;
  searchParams: URLSearchParams;
};

/**
 * Build a `_fetch` stub that returns canned Docker responses based on the
 * requested URL path. The stub also records the request `init` (method,
 * body, the Unix socket path) and the parsed URL into `captured` so the
 * tests can assert on the request side, not just the response.
 */
function buildMockFetch(
  captured: { last?: CapturedRequest },
): typeof fetch {
  return (
    input: string | URL | Request,
    init?: RequestInit & { unix?: string },
  ) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;
    captured.last = {
      method: init?.method,
      body: init?.body,
      unix: init?.unix,
      url,
      searchParams: new URL(url).searchParams,
    };

    let body: string | null = null;
    let status = 200;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };

    if (url.includes('/_ping')) {
      // Real Docker `/_ping` returns plain text, not JSON.
      headers['content-type'] = 'text/plain';
      body = 'OK';
    } else if (url.includes('/containers/json')) {
      body = JSON.stringify(mockContainers);
    } else if (url.includes('/containers/container123/json')) {
      body = JSON.stringify(mockContainers[0]);
    } else if (url.includes('/images/json')) {
      body = JSON.stringify(mockImages);
    } else if (url.includes('/images/create')) {
      // pullImage expects 200.
      body = '{}';
      status = 200;
    } else if (url.includes('/info')) {
      body = JSON.stringify(mockInfo);
    } else if (
      url.includes('/start') || url.includes('/stop') ||
      (url.includes('/containers/container123') && init?.method === 'DELETE')
    ) {
      // Docker returns 204 No Content for these actions. A null body is
      // required — `new Response('', { status: 204 })` throws.
      body = null;
      status = 204;
    } else {
      body = '{}';
    }

    return Promise.resolve(new Response(body, { status, headers }));
  };
}

const DOCKER_PATH = OS === 'WINDOWS'
  ? 'npipe:////./pipe/docker_engine'
  : '/var/run/docker.sock';

describe('restler.examples.dockerAPI', () => {
  describe({
    name: 'DockerAPI',
    windows: false,
    fn: () => {
      it('should propagate the default socket path to fetch', async () => {
        const captured: { last?: CapturedRequest } = {};
        // No socket path supplied — the default should reach `_fetch`.
        const api = new DockerAPIMock();
        api.setFetch(buildMockFetch(captured));
        await api.ping();
        asserts.assertEquals(captured.last?.unix, '/var/run/docker.sock');
      });

      it('should propagate a custom socket path to fetch', async () => {
        const captured: { last?: CapturedRequest } = {};
        const customPath = '/var/run/notthere.socket';
        const api = new DockerAPIMock(customPath);
        api.setFetch(buildMockFetch(captured));
        await api.ping();
        asserts.assertEquals(captured.last?.unix, customPath);
      });

      it('should reject a bogus socket path during construction', () => {
        // A PLAIN DockerAPI (not the mock) runs the real socket-path
        // validation, which stats the file and throws when it is missing.
        asserts.assertThrows(
          () => new DockerAPI('/var/run/definitely-not-a-real.socket'),
          RESTlerConfigError,
        );
      });

      it('should list containers', async () => {
        const captured: { last?: CapturedRequest } = {};
        const api = new DockerAPIMock(DOCKER_PATH);
        api.setFetch(buildMockFetch(captured));
        const containers = await api.listContainers(true);
        asserts.assertEquals(containers.length, 1);
        asserts.assertEquals(containers[0].Id, 'container123');
        asserts.assertEquals(captured.last?.method, 'GET');
        asserts.assert(
          captured.last?.url.includes('/containers/json'),
        );
        asserts.assertEquals(captured.last?.searchParams.get('all'), 'true');
      });

      it('should fetch a single container info', async () => {
        const captured: { last?: CapturedRequest } = {};
        const api = new DockerAPIMock(DOCKER_PATH);
        api.setFetch(buildMockFetch(captured));
        const info = await api.getContainerInfo('container123');
        asserts.assertNotEquals(info, null);
        asserts.assertEquals(info?.Id, 'container123');
        asserts.assertEquals(captured.last?.method, 'GET');
        asserts.assert(
          captured.last?.url.includes('/containers/container123/json'),
        );
      });

      it('should start a container', async () => {
        const captured: { last?: CapturedRequest } = {};
        const api = new DockerAPIMock(DOCKER_PATH);
        api.setFetch(buildMockFetch(captured));
        const ok = await api.startContainer('container123');
        asserts.assertEquals(ok, true);
        asserts.assertEquals(captured.last?.method, 'POST');
        asserts.assert(
          captured.last?.url.includes('/containers/container123/start'),
        );
      });

      it('should stop a container', async () => {
        const captured: { last?: CapturedRequest } = {};
        const api = new DockerAPIMock(DOCKER_PATH);
        api.setFetch(buildMockFetch(captured));
        const ok = await api.stopContainer('container123', 5);
        asserts.assertEquals(ok, true);
        asserts.assertEquals(captured.last?.method, 'POST');
        asserts.assert(
          captured.last?.url.includes('/containers/container123/stop'),
        );
        asserts.assertEquals(captured.last?.searchParams.get('t'), '5');
      });

      it('should remove a container', async () => {
        const captured: { last?: CapturedRequest } = {};
        const api = new DockerAPIMock(DOCKER_PATH);
        api.setFetch(buildMockFetch(captured));
        // `force: true` appends a query string — the DELETE routing must
        // still match even though the URL no longer ends with the path.
        const ok = await api.removeContainer('container123', true);
        asserts.assertEquals(ok, true);
        asserts.assertEquals(captured.last?.method, 'DELETE');
        asserts.assert(
          captured.last?.url.includes('/containers/container123'),
        );
        asserts.assertEquals(captured.last?.searchParams.get('force'), 'true');
      });

      it('should pull an image', async () => {
        const captured: { last?: CapturedRequest } = {};
        const api = new DockerAPIMock(DOCKER_PATH);
        api.setFetch(buildMockFetch(captured));
        const ok = await api.pullImage('ubuntu', '22.04');
        asserts.assertEquals(ok, true);
        asserts.assertEquals(captured.last?.method, 'POST');
        asserts.assert(captured.last?.url.includes('/images/create'));
        asserts.assertEquals(
          captured.last?.searchParams.get('fromImage'),
          'ubuntu',
        );
        asserts.assertEquals(captured.last?.searchParams.get('tag'), '22.04');
      });

      it('should list images', async () => {
        const captured: { last?: CapturedRequest } = {};
        const api = new DockerAPIMock(DOCKER_PATH);
        api.setFetch(buildMockFetch(captured));
        const images = await api.listImages();
        asserts.assertEquals(images.length, 1);
        asserts.assertEquals(images[0].Id, 'sha256:image123');
        asserts.assertEquals(captured.last?.method, 'GET');
        asserts.assert(captured.last?.url.includes('/images/json'));
      });

      it('should fetch system info', async () => {
        const captured: { last?: CapturedRequest } = {};
        const api = new DockerAPIMock(DOCKER_PATH);
        api.setFetch(buildMockFetch(captured));
        const info = await api.getSystemInfo();
        asserts.assertNotEquals(info, null);
        asserts.assertEquals(info?.ID, 'ABCD:EFGH:IJKL:MNOP');
        asserts.assertEquals(captured.last?.method, 'GET');
        asserts.assert(captured.last?.url.includes('/info'));
      });

      it('should ping the daemon', async () => {
        const captured: { last?: CapturedRequest } = {};
        const api = new DockerAPIMock(DOCKER_PATH);
        api.setFetch(buildMockFetch(captured));
        const ok = await api.ping();
        asserts.assertEquals(ok, true);
        asserts.assertEquals(captured.last?.method, 'GET');
        asserts.assert(captured.last?.url.includes('/_ping'));
      });
    },
  });
});
