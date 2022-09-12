import { Context } from "../../../dependencies.ts";
import { BaseEndpoint } from "../../BaseEndpoint.ts"; 
import type { EndpointOptions, ParsedRequest } from "../../types/mod.ts";

const UserEndpointConfig: Partial<EndpointOptions> = {
  name: "User",
  routePath: "/",
  routeIdentifiers: ['Id(\\d+)', 'orgId(\\d+)'],
}

const Users = [
  {
    id: 1, 
    name: "John Doe",
    email: "john@doe.com", 
    password: "123456"
  }, 
  {
    id: 2,
    name: "Jane Doe",
    email: "jane@doe.com", 
    password: "123456"
  }, 
  {
    id: 3,
    name: "John Smith",
    email: "johm.smith@gmail.com", 
    password: "123456"
  }
];

class UserEndpoint extends BaseEndpoint {
  constructor(config: Partial<EndpointOptions>) {
    super(config);
  }

  protected _GET(req: ParsedRequest, ctx: Context): void {
    console.log(req.params)
    if(req.params.id) {
      const user = Users.find(u => u.id == req.params.id);
      if(user) {
        ctx.response.body = Array(user);
      } else {
        ctx.response.status = 404;
        return;
      }
    } else {
      if(req.paging && req.paging.size && req.paging.size <= Users.length) {
        ctx.response.body = Users.slice(0, req.paging.size);
        ctx.response.headers.append('X-PAGE-COUNT', req.paging.size.toString());
        ctx.response.headers.append('X-PAGE-NUMBER', '1');
      } else {
        ctx.response.body = Users
      }
      ctx.response.headers.append('X-TOTAL-COUNT', Users.length.toString());
    }
  }

  protected _POST(req: ParsedRequest, ctx: Context): void {
    
  }

  protected _PUT(req: ParsedRequest, ctx: Context): void {
    // if(req.params.id) {
    //   const user = Users.find(u => u.id === req.params.id);
    //   if(user) {
    //     const updatedUser = {...user, ...req.body.value};
    //     ctx.response.body = updatedUser;
    //   }
    // }
  }

  protected _PATCH(req: ParsedRequest, ctx: Context): void {
    // if(req.params.id) {
    //   const user = Users.find(u => u.id === req.params.id);
    //   if(user) {
    //     const updatedUser = {...user, ...req.body.value};
    //     ctx.response.body = updatedUser;
    //   }
    // }
  }

  protected _DELETE(req: ParsedRequest, ctx: Context): void {
    
  }

}

export default new UserEndpoint(UserEndpointConfig);