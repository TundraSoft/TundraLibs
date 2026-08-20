import { bench } from '@tundralibs/compat/bench';
import { privateObject } from './privateObject.ts';

const obj = privateObject({ key: 'value', number: 42 });
const obj2 = privateObject({ key: 'value', number: 42 }, false);
bench({
  name: 'utils.privateObject - Access item in private object',
}, () => {
  obj.get('key');
});

bench({
  name: 'utils.privateObject - Check existence of item in private object',
}, () => {
  obj.has('key');
});

bench({
  name: 'utils.privateObject - Iterate over private object',
}, () => {
  obj.forEach((_key, _value) => {
    // Do nothing, just iterate
  });
});

bench({
  name: 'utils.privateObject - Convert private object to object',
}, () => {
  obj.asObject();
});

bench({
  name: 'utils.privateObject - Set item value in immutable private object',
}, () => {
  obj.set('key', 'new value');
});

bench({
  name: 'utils.privateObject - Access item in immutable private object',
}, () => {
  obj2.get('key');
});

bench({
  name:
    'utils.privateObject - Check existence of item in immutable private object',
}, () => {
  obj2.has('key');
});

bench({
  name: 'utils.privateObject - Iterate over immutable private object',
}, () => {
  obj2.forEach((_key, _value) => {
    // Do nothing, just iterate
  });
});

bench({
  name: 'utils.privateObject - Convert immutable private object to object',
}, () => {
  obj2.asObject();
});

bench({
  name: 'utils.privateObject - Set item value in immutable private object',
}, () => {
  obj2.set('key', 'new value');
});
