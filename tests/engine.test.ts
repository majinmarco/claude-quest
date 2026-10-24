import { describe, expect, test } from 'claude-code/testing'

import { manaLevel, newGame, questXp, step } from '../src/engine'

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
    const visited = { ...newGame(), visitedModules: ['src'] }

    const { state, effects } = step(visited, {
      type: 'FILE_READ',
      path: 'src/engine.ts',
      module: 'src',
    })

    expect(state.player.xp).toBe(5)
    expect(state.encounter).toEqual({
      kind: 'Exploration',
      target: 'src/engine.ts',
      module: 'src',
      isFirstVisit: false,
    })
    expect(effects).toEqual([
      {
        type: 'ENCOUNTER_STARTED',
        encounter: {
          kind: 'Exploration',
          target: 'src/engine.ts',
          module: 'src',
          isFirstVisit: false,
        },
      },
      { type: 'XP_GAINED', amount: 5 },
    ])
  })
})

describe('Game Engine: first visit to a module', () => {
  test('a new game has visited no module', () => {
    expect(newGame().visitedModules).toEqual([])
  })

  test('the first read in a module earns 10 bonus Wisdom XP on top of the 5', () => {
    const { state, effects } = step(newGame(), {
      type: 'FILE_READ',
      path: 'src/engine.ts',
      module: 'src',
    })

    expect(state.player.xp).toBe(15)
    expect(state.visitedModules).toEqual(['src'])
    expect(state.encounter).toEqual({
      kind: 'Exploration',
      target: 'src/engine.ts',
      module: 'src',
      isFirstVisit: true,
    })
    expect(effects).toEqual([
      {
        type: 'ENCOUNTER_STARTED',
        encounter: {
          kind: 'Exploration',
          target: 'src/engine.ts',
          module: 'src',
          isFirstVisit: true,
        },
      },
      { type: 'XP_GAINED', amount: 5 },
      { type: 'MODULE_DISCOVERED', module: 'src' },
      { type: 'XP_GAINED', amount: 10, stat: 'wisdom' },
    ])
  })

  test('a repeat visit to the module earns only the 5', () => {
    const first = step(newGame(), { type: 'FILE_READ', path: 'src/engine.ts', module: 'src' })

    const { state, effects } = step(first.state, {
      type: 'FILE_READ',
      path: 'src/hud.tsx',
      module: 'src',
    })

    expect(state.player.xp).toBe(20)
    expect(state.visitedModules).toEqual(['src'])
    expect(state.encounter).toMatchObject({ module: 'src', isFirstVisit: false })
    expect(effects).not.toContainEqual({ type: 'MODULE_DISCOVERED', module: 'src' })
    expect(effects).toContainEqual({ type: 'XP_GAINED', amount: 5 })
  })

  test('each module is a first visit of its own, a nested one included', () => {
    const first = step(newGame(), { type: 'FILE_READ', path: 'src/engine.ts', module: 'src' })
    const second = step(first.state, { type: 'FILE_READ', path: 'tests/engine.test.ts', module: 'tests' })
    const third = step(second.state, {
      type: 'FILE_READ',
      path: 'tests/fixtures/tool-calls.ts',
      module: 'tests/fixtures',
    })

    expect(third.state.player.xp).toBe(45)
    expect(third.state.visitedModules).toEqual(['src', 'tests', 'tests/fixtures'])
  })

  test('a module visited in an earlier session is no first visit', () => {
    const remembered = { ...newGame(), visitedModules: ['src'] }

    const { state } = step(remembered, { type: 'FILE_READ', path: 'src/hud.tsx', module: 'src' })

    expect(state.player.xp).toBe(5)
  })

  test('a read outside the project discovers nothing and earns only the 5', () => {
    const { state, effects } = step(newGame(), {
      type: 'FILE_READ',
      path: '/home/marco/.claude/settings.json',
      module: null,
    })

    expect(state.player.xp).toBe(5)
    expect(state.visitedModules).toEqual([])
    expect(state.encounter).toMatchObject({ module: null, isFirstVisit: false })
    expect(effects).toEqual([
      {
        type: 'ENCOUNTER_STARTED',
        encounter: {
          kind: 'Exploration',
          target: '/home/marco/.claude/settings.json',
          module: null,
          isFirstVisit: false,
        },
      },
      { type: 'XP_GAINED', amount: 5 },
    ])
  })

  test('the bonus counts toward levelling up', () => {
    const start = newGame({ ...newGame().player, xp: 90 })

    const { state, effects } = step(start, { type: 'FILE_READ', path: 'a.ts', module: '.' })

    expect(state.player).toMatchObject({ level: 2, xp: 5 })
    expect(effects).toContainEqual({ type: 'LEVEL_UP', level: 2 })
  })
})

