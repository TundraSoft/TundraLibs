import { RedisConnect } from '../dependencies.ts';
import type { Redis } from '../dependencies.ts';

console.log('Connecting...');
const client: Redis = await RedisConnect({
  hostname: 'anq-test.redis.cache.windows.net',
  port: 6380,
  password: 'gJ0G0l1PKwxn9mhVJjkBVW7xI279NTL2KAzCaPKdtxk=',
  db: 1,
  tls: true,
  name: 'test',
});

const val = {
  a: 'sdf',
};
console.log('Connected...');
await client.set('test:USER:1', JSON.stringify(val), { ex: 10 });
console.log('Set value');
const retval = JSON.parse(await client.get('test:USER:1') as string);
console.log(retval.a);
// console.log(await client.keys('test:user'));
console.log('Got value');
