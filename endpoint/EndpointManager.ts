import { path } from '../dependencies.ts';
import type { EndpointManagerOptions, EndpointOptions } from './types/mod.ts';
import { BaseEndpoint } from './BaseEndpoint.ts';

export class EndpointManager<
  S extends Record<string, unknown> = Record<string, unknown>,
> {
  protected _defaultEndpointOptions: EndpointManagerOptions;
  protected _endPointGroups = new Map<string, string[]>();
  protected _endPointConfigs = new Map<string, EndpointOptions>();
  protected _endPoints = new Map<string, BaseEndpoint<S>>();
  protected _endPointsPaths: string[] = [];

  constructor(defaultOptions: EndpointManagerOptions) {
    defaultOptions = {
      ...{
        headers: {
          totalRows: 'X-Total-Rows',
          paginationLimit: 'X-Pagination-Limit',
          paginationPage: 'X-Pagination-Page',
        },
        notFoundMessage: 'Resource you are looking for is not found',
        notSupportedMessage: 'Requested method is not supported',
      },
      ...defaultOptions,
    };
    this._defaultEndpointOptions = defaultOptions;
    //this.loadEndpoints(location, includeSubfolder);
  }

  /**
   * loadEndpoints
   *
   * Load endpoints from a directory
   *
   * @static
   * @param location string Path from which to load endpoints
   */
  async loadEndpoints(location: string, includeSubfolder = true) {
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
              // name,
              identifiers,
            );
          if (this._endPointConfigs.has(name)) {
            throw new Error(`Endpoint name ${name} already exists`);
          }
          // Check if the path is used
          if (this._endPointsPaths.includes(config.routePath)) {
            throw new Error(`Endpoint path ${config.routePath} already exists`);
          }

          this._endPointConfigs.set(name, config);
          // Set the groups
          this._endPointGroups.set(group, [
            ...(this._endPointGroups.get(group) || []),
            name,
          ]);
          this._endPointsPaths.push(routePath);
        }
      } else if (file.isDirectory && includeSubfolder) {
        await this.loadEndpoints(`${location}/${file.name}`);
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
  public getEndpoints(group?: string): BaseEndpoint[] {
    const list = (group !== undefined)
      ? this._endPointGroups.get(group) || []
      : Array.from(this._endPointConfigs.keys());
    return list.map((name) => {
      return this.getEndpoint(name);
    });
  }

  public getEndpoint(name: string): BaseEndpoint {
    name = name.toLowerCase().trim();
    if (this._endPointConfigs.has(name)) {
      if (!this._endPoints.has(name)) {
        this._endPoints.set(
          name,
          new BaseEndpoint<S>(
            {
              ...this._defaultEndpointOptions,
              ...this._endPointConfigs.get(name),
            } as EndpointOptions,
          ),
        );
      }
      return this._endPoints.get(name) as BaseEndpoint;
    }
    throw new Error(`Endpoint ${name} does not exist`);
  }
}
