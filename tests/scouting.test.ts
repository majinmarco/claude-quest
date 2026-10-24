import { describe, expect, test } from 'claude-code/testing'

import { DEFAULT_RULES, newGame, step } from '../src/engine'
import type { Effect, GameEvent, GameState, Rules } from '../src/engine'

/** Plays `events` from `state`, keeping every effect. */
const play = (state: GameState, events: GameEvent[], rules: Rules = DEFAULT_RULES) =>
  events.reduce(
    (played, event) => {
      const next = step(played.state, event, rules)

      return { state: next.state, effects: [...played.effects, ...next.effects] }
    },
    { state, effects: [] as Effect[] },
  )

/** A read of `file` in Module `module`. */
const read = (module: string, file = 'index.ts'): GameEvent => ({
  type: 'FILE_READ',
  path: `/work/forge/${module}/${file}`,
  module,
})

/** Reads discovering `count` new Modules, `m<from>` onwards. */
const discover = (count: number, from = 1): GameEvent[] =>
  [...Array(count)].map((_, at) => read(`m${from + at}`))

const wanted = (effects: Effect[]) => effects.filter(effect => effect.type === 'SCOUTING_WANTED')

const modulesOf = (effects: Effect[]) =>
  wanted(effects).map(effect => (effect.type === 'SCOUTING_WANTED' ? effect.modules : []))

const inQuest = (): GameState => step(newGame(), { type: 'QUEST_START', ticket: '#20' }).state

describe('Scouting: when the Cartographer asks', () => {
  test('in a Quest, the third Module discovered wants a Scouting about the three just discovered and the files read in them', () => {
    const outside: GameEvent = { type: 'FILE_READ', path: '/elsewhere/x.ts', module: null }
    const { effects } = play(inQuest(), [read('m1', 'a.ts'), read('m1', 'b.ts'), read('m2'), outside, read('m3')])

    expect(wanted(effects)).toEqual([
      {
        type: 'SCOUTING_WANTED',
        modules: ['m1', 'm2', 'm3'],
        files: ['/work/forge/m1/a.ts', '/work/forge/m1/b.ts', '/work/forge/m2/index.ts', '/work/forge/m3/index.ts'],
      },
    ])
  })

  test('in a Quest, the third, sixth and ninth Module discovered want one each, and no more after', () => {
    expect(modulesOf(play(inQuest(), discover(15)).effects)).toEqual([
      ['m1', 'm2', 'm3'],
      ['m4', 'm5', 'm6'],
      ['m7', 'm8', 'm9'],
    ])
  })

  test('a Module read again is no discovery and counts for nothing', () => {
    expect(wanted(play(inQuest(), [read('m1'), read('m1'), read('m2'), read('m2')]).effects)).toEqual([])
  })

  test('a new Quest counts its own Modules from none', () => {
    const first = play(inQuest(), discover(2))
    const second = play(step(first.state, { type: 'QUEST_START', ticket: '#21' }).state, discover(2, 3))

    expect(wanted(second.effects)).toEqual([])
    expect(wanted(play(second.state, discover(1, 5)).effects)).toHaveLength(1)
  })

  test('outside a Quest, once per five Modules, about the last three, at most two a session', () => {
    expect(modulesOf(play(newGame(), discover(20)).effects)).toEqual([
      ['m3', 'm4', 'm5'],
      ['m8', 'm9', 'm10'],
    ])
  })

  test('with no Sage budget there is none: sageCallsPerQuest 0 in a Quest, sageCallsOutsideQuest 0 outside', () => {
    const noQuest = { ...DEFAULT_RULES, sageCallsPerQuest: 0 }
    const noOutside = { ...DEFAULT_RULES, sageCallsOutsideQuest: 0 }

    expect(wanted(play(inQuest(), discover(9), noQuest).effects)).toEqual([])
    expect(wanted(play(newGame(), discover(10), noOutside).effects)).toEqual([])
    expect(wanted(play(inQuest(), discover(3), noOutside).effects)).toHaveLength(1)
  })

  test('the files are the latest MAX_SCOUTING_CANDIDATES read in those Modules, each once', () => {
    const reads = [...Array(30)].map((_, at) => read('m1', `f${at}.ts`))
    const [first] = wanted(play(inQuest(), [...reads, read('m1', 'f0.ts'), read('m2'), read('m3')]).effects)
    const files = first?.type === 'SCOUTING_WANTED' ? first.files : []

    expect(files).toHaveLength(24)
    expect(new Set(files).size).toBe(24)
    expect(files).toContain('/work/forge/m1/f0.ts')
    expect(files).not.toContain('/work/forge/m1/f1.ts')
    expect(files.at(-1)).toBe('/work/forge/m3/index.ts')
  })
})
