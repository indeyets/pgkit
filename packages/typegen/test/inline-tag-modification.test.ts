import * as fsSyncer from 'fs-syncer'
import {describe, test, beforeEach, expect} from 'vitest'

import * as typegen from '../src'
import {dedent} from '../src/util'
import {getPureHelper as getHelper} from './helper'

export const {typegenOptions, logger, poolHelper: helper} = getHelper({__filename})

beforeEach(async () => {
  await helper.setupDb()
  await helper.pool.query(helper.sql`
    create table test_table(foo int not null, bar text);
  `)
})

const createInput = (existingTag = '') => `
  import {sql, createPool} from 'slonik'

  export default () => {
        const pool = createPool('...connection string...')
        return pool.query(sql${existingTag}\`select foo, bar from test_table\`)
  }
`

const createSnapshot = (resultingTag: string) =>
  dedent(`
    ---
    index.ts: |-
      ${createInput(resultingTag).trim()}

      export declare namespace queries {
        // Generated by @pgkit/typegen

        /** - query: \`select foo, bar from test_table\` */
        export interface TestTable {
          /** column: \`public.test_table.foo\`, not null: \`true\`, regtype: \`integer\` */
          foo: number

          /** column: \`public.test_table.bar\`, regtype: \`text\` */
          bar: string | null
        }
      }
  `)

const process = async (input = '') => {
  const syncer = fsSyncer.testFixture({expect, targetState: {'index.ts': input}})
  syncer.sync()
  await typegen.generate(typegenOptions(syncer.baseDir))
  return syncer.yaml()
}

const checkModification = async (existingType: string | undefined, resultingType: string) => {
  const input = createInput(existingType === undefined ? '' : `<${existingType}>`)
  const result = createSnapshot(`<${resultingType}>`)
  const processed = await process(input)

  expect(processed.trim()).toEqual(result.trim())
}

describe('inline tag modification', () => {
  /* eslint vitest/expect-expect: ["error", {"assertFunctionNames": ["checkModification", "expect"]}] */
  test('add tag', async () => checkModification(undefined, 'queries.TestTable'))
  test('overwrite existing', async () => {
    // running sequentially to avoid overlapping fixtures
    await checkModification('{col: string}', 'queries.TestTable')
    await checkModification('queries.TestTable', 'queries.TestTable')
    await checkModification('queries.TestTable | Other', 'queries.TestTable')
    await checkModification("Omit<queries.TestTable, 'foo'>", 'queries.TestTable')
  })
  test('preserve intersections', async () => {
    // running sequentially to avoid overlapping fixtures
    await checkModification('queries.TestTable & {col: string}', 'queries.TestTable & {col: string}')
    await checkModification('queries.TestTable & Other', 'queries.TestTable & Other')
    await checkModification(
      'queries.TestTable & One & Two & {col: string}',
      'queries.TestTable & One & Two & {col: string}',
    )
    await checkModification('{col: string} & Other', 'queries.TestTable & Other') // we can't tell if the first intersection type is generated, so it will always be overwritten
  })

  test('high-level', async () => {
    const syncer = fsSyncer.testFixture({
      expect,
      targetState: {
        'index.ts': `
          import {sql} from 'slonik'

          export default sql<{} & {bar: string}>\`select foo, bar from test_table\`
        `,
      },
    })

    syncer.sync()

    await typegen.generate(typegenOptions(syncer.baseDir))

    expect(syncer.yaml()).toMatchInlineSnapshot(`
      "---
      index.ts: |-
        import {sql} from 'slonik'

        export default sql<queries.TestTable & {bar: string}>\`select foo, bar from test_table\`

        export declare namespace queries {
          // Generated by @pgkit/typegen

          /** - query: \`select foo, bar from test_table\` */
          export interface TestTable {
            /** column: \`public.test_table.foo\`, not null: \`true\`, regtype: \`integer\` */
            foo: number

            /** column: \`public.test_table.bar\`, regtype: \`text\` */
            bar: string | null
          }
        }
      "
    `)
  })
})
