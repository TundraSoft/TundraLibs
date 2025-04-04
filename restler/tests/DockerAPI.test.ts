import * as asserts from '$asserts';
import { RESTlerOptions } from '../types/Options.ts';
import { DockerAPI } from './fixtures/docker/DockerAPI.ts';
import type {
  DockerContainer,
  DockerImage,
  DockerInfo,
} from './fixtures/docker/types.ts';

// Store original connect
const originalConnect = Deno.connect;

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

class DockerAPIMock extends DockerAPI {
  protected override _validateSocketPath(
    value: unknown,
  ): value is RESTlerOptions['socketPath'] {
    return true;
  }
}
// Mock Deno.connect for Unix socket tests
const mockConnect = () => {
  // Mock socket implementation that returns different responses for different requests
  return {
    write: async (data: Uint8Array): Promise<number> => {
      await 1;
      const _request = new TextDecoder().decode(data);
      return data.length;
    },
    read: async (buffer: Uint8Array): Promise<number | null> => {
      await 1;
      let response: string;

      if (buffer[0] === 0) {
        // First read, send headers
        response = 'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n';
      } else {
        // Determine which response to send based on already written data
        const existingData = new TextDecoder().decode(
          buffer.filter((b) => b !== 0),
        );

        if (existingData.includes('containers/json')) {
          response = JSON.stringify(mockContainers);
        } else if (existingData.includes('images/json')) {
          response = JSON.stringify(mockImages);
        } else if (existingData.includes('info')) {
          response = JSON.stringify(mockInfo);
        } else if (existingData.includes('_ping')) {
          response = 'OK';
        } else {
          response = '{}';
        }
      }

      const encoded = new TextEncoder().encode(response);
      buffer.set(encoded);
      return encoded.length;
    },
    close: () => {},
    [Symbol.dispose]: function () {
      this.close();
    },
  };
};

const setupMock = () => {
  // @ts-ignore - Mock implementation
  Deno.connect = (options: Deno.ConnectOptions) => {
    if ('path' in options) {
      return mockConnect();
    }
    return originalConnect(options);
  };
};

const cleanupMock = () => {
  Deno.connect = originalConnect;
};

Deno.test('RESTler.Example', async (h) => {
  await h.step('DockerAPI', async (t) => {
    await t.step('should initialize with default socket path', () => {
      try {
        setupMock();
        const defaultApi = new DockerAPI();
        asserts.assertEquals(defaultApi.vendor, 'Docker');
      } finally {
        cleanupMock();
      }
    });

    await t.step('should accept custom socket path', () => {
      try {
        setupMock();
        const customApi = new DockerAPIMock('/var/run/notthere.socket');
        // No direct way to verify the socket path, but we can verify it was constructed
        asserts.assertNotEquals(customApi, null);
      } finally {
        cleanupMock();
      }
    });
  });
});
