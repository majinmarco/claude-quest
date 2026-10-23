import { describe, expect, test } from 'claude-code/testing'

import { newGame, step } from '../src/engine'

describe('Game Engine: a new Player', () => {
  test('starts at level 1 with no XP, full HP and no Stats', () => {
    const { player } = newGame()

    expect(player).toEqual({
      level: 1,
      xp: 0,
      hp: 100,
      maxHp: 100,
      stats: {
        intelligence: 0,
        wisdom: 0,
        dexterity: 0,
        strength: 0,
        charisma: 0,
        constitution: 0,
      },
    })
  })
})

describe('Game Engine: Exploration', () => {
  test('a file read starts an Exploration Encounter and earns 5 XP', () => {
    const { state, effects } = step(newGame(), {
      type: 'FILE_READ',
      path: 'src/engine.ts',
    })

    expect(state.player.xp).toBe(5)
    expect(state.encounter).toEqual({
      kind: 'Exploration',
      target: 'src/engine.ts',
    })
    expect(effects).toEqual([
      {
        type: 'ENCOUNTER_STARTED',
        encounter: { kind: 'Exploration', target: 'src/engine.ts' },
      },
      { type: 'XP_GAINED', amount: 5 },
    ])
  })
})

describe('Game Engine: levelling', () => {
  test('crossing 100 XP at level 1 reaches level 2, carrying the rest over', () => {
    const start = newGame({ ...newGame().player, xp: 98 })

    const { state, effects } = step(start, { type: 'FILE_READ', path: 'a.ts' })

    expect(state.player.level).toBe(2)
    expect(state.player.xp).toBe(3)
    expect(effects).toContainEqual({ type: 'LEVEL_UP', level: 2 })
  })

  test('level 2 takes 200 XP to clear', () => {
    const start = newGame({ ...newGame().player, level: 2, xp: 190 })

    const { state, effects } = step(start, { type: 'FILE_READ', path: 'a.ts' })

    expect(state.player).toMatchObject({ level: 2, xp: 195 })
    expect(effects).not.toContainEqual({ type: 'LEVEL_UP', level: 3 })
  })
})
