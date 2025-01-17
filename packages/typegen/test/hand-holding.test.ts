import * as fsSyncer from 'fs-syncer'
import {test, beforeEach, expect, vi as jest} from 'vitest'
import * as typegen from '../src'
import {getPureHelper} from './helper'

export const {typegenOptions, logger, poolHelper: helper} = getPureHelper({__filename})

beforeEach(async () => {
  jest.resetAllMocks()

  await helper.setupDb()
  await helper.pool.query(helper.sql`
    create table test_table1(
      a int not null,
      b int
    );
  `)
})

test('explicitly check a column for nullability', async () => {
  const syncer = fsSyncer.testFixture({
    expect,
    targetState: {
      'index.ts': `
        import {sql} from 'slonik'

        export default [
          sql\`
            select * from test_table1 t1
            where b is not null and a > 1 and a != 10
          \`,
          sql\`
            select * from test_table1 t1
            where b < 2 or b > 4
          \`,
          sql\`
            select prosrc, proargnames, proargmodes::text[]
            from pg_proc
            join pg_language on pg_language.oid = pg_proc.prolang
            where
            pg_language.lanname = 'sql'
            and prosrc is not null
            and proname = \${'foo'}
            limit 2
          \`
        ]
      `,
    },
  })

  syncer.sync()

  await typegen.generate(typegenOptions(syncer.baseDir))

  expect(logger.warn).not.toHaveBeenCalled()
  expect(logger.error).not.toHaveBeenCalled()

  expect(syncer.yaml()).toMatchInlineSnapshot(`
    "---
    index.ts: |-
      import {sql} from 'slonik'

      export default [
        sql<queries.TestTable1>\`
          select * from test_table1 t1
          where b is not null and a > 1 and a != 10
        \`,
        sql<queries.TestTable1>\`
          select * from test_table1 t1
          where b < 2 or b > 4
        \`,
        sql<queries.PgProc_PgLanguage>\`
          select prosrc, proargnames, proargmodes::text[]
          from pg_proc
          join pg_language on pg_language.oid = pg_proc.prolang
          where
          pg_language.lanname = 'sql'
          and prosrc is not null
          and proname = \${'foo'}
          limit 2
        \`,
      ]

      export declare namespace queries {
        // Generated by @pgkit/typegen

        /**
         * queries:
         * - \`select * from test_table1 t1 where b is not null and a > 1 and a != 10\`
         * - \`select * from test_table1 t1 where b < 2 or b > 4\`
         */
        export interface TestTable1 {
          /** column: \`public.test_table1.a\`, not null: \`true\`, regtype: \`integer\` */
          a: number

          /** column: \`public.test_table1.b\`, not null: \`true\`, regtype: \`integer\` */
          b: number
        }

        /** - query: \`select prosrc, proargnames, proargmodes:... [truncated] ...src is not null and proname = $1 limit 2\` */
        export interface PgProc_PgLanguage {
          /** not null: \`true\`, regtype: \`text\` */
          prosrc: string

          /** regtype: \`text[]\` */
          proargnames: string[] | null

          /** regtype: \`text[]\` */
          proargmodes: string[] | null
        }
      }
    "
  `)
})
