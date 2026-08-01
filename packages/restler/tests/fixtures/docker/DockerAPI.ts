import { RESTler } from '../../../mod.ts';
import type { RESTlerOptions } from '../../../mod.ts';
import type { DockerContainer, DockerImage, DockerInfo } from './types.ts';

/**
 * Example client for Docker Engine API, which uses Unix socket communication
 * https://docs.docker.com/engine/api/
 *
 * Migrated to the current RESTler API: every endpoint carries its `method`
 * inline and `_makeRequest(endpoint)` takes a single argument. A `setFetch`
 * seam is exposed so tests can stub the request transport without touching
 * the global `fetch` (which compat captures at import).
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

  /** Override the request `fetch` seam (used to stub network access). */
  public setFetch(fn: typeof fetch): void {
    this._fetch = fn;
  }

  /**
   * List all containers
   * @param all Include stopped containers (default: false)
   * @returns Array of container objects
   */
  async listContainers(all = false): Promise<DockerContainer[]> {
    const response = await this._makeRequest<DockerContainer[]>({
      path: '/containers/json',
      method: 'GET',
      query: {
        all: all ? 'true' : 'false',
      },
    });
    return response.body || [];
  }

  /**
   * Get detailed information about a container
   * @param containerId Container ID or name
   * @returns Container detail object or null if not found
   */
  async getContainerInfo(containerId: string): Promise<DockerContainer | null> {
    const response = await this._makeRequest<DockerContainer>({
      path: `/containers/${containerId}/json`,
      method: 'GET',
    });
    return response.body || null;
  }

  /**
   * Start a container
   * @param containerId Container ID or name to start
   * @returns true if successful, false otherwise
   */
  async startContainer(containerId: string): Promise<boolean> {
    const response = await this._makeRequest({
      path: `/containers/${containerId}/start`,
      method: 'POST',
      contentType: 'JSON',
      payload: {},
    });
    return response.status === 204;
  }

  /**
   * Stop a container
   * @param containerId Container ID or name to stop
   * @param timeout Seconds to wait before killing the container
   * @returns true if successful, false otherwise
   */
  async stopContainer(containerId: string, timeout = 10): Promise<boolean> {
    const response = await this._makeRequest({
      path: `/containers/${containerId}/stop`,
      method: 'POST',
      contentType: 'JSON',
      payload: {},
      query: {
        t: timeout.toString(),
      },
    });
    return response.status === 204;
  }

  /**
   * Remove a container
   * @param containerId Container ID or name to remove
   * @param force Force removal even if running
   * @returns true if successful, false otherwise
   */
  async removeContainer(containerId: string, force = false): Promise<boolean> {
    const response = await this._makeRequest({
      path: `/containers/${containerId}`,
      method: 'DELETE',
      query: {
        force: force ? 'true' : 'false',
      },
    });
    return response.status === 204;
  }

  /**
   * List all images
   * @returns Array of image objects
   */
  async listImages(): Promise<DockerImage[]> {
    const response = await this._makeRequest<DockerImage[]>({
      path: '/images/json',
      method: 'GET',
    });
    return response.body || [];
  }

  /**
   * Pull an image from a registry
   * @param imageName Image name to pull
   * @param tag Image tag (default: latest)
   * @returns true if successful, false otherwise
   */
  async pullImage(imageName: string, tag = 'latest'): Promise<boolean> {
    const response = await this._makeRequest({
      path: '/images/create',
      method: 'POST',
      contentType: 'JSON',
      payload: {},
      query: {
        fromImage: imageName,
        tag: tag,
      },
    });
    return response.status === 200;
  }

  /**
   * Get Docker system information
   * @returns System information object or null on failure
   */
  async getSystemInfo(): Promise<DockerInfo | null> {
    const response = await this._makeRequest<DockerInfo>({
      path: '/info',
      method: 'GET',
    });
    return response.body || null;
  }

  /**
   * Check if Docker daemon is responding
   * @returns true if ping successful, false otherwise
   */
  async ping(): Promise<boolean> {
    const response = await this._makeRequest({
      path: '/_ping',
      method: 'GET',
    });
    return response.status === 200;
  }
}
