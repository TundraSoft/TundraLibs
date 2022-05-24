// const a = new RESTler({
//   timeout: 2000,
//   baseURI: "https://reqres.in"
// });
// // a.get("google", {});
// type t = {
//   page: number,
//   per_page: number,
//   total: number,
//   total_pages: number,
//   data: Array<{id: number, email: string, first_name: string, last_name: string, avatar: string}>,
//   support: {
//     url: string,
//     text: string
//   }
// }
// const head = new Headers();
// head.append('test', 'asdf')
// const ret = await a.get<t>("api/users", {timeout: 100000, headers: head, method: 'POST'});
// console.log(ret);
/**
 * File Upload
const filePath = `path/to/file.ext`;
const form = new FormData();
const stats = fs.statSync(filePath);
const fileSizeInBytes = stats.size;
const fileStream = fs.createReadStream(filePath);
form.append('field-name', fileStream, { knownLength: fileSizeInBytes });

const options = {
    method: 'POST',
    credentials: 'include',
    body: form
};
 */
// let a = new RESTler({
//   baseURI: "https://api.coingecko.com/api/",
//   timeout: 1000,
//   referrer: "noreferrer"
// })

// const ret = await a.getAll<{id: string, symbol: string, name: string}>("v3/coins/list");
// if (ret !== null)
//   console.log(ret[0].id);
