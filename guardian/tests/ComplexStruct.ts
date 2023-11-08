import { Guardian, Struct } from '../mod.ts';
// import type { Type } from "../mod.ts";

const stG = Struct({
  name: Guardian.string().max(10),
  age: Guardian.number().integer().min(18),
  profile: {
    facebook: Guardian.string().url(),
  },
  test: Guardian.string().min(10).notEmpty().optional(),
});

try {
  const [err, _data] = stG.validate({
    name: 'Abhinav',
    age: 18,
    profile: { facebook: 'https://google.com/' },
    test: undefined,
  });
  if (err) {
    console.log(err.toJSON());
  }
} catch (e) {
  console.log(e.toJSON());
}

Deno.exit(1);
// const data = [
//   {
//     name: "Abhinav Ariyanayakipuram Venkatachalam",
//     age: 17,
//     profile: { facebook: "df" },
//   },
//   {
//     name: "Abhinav",
//     age: 18,
//     profile: {
//       facebook: "https://facebook.com/abhinavariyanayakipuramvenkatachalam",
//     },
//   },
//   {
//     name: "Lalitha Venkatachalam",
//     age: 61,
//     profile: { facebook: "https://facebook.com/lalithavenkatachalam" },
//   },
// ];
// const valid = stG.validate();
const [error, dat] = stG.validate({
  name: 'Abhinav Ariyanayakipuram Venkatachalam',
  age: 17,
  profile: { facebook: 'df' },
});

console.log(JSON.stringify(error?.toJSON()));
console.log(dat);

// const a = stringGuard.trim().between(4, 40).email();
// const [errors, val] = a.validate('asd@asd.com');
// console.log(errors)
// console.log(`value is: ${val}`)

const PhoneNumbers = Struct({
  number: Guardian.string().mobile(),
  type: Guardian.array().of(Guardian.string().max(1).oneOf(['M', 'P', 'H'])),
});

const IdDetails = Struct({
  type: Guardian.string().oneOf(['DL', 'PASSPORT', 'AADHAAR']),
  number: Guardian.string().max(10),
});

const address = Struct({
  street: Guardian.string().max(100),
  city: Guardian.string().max(100),
  state: Guardian.string().max(100),
});
const profile = Struct({
  address: address,
  phoneNumbers: Guardian.array().of(PhoneNumbers),
});
// const CustomerInfo = Struct({
//   name: Guardian.string().max(10),
//   phone: PhoneNumbers,
//   id: IdDetails
// });

const CustomerInfo = Struct({
  name: Guardian.string().max(10),
  profile: profile,
  id: Guardian.array().of(IdDetails),
});
// try {
CustomerInfo({
  name: 'John Doe',
  profile: {
    address: {
      street: '123 Main St',
      city: 'New York',
      state: 'NY',
    },
    phoneNumbers: [
      { number: '9886704501', type: ['M'] },
      { number: '9886819090', type: ['P'] },
      { number: '1234567890', type: ['H'] },
    ],
  },
  id: [
    { type: 'DL', number: '1234567890' },
    { type: 'PASSPORT', number: '1234567890' },
    { type: 'AADHAAR', number: '1234567890' },
  ],
});
// } catch (e) {
//   console.log(e.toJSON());
//   console.log(e.errors, '--');
// }

// CustomerInfo({
//   name: 'John Doe',
//   phone: { number: '1234567890', type: ['M'] },
//   id: { type: 'DL', number: '1234567890' }
// })
