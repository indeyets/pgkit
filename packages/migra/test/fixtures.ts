import {Client, createClient, sql} from '@pgkit/client'
import * as fs from 'fs'
import {kebabCase} from 'lodash'
import * as path from 'path'
import * as sqlFormatter from 'sql-formatter'
import {type Flags} from '../src/command'

export const format = (query: string) => {
  try {
    return sqlFormatter.format(query, {language: 'postgresql'})
  } catch (e) {
    throw new Error(String(e) + '\n\n' + query) // useless callstacks from sql-formatter
  }
}

const fixturesDir = path.join(__dirname, 'FIXTURES')
const fixtureNames = fs.readdirSync(fixturesDir)

const argsMap: Record<string, Flags> = {
  singleschema: {schema: 'goodschema'},
  excludeschema: {excludeSchema: 'excludedschema'},
  singleschema_ext: {createExtensionsOnly: true},
  extversions: {ignoreExtensionVersions: false},
}

export const setup = async (url: string, admin: Client, prefix: string) => {
  const db = url.split('/').at(-1)
  const variant = db.split('_').at(-1)
  const name = db.replace(prefix + '_', '').slice(0, -1 - variant.length)

  const connectionString = url.toString()

  if (process.env.MIGRA_CACHE) {
    return
  }

  await admin.query(sql`drop database if exists ${sql.identifier([db])}`)
  await admin.query(sql`create database ${sql.identifier([db])}`)

  const pool = createClient(connectionString)
  const filepath = path.join(fixturesDir, name, `${variant}.sql`)
  const query = fs.readFileSync(filepath, 'utf8')

  await pool.query(sql`create role schemainspect_test_role`).catch(e => {
    const isRoleExists = (e as Error)?.message?.includes(`role "schemainspect_test_role" already exists`)
    if (!isRoleExists) throw e as Error
  })

  await pool.query(sql.raw(query))

  await pool.pgp.$pool.end()
}

export const getFixtures = (prefix: string) =>
  fixtureNames.map(name => {
    const variant = (ab: 'a' | 'b', admin: Client) =>
      admin.pgp.$cn.toString().replace(/postgres$/, `${prefix}_${name}_${ab}`)
    const args: Flags = {
      unsafe: true,
      ignoreExtensionVersions: true,
      ...(name in argsMap && argsMap[name]),
    }
    const variants = (admin: Client) => [variant('a', admin), variant('b', admin)] as const
    return {
      name,
      variants,
      setup: async (admin: Client) => {
        const [a, b] = variants(admin)
        await setup(a, admin, prefix)
        await setup(b, admin, prefix)
        return [a, b] as const
      },
      args: (overrides?: Partial<typeof args>) => ({...args, ...overrides}),
      cliArgs: (overrides?: Partial<typeof args>) => {
        const entries = Object.entries({...args, ...overrides})
        return entries.flatMap(([k, v]) => {
          const arg = `--${kebabCase(k)}`
            // https://github.com/djrobstep/migra/pull/235
            .replace(/exclude-schema/, 'exclude_schema')
          if (v === false) return []
          if (v === true) return [arg]
          return [arg, v as string]
        })
      },
    } as const
  })