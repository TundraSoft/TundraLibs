import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { PROVIDERS } from './providers.ts';

describe('pact.oauth provider presets', () => {
  it('GOOGLE normalizes the standard OIDC claims', () => {
    asserts.assertEquals(
      PROVIDERS.GOOGLE.profile({
        sub: 'g1',
        email: 'a@x.io',
        email_verified: true,
        name: 'Ada',
        picture: 'https://img',
      }),
      {
        id: 'g1',
        email: 'a@x.io',
        emailVerified: true,
        name: 'Ada',
        avatar: 'https://img',
      },
    );
  });

  it('GITHUB coerces a numeric id and falls back name → login', () => {
    const withLogin = PROVIDERS.GITHUB.profile({
      id: 12345,
      login: 'ada',
      avatar_url: 'https://a',
    });
    asserts.assertEquals(withLogin.id, '12345'); // number → string subject
    asserts.assertEquals(withLogin.name, 'ada'); // name absent → login
    asserts.assertEquals(withLogin.avatar, 'https://a');

    const withName = PROVIDERS.GITHUB.profile({
      id: 1,
      name: 'Ada Lovelace',
      login: 'ada',
    });
    asserts.assertEquals(withName.name, 'Ada Lovelace');
  });

  it('MICROSOFT normalizes sub/name/email/picture', () => {
    const p = PROVIDERS.MICROSOFT.profile({
      sub: 'm1',
      email: 'a@x',
      name: 'A',
      picture: 'u',
    });
    asserts.assertEquals(p.id, 'm1');
    asserts.assertEquals(p.name, 'A');
  });

  it('DISCORD builds the avatar CDN url and prefers global_name', () => {
    const full = PROVIDERS.DISCORD.profile({
      id: 'd1',
      email: 'a@x',
      verified: true,
      global_name: 'Ada',
      username: 'ada#1',
      avatar: 'abc',
    });
    asserts.assertEquals(full.id, 'd1');
    asserts.assertEquals(full.emailVerified, true);
    asserts.assertEquals(full.name, 'Ada'); // global_name wins
    asserts.assertEquals(
      full.avatar,
      'https://cdn.discordapp.com/avatars/d1/abc.png',
    );

    const minimal = PROVIDERS.DISCORD.profile({ id: 'd2', username: 'ada' });
    asserts.assertEquals(minimal.name, 'ada'); // no global_name → username
    asserts.assertEquals(minimal.avatar, undefined); // no avatar → no url
    asserts.assertEquals(minimal.emailVerified, false); // verified absent
  });

  it('FACEBOOK reads the nested picture.data.url', () => {
    const p = PROVIDERS.FACEBOOK.profile({
      id: 'f1',
      name: 'A',
      email: 'a@x',
      picture: { data: { url: 'https://p' } },
    });
    asserts.assertEquals(p.avatar, 'https://p');
    asserts.assertEquals(
      PROVIDERS.FACEBOOK.profile({ id: 'f2' }).avatar,
      undefined,
    );
  });

  it('APPLE accepts email_verified as a boolean or the string "true"', () => {
    asserts.assertEquals(
      PROVIDERS.APPLE.profile({ sub: 'a1', email_verified: 'true' })
        .emailVerified,
      true,
    );
    asserts.assertEquals(
      PROVIDERS.APPLE.profile({ sub: 'a2', email_verified: false })
        .emailVerified,
      false,
    );
    asserts.assertEquals(PROVIDERS.APPLE.identity, 'id_token');
  });

  it('OIDC normalizes the standard claims', () => {
    const p = PROVIDERS.OIDC.profile({
      sub: 'o1',
      email: 'a@x',
      email_verified: true,
      name: 'A',
      picture: 'u',
    });
    asserts.assertEquals(p.id, 'o1');
    asserts.assertEquals(p.emailVerified, true);
  });

  it('the subject/str helpers drop missing, empty, and non-finite values', () => {
    // missing subject → undefined (the client then fails closed)
    asserts.assertEquals(PROVIDERS.GOOGLE.profile({}).id, undefined);
    // empty-string subject → undefined, never the literal ''
    asserts.assertEquals(PROVIDERS.GOOGLE.profile({ sub: '' }).id, undefined);
    // empty optional field → undefined
    asserts.assertEquals(
      PROVIDERS.GOOGLE.profile({ sub: 'x', email: '' }).email,
      undefined,
    );
    // a non-finite numeric id is not a valid subject
    asserts.assertEquals(
      PROVIDERS.GITHUB.profile({ id: Number.NaN }).id,
      undefined,
    );
  });
});
