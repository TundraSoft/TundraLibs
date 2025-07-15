import { RESTler } from '../../../mod.ts';
import type { RESTlerOptions } from '../../../mod.ts';
import type { DockerContainer, DockerImage, DockerInfo } from './types.ts';

/**
 * Example client for Docker Engine API, which uses Unix socket communication
 * https://docs.docker.com/engine/api/
 */
export class DockerAPI extends RESTler {
  public readonly vendor = 'Docker';

  /**
   * Create a new Docker API client
   * @param socketPath Path to the Docker socket (default: /var/run/docker.sock)
   * @param options Additional RESTler options
   */
  constructor(
    socketPath = '/var/run/docker.sock',
    options?: Partial<RESTlerOptions>,
  ) {
    super({
      baseURL: 'http://localhost',
      socketPath: socketPath,
      ...options,
    });
  }

  /**
   * List all containers
   * @param all Include stopped containers (default: false)
   * @returns Array of container objects
   */
  async listContainers(all = false): Promise<DockerContainer[]> {
    const response = await this._makeRequest<DockerContainer[]>(
      {
        path: '/containers/json',
        query: {
          all: all ? 'true' : 'false',
        },
      },
      { method: 'GET' },
    );
    return response.body || [];
  }

  /**
   * Get detailed information about a container
   * @param containerId Container ID or name
   * @returns Container detail object or null if not found
   */
  async getContainerInfo(containerId: string): Promise<DockerContainer | null> {
    const response = await this._makeRequest<DockerContainer>(
      { path: `/containers/${containerId}/json` },
      { method: 'GET' },
    );
    return response.body || null;
  }

  /**
   * Start a container
   * @param containerId Container ID or name to start
   * @returns true if successful, false otherwise
   */
  async startContainer(containerId: string): Promise<boolean> {
    const response = await this._makeRequest(
      { path: `/containers/${containerId}/start` },
      { method: 'POST' },
    );
    return response.status === 204;
  }

  /**
   * Stop a container
   * @param containerId Container ID or name to stop
   * @param timeout Seconds to wait before killing the container
   * @returns true if successful, false otherwise
   */
  async stopContainer(containerId: string, timeout = 10): Promise<boolean> {
    const response = await this._makeRequest(
      {
        path: `/containers/${containerId}/stop`,
        query: {
          t: timeout.toString(),
        },
      },
      { method: 'POST' },
    );
    return response.status === 204;
  }

  /**
   * Remove a container
   * @param containerId Container ID or name to remove
   * @param force Force removal even if running
   * @returns true if successful, false otherwise
   */
  async removeContainer(containerId: string, force = false): Promise<boolean> {
    const response = await this._makeRequest(
      {
        path: `/containers/${containerId}`,
        query: {
          force: force ? 'true' : 'false',
        },
      },
      { method: 'DELETE' },
    );
    return response.status === 204;
  }

  /**
   * List all images
   * @returns Array of image objects
   */
  async listImages(): Promise<DockerImage[]> {
    const response = await this._makeRequest<DockerImage[]>(
      { path: '/images/json' },
      { method: 'GET' },
    );
    return response.body || [];
  }

  /**
   * Pull an image from a registry
   * @param imageName Image name to pull
   * @param tag Image tag (default: latest)
   * @returns true if successful, false otherwise
   */
  async pullImage(imageName: string, tag = 'latest'): Promise<boolean> {
    const response = await this._makeRequest(
      {
        path: '/images/create',
        query: {
          fromImage: imageName,
          tag: tag,
        },
      },
      { method: 'POST' },
    );
    return response.status === 200;
  }

  /**
   * Get Docker system information
   * @returns System information object or null on failure
   */
  async getSystemInfo(): Promise<DockerInfo | null> {
    const response = await this._makeRequest<DockerInfo>(
      { path: '/info' },
      { method: 'GET' },
    );
    return response.body || null;
  }

  /**
   * Check if Docker daemon is responding
   * @returns true if ping successful, false otherwise
   */
  async ping(): Promise<boolean> {
    const response = await this._makeRequest(
      { path: '/_ping' },
      { method: 'GET' },
    );
    return response.status === 200;
  }
}

const dockerApi = new DockerAPI();

// Make requests
const containers = await dockerApi.listContainers(true);
const images = await dockerApi.listImages();
const info = await dockerApi.getSystemInfo();