describe('Game Engine: levelling', () => {
  test('crossing 100 XP at level 1 reaches level 2, carrying the rest over', () => {
    const start = { ...newGame({ ...newGame().player, xp: 98 }), visitedModules: ['.'] }

    const { state, effects } = step(start, { type: 'FILE_READ', path: 'a.ts', module: '.' })

    expect(state.player.level).toBe(2)
    expect(state.player.xp).toBe(3)
    expect(effects).toContainEqual({ type: 'LEVEL_UP', level: 2 })
  })

  test('level 2 takes 200 XP to clear', () => {
    const start = { ...newGame({ ...newGame().player, level: 2, xp: 190 }), visitedModules: ['.'] }

    const { state, effects } = step(start, { type: 'FILE_READ', path: 'a.ts', module: '.' })

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

    const once = step(questing, { type: 'FILE_READ', path: 'src/engine.ts', module: 'src' }).state
    const { state } = step(once, { type: 'FILE_READ', path: 'src/hud.tsx', module: 'src' })

    expect(state.quest?.encounters).toEqual([
      { kind: 'Exploration', target: 'src/engine.ts', module: 'src', isFirstVisit: true },
      { kind: 'Exploration', target: 'src/hud.tsx', module: 'src', isFirstVisit: false },
    ])
  })

  test('starting a second Quest abandons the active one and replaces it', () => {
    const questing = step(newGame(), { type: 'QUEST_START', ticket: '#4' }).state
    const explored = step(questing, { type: 'FILE_READ', path: 'a.ts', module: '.' }).state

    const { state, effects } = step(explored, { type: 'QUEST_START', ticket: 'ABC-123' })

    expect(state.quest).toEqual({ ticket: 'ABC-123', encounters: [] })
    expect(effects).toEqual([
      { type: 'QUEST_ABANDONED', ticket: '#4' },
      { type: 'QUEST_STARTED', ticket: 'ABC-123' },
    ])
  })

  test('starting the active Quest again carries on with it', () => {
    const questing = step(newGame(), { type: 'QUEST_START', ticket: '#4' }).state
    const explored = step(questing, { type: 'FILE_READ', path: 'a.ts', module: '.' }).state

    const { state, effects } = step(explored, { type: 'QUEST_START', ticket: '#4' })

    expect(state.quest).toEqual({
      ticket: '#4',
      encounters: [{ kind: 'Exploration', target: 'a.ts', module: '.', isFirstVisit: true }],
    })
    expect(effects).toEqual([])
  })
})

describe('Game Engine: Quest rewards', () => {
  test('the XP reward of a Quest doubles with each step of difficulty', () => {
    expect(questXp('Trivial')).toBe(25)
    expect(questXp('Easy')).toBe(50)
    expect(questXp('Medium')).toBe(100)
    expect(questXp('Hard')).toBe(200)
    expect(questXp('Epic')).toBe(400)
  })

  test('a Quest whose ticket names no size is unrated and rewards as Easy', () => {
    expect(questXp('Unrated')).toBe(50)
  })
})

