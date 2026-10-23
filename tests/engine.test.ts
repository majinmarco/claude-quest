import { describe, expect, test } from 'claude-code/testing'

import { manaLevel, newGame, step } from '../src/engine'

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

describe('Game Engine: session vitals', () => {
  test('a new game has no Mana, model or spend yet', () => {
    expect(newGame().vitals).toEqual({ mana: null, model: null, spendUsd: null })
  })

  test('a measurement sets Mana, the model and the spend', () => {
    const { state, effects } = step(newGame(), {
      type: 'SESSION_MEASURED',
      mana: 42,
      model: 'claude-opus-5-5',
      spendUsd: 1.25,
    })

    expect(state.vitals).toEqual({
      mana: 42,
      model: 'claude-opus-5-5',
      spendUsd: 1.25,
    })
    expect(effects).toEqual([])
  })

  test('a measurement with no context reading (just compacted) clears Mana but keeps the rest', () => {
    const measured = step(newGame(), {
      type: 'SESSION_MEASURED',
      mana: 90,
      model: 'claude-opus-5-5',
      spendUsd: 3,
    }).state

    const { state } = step(measured, { type: 'SESSION_MEASURED' })

    expect(state.vitals).toEqual({
      mana: null,
      model: 'claude-opus-5-5',
      spendUsd: 3,
    })
  })
})

describe('Game Engine: Mana thresholds', () => {
  const LEVELS = [
    [0, 'calm'],
    [49, 'calm'],
    [50, 'filling'],
    [79, 'filling'],
    [80, 'warning'],
    [100, 'warning'],
  ] as const

  for (const [percent, level] of LEVELS) {
    test(`${percent}% of the context window is ${level}`, () => {
      expect(manaLevel(percent)).toBe(level)
    })
  }

  test('Mana with no reading yet is calm', () => {
    expect(manaLevel(null)).toBe('calm')
  })
})

describe('Game Engine: compaction warning', () => {
  const measured = (mana?: number) =>
    ({ type: 'SESSION_MEASURED', mana }) as const

  test('Mana crossing 80% warns of compaction', () => {
    const at79 = step(newGame(), measured(79)).state

    const { effects } = step(at79, measured(81))

    expect(effects).toEqual([{ type: 'COMPACTION_WARNING', mana: 81 }])
  })

  test('Mana staying past 80% warns only once', () => {
    const warned = step(newGame(), measured(82)).state

    expect(step(warned, measured(88)).effects).toEqual([])
  })

  test('after a compaction, Mana crossing 80% again warns again', () => {
    const warned = step(newGame(), measured(85)).state
    const compacted = step(warned, measured()).state
    const refilled = step(compacted, measured(30)).state

    expect(step(refilled, measured(80)).effects).toEqual([
      { type: 'COMPACTION_WARNING', mana: 80 },
    ])
  })
})

describe('Game Engine: Quest start', () => {
  test('a new game has no active Quest', () => {
    expect(newGame().quest).toBeNull()
  })

  test('starting a Quest makes it the active Quest, with no Encounters yet', () => {
    const { state, effects } = step(newGame(), { type: 'QUEST_START', ticket: '#4' })

    expect(state.quest).toEqual({ ticket: '#4', encounters: [] })
    expect(effects).toEqual([{ type: 'QUEST_STARTED', ticket: '#4' }])
  })

  test('Encounters during the Quest are attached to it, oldest first', () => {
    const questing = step(newGame(), { type: 'QUEST_START', ticket: '#4' }).state

    const once = step(questing, { type: 'FILE_READ', path: 'src/engine.ts' }).state
    const { state } = step(once, { type: 'FILE_READ', path: 'src/hud.tsx' })

    expect(state.quest?.encounters).toEqual([
      { kind: 'Exploration', target: 'src/engine.ts' },
      { kind: 'Exploration', target: 'src/hud.tsx' },
    ])
  })

  test('starting a second Quest abandons the active one and replaces it', () => {
    const questing = step(newGame(), { type: 'QUEST_START', ticket: '#4' }).state
    const explored = step(questing, { type: 'FILE_READ', path: 'a.ts' }).state

    const { state, effects } = step(explored, { type: 'QUEST_START', ticket: 'ABC-123' })

    expect(state.quest).toEqual({ ticket: 'ABC-123', encounters: [] })
    expect(effects).toEqual([
      { type: 'QUEST_ABANDONED', ticket: '#4' },
      { type: 'QUEST_STARTED', ticket: 'ABC-123' },
    ])
  })

  test('starting the active Quest again carries on with it', () => {
    const questing = step(newGame(), { type: 'QUEST_START', ticket: '#4' }).state
    const explored = step(questing, { type: 'FILE_READ', path: 'a.ts' }).state

    const { state, effects } = step(explored, { type: 'QUEST_START', ticket: '#4' })

    expect(state.quest).toEqual({
      ticket: '#4',
      encounters: [{ kind: 'Exploration', target: 'a.ts' }],
    })
    expect(effects).toEqual([])
  })
})
