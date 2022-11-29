import { path } from '../dependencies.ts';
import { BaseEndpoint } from './BaseEndpoint.ts';

export class EndpointManager {
  protected static _endPointGroups = new Map<string, string[]>();

  protected static _endPoints: Map<string, BaseEndpoint> = new Map();

  /**
   * register
   *
   * Register a new endpoint to the manager
   *
   * @static
   * @param endpoint BaseEndpoint Register a new Endpoint
   */
  public static register(endpoint: BaseEndpoint) {
    const name = endpoint.name,
      group = endpoint.group;
    // route = endpoint.route,
    // allowedMethods = endpoint.allowedMethods;
    if (!EndpointManager._endPoints.has(name)) {
      EndpointManager._endPoints.set(name, endpoint);
      const groupSet = EndpointManager._endPointGroups.get(group) || [];
      groupSet.push(name);
      EndpointManager._endPointGroups.set(group, groupSet);
    }
  }

  /**
   * getEndpoints
   *
   * Get registered endpoints belonging to a group (if specified) or all of
   * them (if group is not specified).
   *
   * @static
   * @param group string The group name of which to fetch endpoints
   * @returns Array<BaseEndpoint> List of endpoints in the group
   */
  public static getEndpoints(group?: string): BaseEndpoint[] {
    if (group !== undefined) {
      const groupSets = EndpointManager._endPointGroups.get(group) || [];
      return groupSets.map((name) => {
        return EndpointManager._endPoints.get(name) as BaseEndpoint;
      });
    }
    return Array.from(EndpointManager._endPoints.values());
  }

  /**
   * loadEndpoints
   *
   * Load endpoints from a directory
   *
   * @static
   * @param location string Path from which to load endpoints
   */
  public static async loadEndpoints(location: string, includeSubfolder = true) {
    // Go through a directoy and load all the endpoints
    // We assume the "paths" will contain either EndpointConfig or BaseEndpoint class (or extensions of it)
    location = Deno.realPathSync(location);
    // console.log(location);
    const files = Deno.readDirSync(location);
    for (const file of files) {
      if (file.isFile) {
        const realPath = Deno.realPathSync(`${location}/${file.name}`);
        // Check if it is .ts extension
        if (path.extname(realPath) === '.ts') {
          await import(`file://${realPath}`);
        }
      } else if (file.isDirectory && includeSubfolder) {
        await EndpointManager.loadEndpoints(`${location}/${file.name}`);
      }
    }
  }
}
