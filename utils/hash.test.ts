import {
  assertEquals,
  assertRejects,
  describe,
  it,
} from '../dev.dependencies.ts';
import { hash } from './hash.ts';

describe('utils', () => {
  describe({ name: 'hash' }, () => {
    const data = { a: 1, b: 2, c: 3 };
    const str = 'Loreum ipsum dolar sit amet';
    const num = 1234567890;
    // const bool = false;
    // const date = new Date();
    const arr = [1, 2, 3, 4, 5];

    describe('invalid options', () => {
      it('invalid algorithm', async () => {
        await assertRejects(
          () =>
            hash(
              'data',
              JSON.parse(
                JSON.stringify({ algorithm: 'invalid', encoding: 'HEX' }),
              ),
            ),
          Error,
          'Invalid algorithm',
        );
      });

      it('invalid encoding', async () => {
        await assertRejects(
          () =>
            hash(
              'data',
              JSON.parse(
                JSON.stringify({ algorithm: 'sha-1', encoding: 'invalid' }),
              ),
            ),
          Error,
          'Invalid algorithm',
        );
      });
    });

    describe('sha-1', async () => {
      assertEquals(
        await hash(data, { algorithm: 'SHA-1', encoding: 'HEX' }),
        'e7ec4a8f2309bdd4c4c57cb2adfb79c91a293597',
      );
      assertEquals(
        await hash(str, { algorithm: 'SHA-1', encoding: 'HEX' }),
        '447629ff84a6097f8d0989f691e1bae471093885',
      );
      assertEquals(
        await hash(num, { algorithm: 'SHA-1', encoding: 'HEX' }),
        '01b307acba4f54f55aafc33bb06bbbf6ca803e9a',
      );
      // assert(await hash(bool, { algorithm: 'SHA-1', encoding: 'HEX' }), '4');
      // assert(await hash(date, { algorithm: 'SHA-1', encoding: 'HEX' }), '5');
      assertEquals(
        await hash(arr, { algorithm: 'SHA-1', encoding: 'HEX' }),
        '1835aa686ddf9035a62492e6f9a74ed44d5b62a4',
      );

      assertEquals(
        await hash(data, { algorithm: 'SHA-1', encoding: 'BASE64' }),
        '5+xKjyMJvdTExXyyrft5yRopNZc=',
      );
      assertEquals(
        await hash(str, { algorithm: 'SHA-1', encoding: 'BASE64' }),
        'RHYp/4SmCX+NCYn2keG65HEJOIU=',
      );
      assertEquals(
        await hash(num, { algorithm: 'SHA-1', encoding: 'BASE64' }),
        'AbMHrLpPVPVar8M7sGu79sqAPpo=',
      );
      // assert(await hash(bool, { algorithm: 'SHA-1', encoding: 'BASE64' }), 'b326b5062b2f0e69046810717534cb09d607f6d8');
      // assert(await hash(date, { algorithm: 'SHA-1', encoding: 'BASE64' }), 'd6e9f8c4f3e9e3e8c6b6e3e7e3e9e3e9e3e9e3e9');
      assertEquals(
        await hash(arr, { algorithm: 'SHA-1', encoding: 'BASE64' }),
        'GDWqaG3fkDWmJJLm+adO1E1bYqQ=',
      );
    });

    describe('sha-256', async () => {
      assertEquals(
        await hash(data, { algorithm: 'SHA-256', encoding: 'HEX' }),
        'e6a3385fb77c287a712e7f406a451727f0625041823ecf23bea7ef39b2e39805',
      );
      assertEquals(
        await hash(str, { algorithm: 'SHA-256', encoding: 'HEX' }),
        'ba0e88d151518ab9ae60662289d1d79e80c3aafc9d44fccc0022d81a8b49e912',
      );
      assertEquals(
        await hash(num, { algorithm: 'SHA-256', encoding: 'HEX' }),
        'c775e7b757ede630cd0aa1113bd102661ab38829ca52a6422ab782862f268646',
      );
      // console.log(await hash(bool, { algorithm: 'SHA-256', encoding: 'HEX' }));
      // console.log(await hash(date, { algorithm: 'SHA-256', encoding: 'HEX' }));
      assertEquals(
        await hash(arr, { algorithm: 'SHA-256', encoding: 'HEX' }),
        'f5baf0e4336fd53b4c82b453ece859868475160d36f22e9551a0e9b10ac9cc00',
      );

      assertEquals(
        await hash(data, { algorithm: 'SHA-256', encoding: 'BASE64' }),
        '5qM4X7d8KHpxLn9AakUXJ/BiUEGCPs8jvqfvObLjmAU=',
      );
      assertEquals(
        await hash(str, { algorithm: 'SHA-256', encoding: 'BASE64' }),
        'ug6I0VFRirmuYGYiidHXnoDDqvydRPzMACLYGotJ6RI=',
      );
      assertEquals(
        await hash(num, { algorithm: 'SHA-256', encoding: 'BASE64' }),
        'x3Xnt1ft5jDNCqERO9ECZhqziCnKUqZCKreChi8mhkY=',
      );
      // console.log(await hash(bool, { algorithm: 'SHA-256', encoding: 'BASE64' }));
      // console.log(await hash(date, { algorithm: 'SHA-256', encoding: 'BASE64' }));
      assertEquals(
        await hash(arr, { algorithm: 'SHA-256', encoding: 'BASE64' }),
        '9brw5DNv1TtMgrRT7OhZhoR1Fg028i6VUaDpsQrJzAA=',
      );
    });

    describe('sha-384', async () => {
      assertEquals(
        await hash(data, { algorithm: 'SHA-384', encoding: 'HEX' }),
        '2d6d61c8bf68e0a2143c2c76f55c8a2f3073585db868b4db8f0e59167146d864092b4719441ae417ab19c28920ceb822',
      );
      assertEquals(
        await hash(str, { algorithm: 'SHA-384', encoding: 'HEX' }),
        '99dda821a7a1d8523202194814a8052a1e4df57ff7859c06cf47725d5c7dea818baedb6162b13769e87af88ee29ebb3d',
      );
      assertEquals(
        await hash(num, { algorithm: 'SHA-384', encoding: 'HEX' }),
        'ed845f8b4f2a6d5da86a3bec90352d916d6a66e3420d720e16439adf238f129182c8c64fc4ec8c1e6506bc2b4888baf9',
      );
      // console.log(await hash(bool, { algorithm: 'SHA-256', encoding: 'HEX' }));
      // console.log(await hash(date, { algorithm: 'SHA-256', encoding: 'HEX' }));
      assertEquals(
        await hash(arr, { algorithm: 'SHA-384', encoding: 'HEX' }),
        '0381e38b5d1d59cc5986e70508618b75f353a28c8dfd6f133b8e307883c0bb53d62d5e622a377e6bec5dff9d82e7a297',
      );

      assertEquals(
        await hash(data, { algorithm: 'SHA-384', encoding: 'BASE64' }),
        'LW1hyL9o4KIUPCx29VyKLzBzWF24aLTbjw5ZFnFG2GQJK0cZRBrkF6sZwokgzrgi',
      );
      assertEquals(
        await hash(str, { algorithm: 'SHA-384', encoding: 'BASE64' }),
        'md2oIaeh2FIyAhlIFKgFKh5N9X/3hZwGz0dyXVx96oGLrtthYrE3aeh6+I7inrs9',
      );
      assertEquals(
        await hash(num, { algorithm: 'SHA-384', encoding: 'BASE64' }),
        '7YRfi08qbV2oajvskDUtkW1qZuNCDXIOFkOa3yOPEpGCyMZPxOyMHmUGvCtIiLr5',
      );
      // console.log(await hash(bool, { algorithm: 'SHA-256', encoding: 'BASE64' }));
      // console.log(await hash(date, { algorithm: 'SHA-256', encoding: 'BASE64' }));
      assertEquals(
        await hash(arr, { algorithm: 'SHA-384', encoding: 'BASE64' }),
        'A4Hji10dWcxZhucFCGGLdfNTooyN/W8TO44weIPAu1PWLV5iKjd+a+xd/52C56KX',
      );
    });

    describe('sha-512', async () => {
      assertEquals(
        await hash(data, { algorithm: 'SHA-512', encoding: 'HEX' }),
        '6bbcda7073a1c4b821ca129f24b9aa8878709ea68180e0ca623ed08864793da8587000523e64b31ebf7db84577828946ade2aadbca1f0d53fa114759d4c9bc59',
      );
      assertEquals(
        await hash(str, { algorithm: 'SHA-512', encoding: 'HEX' }),
        'bc4a07173615bc68a22b4a5f48b78bbf9845a8e6fc948b8532baf4002c896aa4bd183cd59e4d68ffb11289fb09839d288bc7f9f63016d88d1e20a1da81ef1223',
      );
      assertEquals(
        await hash(num, { algorithm: 'SHA-512', encoding: 'HEX' }),
        '12b03226a6d8be9c6e8cd5e55dc6c7920caaa39df14aab92d5e3ea9340d1c8a4d3d0b8e4314f1f6ef131ba4bf1ceb9186ab87c801af0d5c95b1befb8cedae2b9',
      );
      // console.log(await hash(bool, { algorithm: 'SHA-256', encoding: 'HEX' }));
      // console.log(await hash(date, { algorithm: 'SHA-256', encoding: 'HEX' }));
      assertEquals(
        await hash(arr, { algorithm: 'SHA-512', encoding: 'HEX' }),
        'f1ea6545d8a8aafab3ce92afbd27d62d1c548318042684f3d0df570fca7021ad5d96355fcfc1f545e9241bacc0845b122b1b0309b1617be0f4be2bc65a72b0e1',
      );

      assertEquals(
        await hash(data, { algorithm: 'SHA-512', encoding: 'BASE64' }),
        'a7zacHOhxLghyhKfJLmqiHhwnqaBgODKYj7QiGR5PahYcABSPmSzHr99uEV3golGreKq28ofDVP6EUdZ1Mm8WQ==',
      );
      assertEquals(
        await hash(str, { algorithm: 'SHA-512', encoding: 'BASE64' }),
        'vEoHFzYVvGiiK0pfSLeLv5hFqOb8lIuFMrr0ACyJaqS9GDzVnk1o/7ESifsJg50oi8f59jAW2I0eIKHage8SIw==',
      );
      assertEquals(
        await hash(num, { algorithm: 'SHA-512', encoding: 'BASE64' }),
        'ErAyJqbYvpxujNXlXcbHkgyqo53xSquS1ePqk0DRyKTT0LjkMU8fbvExukvxzrkYarh8gBrw1clbG++4ztriuQ==',
      );
      // console.log(await hash(bool, { algorithm: 'SHA-256', encoding: 'BASE64' }));
      // console.log(await hash(date, { algorithm: 'SHA-256', encoding: 'BASE64' }));
      assertEquals(
        await hash(arr, { algorithm: 'SHA-512', encoding: 'BASE64' }),
        '8eplRdioqvqzzpKvvSfWLRxUgxgEJoTz0N9XD8pwIa1dljVfz8H1RekkG6zAhFsSKxsDCbFhe+D0vivGWnKw4Q==',
      );
    });
  });
});
