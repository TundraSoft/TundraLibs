import { WaitlistModel } from "../models/waitlist.model.ts";
import { green, red } from "../../../../dependencies.ts";
import type { Filters } from "../../../types/mod.ts";
const waitlistCreateData: Array<Partial<any>> = [
  {
    mobile: "9123456789",
    name: "Jake Tomlinson",
    email: "jake@mail.com",
    hasCrypto: true,
    createdDate: new Date(),
  },
  {
    mobile: "9123456788",
    name: "Evan Oke",
    email: "evan@mail.com",
    hasCrypto: true,
    createdDate: new Date(),
  },
  {
    mobile: "9123456787",
    name: "Kartik Naik",
    email: "kartik@mail.com",
    hasCrypto: true,
    createdDate: new Date(),
  },
  {
    mobile: "9123456786",
    name: "Akshay Tate",
    email: "akshay@mail.com",
    hasCrypto: true,
    createdDate: new Date(),
  },
];
const create = async () => {
  try {
    const result = await WaitlistModel.insert(waitlistCreateData);
    console.log(green(`~~~ result ${JSON.stringify(result)}`));
    console.log(green(JSON.stringify(result)));
  } catch (error: any) {
    console.error(red(`~~~ ${error.toString()}`));
  }
};
const fetch = async () => {
  try {
    const result = await WaitlistModel.select();
    console.log(green(`~~~ result ${JSON.stringify(result)}`));
  } catch (error: any) {
    console.error(red(`~~~ ${error.toString()}`));
  }
};
const update = async () => {
  try {
    const newData = {
      name: "Vineet Jain",
    };
    const filters: Filters<any> = {
      id: "4",
    };
    const result = await WaitlistModel.update(newData, filters);
    console.log(green(JSON.stringify(result)));
  } catch (error: any) {
    console.error(red(`~~~ ${error.toString()}`));
  }
};

const remove = async () => {
  try {
    const filters: Filters<any> = {
      id: "3",
    };
    const result = await WaitlistModel.delete(filters);
    console.log(green(JSON.stringify(result)));
  } catch (error: any) {
    console.error(red(`~~~ ${error.toString()}`));
  }
};

// create();
// fetch()
// update()
// remove()
