import {ParseFn, pgTypes, applyRecommendedTypeParsers} from '@pgkit/client'
import * as assert from 'assert'
import {TypeParserInfo} from '../types'

const jsValueMatchers: Array<[type: string, test: (value: unknown) => boolean]> = [
  ['number', val => typeof val === 'number'],
  ['string', val => typeof val === 'string'],
  ['boolean', val => typeof val === 'boolean'],
  ['bigint', val => typeof val === 'bigint'],
  ['Date', val => val instanceof Date],
]

/**
 * Mapping from pg_type.typname to a valid sample value
 */
// todo: explicitly test to see how these all come back by default from pg
// e.g. by doing sql`select ${sampleValue}::${sampleValueType}` somehow
// but wait - should these all be strings?
export const sampleTypeValues: Record<string, string | number> = {
  int8: 0,
  date: '2000-01-01',
  interval: '1 hour',
  numeric: 0,
  timestamp: '2000-01-01',
  timestamptz: '2000-01-01',
  varchar: '',
  text: '',
  smallint: 0,
  integer: 0,
  bigint: 0,
  decimal: 0,
  serial: 0,
  bigserial: 0,
  money: '$0.00',
}

export const inferTypeParserTypeScript = (tp: ParseFn, defaultSampleInput = ''): string => {
  const sample: unknown = tp((sampleTypeValues[tp.name] as string) || defaultSampleInput)
  const match = jsValueMatchers.find(m => m[1](sample))
  return match?.[0] || `unknown`
}

export const defaultTypeParsers = (applyTypeParsers = applyRecommendedTypeParsers): TypeParserInfo[] => {
  const list = [] as TypeParserInfo[]
  applyTypeParsers({
    builtins: pgTypes.builtins,
    setTypeParser(typeId, parse) {
      assert.ok(typeof parse === 'function', `Expected parse to be a function, got ${typeof parse}`)
      list.push({oid: typeId, typescript: inferTypeParserTypeScript(ts => parse(ts))})
    },
  })
  return list
}
