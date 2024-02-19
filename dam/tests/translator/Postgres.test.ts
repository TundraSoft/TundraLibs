import { PostgresClient } from '../../clients/mod.ts';
import {
  afterAll,
  assertEquals,
  // assertRejects,
  beforeAll,
  describe,
  it,
} from '../../../dev.dependencies.ts';
// import { DAMClientError, DAMQueryError } from '../../errors/mod.ts';

import { alphaNumeric, nanoId } from '../../../id/mod.ts';
import { envArgs } from '../../../utils/envArgs.ts';

import {
  CountQuery,
  InsertQuery,
  SelectQuery,
  UpdateQuery,
} from '../../types/mod.ts';

const envData = envArgs('dam/tests');

describe('DAM', () => {
  describe('Translator', () => {
    describe({
      name: 'Postgres',
      sanitizeExit: false,
      sanitizeOps: false,
      sanitizeResources: false,
    }, () => {
      const client = new PostgresClient('pgtest', {
        dialect: 'POSTGRES',
        host: envData.get('PG_HOST') || 'localhost',
        username: envData.get('PG_USER') || 'postgres',
        password: envData.get('PG_PASS') || 'postgres',
        port: parseInt(envData.get('PG_PORT')) || 5432,
        database: envData.get('PG_DB') || 'postgres',
        poolSize: 1,
      });

      const schema = `test_${nanoId(4, alphaNumeric)}`;

      beforeAll(async () => {
        await client.connect();
        await client.execute({
          type: 'RAW',
          sql: `CREATE SCHEMA "${schema}";`,
        });
        await client.execute({
          type: 'RAW',
          sql:
            `CREATE TABLE "${schema}"."Users"("Id" UUID NOT NULL, "Name" VARCHAR(100) NOT NULL, "Email" VARCHAR(255) NOT NULL, "Password" VARCHAR(255) NOT NULL, "DOB" DATE, "Status" BOOLEAN NOT NULL, "JoinDate" TIMESTAMP NOT NULL, PRIMARY KEY ("Id"));`,
        });
        await client.execute({
          type: 'RAW',
          sql:
            `CREATE TABLE "${schema}"."Posts"("Id" UUID NOT NULL, "Title" VARCHAR(100) NOT NULL, "Slug" VARCHAR(100) NOT NULL, "Content" VARCHAR(255) NOT NULL, "Meta" JSONB, "AuthorId" UUID NOT NULL, "CreatedDate" TIMESTAMP NOT NULL, PRIMARY KEY ("Id"));`,
        });
      });

      afterAll(async () => {
        await client.execute({
          type: 'RAW',
          sql: `DROP SCHEMA "${schema}" CASCADE;`,
        });
        await client.close();
        assertEquals('READY', client.status);
      });

      // it('Must close connection', async () => {
      //   await client.close();
      //   assertEquals('READY', client.status)
      // });

      it('Insert', async () => {
        const insertUser: InsertQuery = {
          type: 'INSERT',
          source: 'Users',
          schema: schema,
          data: [
            {
              Id: crypto.randomUUID(),
              Name: 'John Doe',
              Email: 'test@email.com',
              Password: 'sdf',
              DOB: '2023-02-02',
              Status: true,
              JoinDate: new Date(),
            },
            {
              Id: crypto.randomUUID(),
              Name: 'Jane Doe',
              Email: 'janq@email.com',
              Password: 'sdf',
              DOB: '2023-02-02',
              Status: true,
              JoinDate: new Date(),
            },
          ],
          project: {
            Id: 'Id',
            Name: 'Name',
            Email: 'Email',
            Password: 'Password',
            DOB: 'DOB',
            Status: 'Status',
            JoinDate: 'sdf',
            ComplexId: {
              $expr: 'concat',
              $args: ['$Name', '$DOB'],
            },
          },
        };
        const resi = await client.insert<
          {
            Id: string;
            Name: string;
            Email: string;
            Password: string;
            DOB: Date;
            Status: boolean;
            sdf: Date;
            ComplexId: string;
          }
        >(insertUser);
        assertEquals(2n, resi.count);
        // Posts
        const insertPost: InsertQuery = {
          type: 'INSERT',
          source: 'Posts',
          schema: schema,
          data: [
            {
              Id: crypto.randomUUID(),
              Title: 'First Post',
              Slug: {
                $expr: 'lower',
                $args: 'First Post',
              },
              Content:
                'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
              Meta: {
                tags: ['first', 'post'],
                keywords: ['Lorem', 'ipsum', 'consectetur'],
                publishInfo: {
                  published: true,
                  date: new Date(),
                },
              },
              AuthorId: resi.data[0].Id,
              CreatedDate: new Date(),
            },
            {
              Id: crypto.randomUUID(),
              Title: 'Second Post',
              Slug: {
                $expr: 'lower',
                $args: 'Second Post',
              },
              Content:
                'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
              Meta: {
                tags: ['second', 'post'],
                keywords: ['Sed', 'eiusmod', 'tempor'],
                publishInfo: {
                  published: false,
                  date: null,
                },
              },
              AuthorId: resi.data[1].Id,
              CreatedDate: new Date(),
            },
            // Add more posts here...
          ],
          project: {
            Id: 'Id',
            Title: 'Title',
            Slug: 'Slug',
            Content: 'Content',
            Meta: 'Meta',
            AuthorId: 'AuthorId',
            CreatedDate: 'CreatedDate',
          },
        };
        await client.insert(insertPost);
      });

      it('Update', async () => {
        const updatePost: UpdateQuery = {
          type: 'UPDATE',
          source: 'Posts',
          schema: schema,
          data: {
            Slug: {
              $expr: 'lower',
              $args: '$Title',
            },
          },
          filters: {
            '$Meta.publishInfo.published': true,
          },
        };
        const res = await client.update(updatePost);
        assertEquals(1n, res.count);
      });

      it('Count', async () => {
        const sel: CountQuery = {
          type: 'COUNT',
          source: 'Posts',
          schema: schema,
          filters: {
            '$Meta.publishInfo.published': true,
            '$AuthorId': {
              $in: [
                crypto.randomUUID(),
                crypto.randomUUID(),
              ],
            },
          },
        };

        const res = await client.count(sel);
        assertEquals(0n, res.count);
      });

      it('Select', async () => {
        const sel: SelectQuery = {
          type: 'SELECT',
          source: 'Posts',
          schema: schema,
          project: {
            Id: 'Id',
            Title: 'Title',
            Slug: 'Slug',
            Content: 'Content',
            Meta: 'Meta',
            AuthorId: 'AuthorId',
            CreatedDate: 'CreatedDate',
            '$Author': true,
          },
          filters: {
            '$Meta.publishInfo.published': true,
          },
          join: {
            Author: {
              source: 'Users',
              schema: schema,
              relation: {
                AuthorId: 'Id',
              },
              project: {
                Name: 'Name',
                Email: 'Email',
              },
            },
          },
        };

        const res = await client.select(sel);
        assertEquals(1n, res.count);
      });
    });
  });
});
