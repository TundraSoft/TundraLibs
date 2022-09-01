import { BaseEndPoint } from "./BaseEndPoint.ts";

export class EndPointManager {
  protected static _endPoints: Map<string, BaseEndPoint> = new Map();
  protected static _endPointGroups = new Map<string, string[]>();

  public static register(endpoint: BaseEndPoint) {
    const name = endpoint.name, 
      group = endpoint.group;
      // route = endpoint.route, 
      // allowedMethods = endpoint.allowedMethods;
    if(EndPointManager._endPoints.has(name)) {
      EndPointManager._endPoints.set(name, endpoint);
      const groupSet = EndPointManager._endPointGroups.get(group) || [];
      groupSet.push(name);
      EndPointManager._endPointGroups.set(group, groupSet);
    }
  }

  public static getEndpoints(group?: string): BaseEndPoint[] {
    if(group) {
      const groupSets = EndPointManager._endPointGroups.get(group) || [];
      return groupSets.map((name) => {
        return EndPointManager._endPoints.get(name) as BaseEndPoint;
      });
    }
    return Array.from(EndPointManager._endPoints.values());
  }

  public static loadEndpoints(location: string) {
    // Go through a directoy and load all the endpoints
    // We assume the "paths" will contain either EndpointConfig or BaseEndpoint class
    
  }
}