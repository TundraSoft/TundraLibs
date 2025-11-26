import { privateObject } from './privateObject.ts';

const obj = privateObject({ key: 'value', number: 42 });
const obj2 = privateObject({ key: 'value', number: 42 }, false);
Deno.bench({
  name: 'utils.privateObject - Access item in private object',
}, () => {
  obj.get('key');
});

Deno.bench({
  name: 'utils.privateObject - Check existence of item in private object',
}, () => {
  obj.has('key');
});

Deno.bench({
  name: 'utils.privateObject - Iterate over private object',
}, () => {
  obj.forEach((_key, _value) => {
    // Do nothing, just iterate
  });
});

Deno.bench({
  name: 'utils.privateObject - Convert private object to object',
}, () => {
  obj.asObject();
});

Deno.bench({
  name: 'utils.privateObject - Set item value in immutable private object',
}, () => {
  obj.set('key', 'new value');
});

Deno.bench({
  name: 'utils.privateObject - Access item in immutable private object',
}, () => {
  obj2.get('key');
});

Deno.bench({
  name:
    'utils.privateObject - Check existence of item in immutable private object',
}, () => {
  obj2.has('key');
});

Deno.bench({
  name: 'utils.privateObject - Iterate over immutable private object',
}, () => {
  obj2.forEach((_key, _value) => {
    // Do nothing, just iterate
  });
});

Deno.bench({
  name: 'utils.privateObject - Convert immutable private object to object',
}, () => {
  obj2.asObject();
});

Deno.bench({
  name: 'utils.privateObject - Set item value in immutable private object',
}, () => {
  obj2.set('key', 'new value');
});
