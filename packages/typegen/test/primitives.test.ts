import * as fsSyncer from 'fs-syncer'
import {test, beforeEach, expect, vi as jest} from 'vitest'
import * as typegen from '../src'
import {getPureHelper} from './helper'

export const {typegenOptions, logger, poolHelper: helper} = getPureHelper({__filename})

beforeEach(async () => {
  jest.resetAllMocks()

  await helper.setupDb()
  await helper.pool.query(helper.sql`
    create table test_table(
      a int not null,
      b int
    )
  `)
})

test('primitives are non-nullable', async () => {
  const syncer = fsSyncer.testFixture({
    expect,
    targetState: {
      'index.ts': `
        import {sql} from 'slonik'

        export default [
          sql\`select 1 as a\`,
          sql\`select 'a' as a\`,
          sql\`select 'a' as b\`,
          sql\`select null::integer as b\`,
          sql\`select sum(a) from test_table\`,
          sql\`select sum(b) from test_table\`,
          sql\`select current_date\`,
          sql\`select 'foo' || 'bar'\`,
          sql\`select 'foo' || null\`,
          sql\`select a > 1 from test_table\`,
          sql\`select 2 > 1 as a\`,
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
        sql<queries.A>\`select 1 as a\`,
        sql<queries.A_9>\`select 'a' as a\`,
        sql<queries.B>\`select 'a' as b\`,
        sql<queries.B_15>\`select null::integer as b\`,
        sql<queries.TestTable_sum>\`select sum(a) from test_table\`,
        sql<queries.TestTable_sum>\`select sum(b) from test_table\`,
        sql<queries.CurrentDate>\`select current_date\`,
        sql<queries.Column>\`select 'foo' || 'bar'\`,
        sql<queries.Column>\`select 'foo' || null\`,
        sql<queries.TestTable>\`select a > 1 from test_table\`,
        sql<queries.A_21>\`select 2 > 1 as a\`,
      ]

      export declare namespace queries {
        // Generated by @pgkit/typegen

        /** - query: \`select 1 as a\` */
        export interface A {
          /** not null: \`true\`, regtype: \`integer\` */
          a: number
        }

        /** - query: \`select 'a' as a\` */
        export interface A_9 {
          /** not null: \`true\`, regtype: \`text\` */
          a: string
        }

        /** - query: \`select 'a' as b\` */
        export interface B {
          /** not null: \`true\`, regtype: \`text\` */
          b: string
        }

        /** - query: \`select null::integer as b\` */
        export interface B_15 {
          /** regtype: \`integer\` */
          b: number | null
        }

        /**
         * queries:
         * - \`select sum(a) from test_table\`
         * - \`select sum(b) from test_table\`
         */
        export interface TestTable_sum {
          /** regtype: \`bigint\` */
          sum: number | null
        }

        /** - query: \`select current_date\` */
        export interface CurrentDate {
          /** regtype: \`date\` */
          current_date: Date | null
        }

        /**
         * queries:
         * - \`select 'foo' || 'bar'\`
         * - \`select 'foo' || null\`
         */
        export interface Column {
          /** regtype: \`text\` */
          '?column?': string | null
        }

        /** - query: \`select a > 1 from test_table\` */
        export interface TestTable {
          /** regtype: \`boolean\` */
          '?column?': boolean | null
        }

        /** - query: \`select 2 > 1 as a\` */
        export interface A_21 {
          /** not null: \`true\`, regtype: \`boolean\` */
          a: boolean
        }
      }
    "
  `)
})
