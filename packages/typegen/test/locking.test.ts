import * as fsSyncer from 'fs-syncer'
import {test, beforeEach, expect} from 'vitest'
import * as typegen from '../src'
import {getPureHelper as getHelper} from './helper'

export const {typegenOptions, logger, poolHelper: helper} = getHelper({__filename})

beforeEach(async () => {
  await helper.setupDb()
  await helper.pool.query(helper.sql`
    create table table1(a int not null);

    insert into table1 (a) values (1), (2), (3);
  `)
})

test('locks selected rows', async () => {
  const syncer = fsSyncer.testFixture({
    expect,
    targetState: {
      'index.ts': `
        import {sql, createPool} from '@pgkit/client'

        export default [
          sql\`select a from table1 where a=1 for update skip locked;\`,
          sql\`select a from table1 where a=2 for update nowait;\`,
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
      import {sql, createPool} from '@pgkit/client'

      export default [
        sql<queries.Table1>\`select a from table1 where a=1 for update skip locked;\`,
        sql<queries.Table1>\`select a from table1 where a=2 for update nowait;\`,
      ]

      export declare namespace queries {
        // Generated by @pgkit/typegen

        /**
         * queries:
         * - \`select a from table1 where a=1 for update skip locked;\`
         * - \`select a from table1 where a=2 for update nowait;\`
         */
        export interface Table1 {
          /** regtype: \`integer\` */
          a: number | null
        }
      }
    "
  `)
})