describe('Game Engine: Battle', () => {
  const fail = (failures: number | null, check = 'vitest run') =>
    ({ type: 'TEST_FAIL', check, kind: 'test', failures }) as const
  const pass = (check = 'vitest run') => ({ type: 'TEST_PASS', check, kind: 'test' }) as const

  /** Steps a new game through `events`, answering the last step. */
  const play = (...events: Parameters<typeof step>[1][]) => {
    let state = newGame()
    let effects: ReturnType<typeof step>['effects'] = []
    for (const event of events) {
      ;({ state, effects } = step(state, event))
    }

    return { state, effects }
  }

  test('a failing check spawns a monster whose HP is its failures', () => {
    const { state, effects } = play(fail(3))

    const encounter = {
      kind: 'Battle',
      check: 'vitest run',
      foe: 'test',
      hp: 3,
      maxHp: 3,
      hits: 0,
      outcome: 'spawned',
      isCounted: true,
    }
    expect(state.encounter).toEqual(encounter)
    expect(effects).toEqual([{ type: 'ENCOUNTER_STARTED', encounter }])
  })

  test('a failure with no readable counts spawns a one-HP monster', () => {
    const { state } = play(fail(null))

    expect(state.encounter).toMatchObject({ hp: 1, maxHp: 1, isCounted: false })
  })

  test('the next run of the same check failing fewer lands a hit per newly passing test', () => {
    const { state, effects } = play(fail(3), fail(1))

    expect(state.encounter).toMatchObject({ hp: 1, maxHp: 3, hits: 2, outcome: 'hit' })
    expect(effects).toContainEqual({ type: 'MONSTER_HIT', check: 'vitest run', hits: 2, hp: 1 })
    expect(effects[0]).toMatchObject({ type: 'ENCOUNTER_UPDATED' })
  })

  test('the same failures again: the monster stands, unhurt', () => {
    const { state, effects } = play(fail(3), fail(3))

    expect(state.encounter).toMatchObject({ hp: 3, hits: 0, outcome: 'stands' })
    expect(effects.some(effect => effect.type === 'MONSTER_HIT')).toBe(false)
  })

  test('more failures than before: the monster grows', () => {
    const { state } = play(fail(2), fail(5))

    expect(state.encounter).toMatchObject({ hp: 5, maxHp: 5, hits: 0, outcome: 'grew' })
  })

  test('a failure with no counts mid-Battle leaves the monster as it was', () => {
    const { state } = play(fail(3), fail(null))

    expect(state.encounter).toMatchObject({ hp: 3, hits: 0, outcome: 'stands' })
  })

  test('all green wins: the last hits land and Strength XP is earned, 10 per HP', () => {
    const { state, effects } = play(fail(3), fail(1), pass())

    expect(state.encounter).toMatchObject({ hp: 0, maxHp: 3, hits: 1, outcome: 'won' })
    expect(effects).toEqual([
      { type: 'ENCOUNTER_UPDATED', encounter: state.encounter },
      { type: 'MONSTER_HIT', check: 'vitest run', hits: 1, hp: 0 },
      { type: 'BATTLE_WON', check: 'vitest run', foe: 'test' },
      { type: 'XP_GAINED', amount: 30, stat: 'strength' },
    ])
    expect(state.player.xp).toBe(30)
    expect(state.player.stats.strength).toBe(30)
  })

  test('a one-HP monster won earns 10 Strength XP', () => {
    const { state } = play(fail(null), pass())

    expect(state.player.xp).toBe(10)
    expect(state.player.stats.strength).toBe(10)
  })

  test('a won Battle is over: the check failing again spawns a new monster', () => {
    const { state } = play(fail(3), pass(), fail(2))

    expect(state.encounter).toMatchObject({ hp: 2, maxHp: 2, outcome: 'spawned' })
  })

  test('a check passing with no Battle against it is no Encounter', () => {
    const before = newGame()
    const { state, effects } = step(before, pass())

    expect(state).toEqual(before)
    expect(effects).toEqual([])
  })

  test('another Check has its own Battle; the first waits for its own run', () => {
    const { state } = play(fail(3), fail(2, 'tsc -p .'), fail(1))

    expect(state.encounter).toMatchObject({ check: 'vitest run', hp: 1, hits: 2 })
    expect(play(fail(3), fail(2, 'tsc -p .'), pass('tsc -p .')).state.encounter).toMatchObject({
      check: 'tsc -p .',
      outcome: 'won',
      hits: 2,
    })
  })

  test('a lint or type-check monster is that kind of foe', () => {
    const { state } = play({ type: 'TEST_FAIL', check: 'eslint src', kind: 'lint', failures: 4 })

    expect(state.encounter).toMatchObject({ foe: 'lint', hp: 4 })
  })

  test('a Battle during a Quest is attached to it', () => {
    const { state } = play({ type: 'QUEST_START', ticket: '#8' }, fail(2), pass())

    expect(state.quest?.encounters.map(encounter => encounter.kind === 'Battle' && encounter.outcome)).toEqual([
      'spawned',
      'won',
    ])
  })

  test('winning can level the Player up', () => {
    const { effects } = play(fail(10), pass())

    expect(effects).toContainEqual({ type: 'LEVEL_UP', level: 2 })
  })
})
