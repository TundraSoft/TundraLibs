import { BaseEndPoint } from "./BaseEndpoint.ts";

export class EndpointManager {
  protected static _endPoints: Map<string, BaseEndPoint> = new Map();
  protected static _endPointGroups = new Map<string, string[]>();

  public static register(endpoint: BaseEndPoint) {
    const name = endpoint.name,
      group = endpoint.group;
    // route = endpoint.route,
    // allowedMethods = endpoint.allowedMethods;
    if (EndpointManager._endPoints.has(name)) {
      EndpointManager._endPoints.set(name, endpoint);
      const groupSet = EndpointManager._endPointGroups.get(group) || [];
      groupSet.push(name);
      EndpointManager._endPointGroups.set(group, groupSet);
    }
  }

  public static getEndpoints(group?: string): BaseEndPoint[] {
    if (group) {
      const groupSets = EndpointManager._endPointGroups.get(group) || [];
      return groupSets.map((name) => {
        return EndpointManager._endPoints.get(name) as BaseEndPoint;
      });
    }
    return Array.from(EndpointManager._endPoints.values());
  }

  public static loadEndpoints(location: string) {
    // Go through a directoy and load all the endpoints
    // We assume the "paths" will contain either EndpointConfig or BaseEndpoint class
  }
}
