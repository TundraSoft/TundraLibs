import { path } from '../dependencies.ts';
import type { EndpointOptions } from './types/mod.ts';
import { BaseEndpoint } from './BaseEndpoint.ts';

export class EndpointManager {
  protected static _endPointGroups = new Map<string, string[]>();
  protected static _endPointConfigs = new Map<string, EndpointOptions>();
  protected static _endPoints = new Map<string, BaseEndpoint>();
  protected static _endPointsPaths: string[] = [];

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
        if (file.name.toLowerCase().endsWith('.endpoint.ts')) {
          const config = (await import(`file://${realPath}`))
            .default as EndpointOptions;
          if (config.name === undefined) {
            throw new Error(`Endpoint name is not defined in ${realPath}`);
          }
          if (config.routePath === undefined) {
            throw new Error(`Endpoint route is not defined in ${config.name}`);
          }
          const name = config.name.trim().toLowerCase(),
            group = config.routeGroup.trim().toLowerCase(),
            identifiers = (config.routeIdentifiers)
              ? ':' + config.routeIdentifiers.join('\\::') + '?'
              : '',
            routePath = path.posix.join(
              config.routePath.trim().toLowerCase(),
              name,
              identifiers,
            );
          if (EndpointManager._endPointConfigs.has(name)) {
            throw new Error(`Endpoint name ${name} already exists`);
          }
          // Check if the path is used
          if (EndpointManager._endPointsPaths.includes(config.routePath)) {
            throw new Error(`Endpoint path ${config.routePath} already exists`);
          }

          EndpointManager._endPointConfigs.set(name, config);
          // Set the groups
          EndpointManager._endPointGroups.set(group, [
            ...(EndpointManager._endPointGroups.get(group) || []),
            name,
          ]);
          EndpointManager._endPointsPaths.push(routePath);
        }
      } else if (file.isDirectory && includeSubfolder) {
        await EndpointManager.loadEndpoints(`${location}/${file.name}`);
      }
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
    const list = (group !== undefined)
      ? EndpointManager._endPointGroups.get(group) || []
      : Array.from(EndpointManager._endPointConfigs.keys());
    return list.map((name) => {
      return EndpointManager.getEndpoint(name);
    });
  }

  public static getEndpoint(name: string): BaseEndpoint {
    name = name.toLowerCase().trim();
    if (EndpointManager._endPointConfigs.has(name)) {
      if (!EndpointManager._endPoints.has(name)) {
        EndpointManager._endPoints.set(
          name,
          new BaseEndpoint(
            EndpointManager._endPointConfigs.get(name) as EndpointOptions,
          ),
        );
      }
      return EndpointManager._endPoints.get(name) as BaseEndpoint;
    }
    throw new Error(`Endpoint ${name} does not exist`);
  }
}
