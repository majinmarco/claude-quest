import { describe, expect, test } from 'claude-code/testing'

import { isCodeChanging, itemNameOf, MAJOR_EDIT_LINES, MAX_FIX_EDITS, QUESTION_XP, REWRITE_SHARE, WRONG_ANSWER_HP, manaLevel, newGame, questXp, step } from '../src/engine'
import type { GameState, QuestionContent } from '../types'

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

describe('Game Engine: Crafting', () => {
  /** A file change, of `added` and `removed` lines, to an existing file. */
  const edit = (
    added: number,
    removed: number,
    path = '/work/forge/src/order-ledger.ts',
    linesBefore: number | null = 40,
  ) => ({
    type: 'FILE_EDIT' as const,
    path,
    module: 'src',
    isNewFile: false,
    linesBefore,
    linesAdded: added,
    linesRemoved: removed,
    diff: '@@ -1,1 +1,1 @@\n-a\n+b',
  })

  const newFile = {
    type: 'FILE_EDIT' as const,
    path: '/work/forge/src/user-profile-card.tsx',
    module: 'src',
    isNewFile: true,
    linesBefore: null,
    linesAdded: 23,
    linesRemoved: 0,
    diff: '@@ -0,0 +1,23 @@\n+export type UserProfile = {',
  }

  test('a new file is forged: a Crafting Encounter of the item named after it, for 10 XP', () => {
    const { state, effects } = step(newGame(), newFile)

    const encounter = {
      kind: 'Crafting',
      target: '/work/forge/src/user-profile-card.tsx',
      module: 'src',
      item: 'User Profile Card',
      isNewFile: true,
      linesAdded: 23,
      linesRemoved: 0,
    }
    expect(state.encounter).toEqual(encounter)
    expect(state.player.xp).toBe(10)
    expect(effects).toEqual([
      { type: 'ENCOUNTER_STARTED', encounter },
      {
        type: 'CODE_CHANGED',
        changes: [
          {
            path: '/work/forge/src/user-profile-card.tsx',
            diff: '@@ -0,0 +1,23 @@\n+export type UserProfile = {',
          },
        ],
      },
      { type: 'XP_GAINED', amount: 10 },
    ])
  })

  test('even a tiny new file is forged', () => {
    const { state } = step(newGame(), { ...newFile, linesAdded: 1 })

    expect(state.encounter?.kind).toBe('Crafting')
  })

  test('an edit of 10 changed lines is a major edit, and forges', () => {
    expect(MAJOR_EDIT_LINES).toBe(10)

    const { state, effects } = step(newGame(), edit(10, 3))

    expect(state.encounter).toMatchObject({ kind: 'Crafting', item: 'Order Ledger', isNewFile: false })
    expect(effects.map(effect => effect.type)).toEqual(['ENCOUNTER_STARTED', 'CODE_CHANGED', 'XP_GAINED'])
  })

  test('lines removed count as changed: deleting 10 lines forges', () => {
    expect(step(newGame(), edit(0, 10)).state.encounter?.kind).toBe('Crafting')
  })

  test('an edit of 9 changed lines is minor: no Encounter, nothing earned', () => {
    const before = newGame()

    const { state, effects } = step(before, edit(9, 9))

    expect(state).toEqual(before)
    expect(effects).toEqual([])
  })

  test('lines replaced count once: 6 removed and 6 added is a 6-line edit, minor', () => {
    expect(step(newGame(), edit(6, 6)).effects).toEqual([])
  })

  test('a near-complete rewrite of a small file forges: 4 of its 5 lines replaced', () => {
    expect(REWRITE_SHARE).toBe(0.8)

    expect(step(newGame(), edit(13, 4, 'src/config.ts', 5)).state.encounter).toMatchObject({
      kind: 'Crafting',
      item: 'Config',
    })
  })

  test('replacing 3 of 5 lines is no rewrite, and too few lines: minor', () => {
    expect(step(newGame(), edit(3, 3, 'src/config.ts', 5)).effects).toEqual([])
  })

  test('emptying a file is no rewrite: nothing new is made', () => {
    expect(step(newGame(), edit(0, 5, 'src/config.ts', 5)).effects).toEqual([])
  })

  test('with the old file unknown only the lines changed count', () => {
    expect(step(newGame(), edit(4, 4, 'src/config.ts', null)).effects).toEqual([])
  })

  test('a minor edit leaves the Encounter under way as it was', () => {
    const exploring = step(newGame(), { type: 'FILE_READ', path: 'src/a.ts', module: 'src' }).state

    expect(step(exploring, edit(1, 1)).state.encounter).toEqual(exploring.encounter)
  })

  test('a Crafting during a Quest is recorded on it', () => {
    const questing = step(newGame(), { type: 'QUEST_START', ticket: '#9' }).state

    const { state } = step(questing, newFile)

    expect(state.quest?.encounters).toEqual([state.encounter])
  })

  test('Crafting is a code-changing Encounter; Exploration is not', () => {
    const crafted = step(newGame(), newFile).state.encounter
    const explored = step(newGame(), { type: 'FILE_READ', path: 'a.ts', module: '.' }).state.encounter

    expect(crafted !== null && isCodeChanging(crafted)).toBe(true)
    expect(explored !== null && isCodeChanging(explored)).toBe(false)
  })

  test('a Battle won changes code; a Battle spawned does not', () => {
    const spawned = step(newGame(), { type: 'TEST_FAIL', check: 'npm test', kind: 'test', failures: 2 })
    const won = step(spawned.state, { type: 'TEST_PASS', check: 'npm test', kind: 'test' })

    expect(isCodeChanging(spawned.state.encounter!)).toBe(false)
    expect(isCodeChanging(won.state.encounter!)).toBe(true)
  })

  test('forging can level the Player up', () => {
    const nearly = { ...newGame(), player: { ...newGame().player, xp: 95 } }

    expect(step(nearly, newFile).effects).toContainEqual({ type: 'LEVEL_UP', level: 2 })
  })
})

describe('Game Engine: the item forged is named after the component', () => {
  const named: [string, string][] = [
    ['/work/forge/src/order-ledger.ts', 'Order Ledger'],
    ['src/user_profile.py', 'User Profile'],
    ['src/sceneArt.ts', 'Scene Art'],
    ['src/HTTPServer.go', 'HTTP Server'],
    ['tests/battle.test.tsx', 'Battle Test'],
    ['src/quest-board/index.ts', 'Quest Board'],
    ['pkg/my_module/__init__.py', 'My Module'],
    ['Makefile', 'Makefile'],
    ['.gitignore', 'Gitignore'],
    ['index.ts', 'Index'],
  ]
  for (const [path, item] of named) {
    test(`${path} forges the ${item}`, () => {
      expect(itemNameOf(path)).toBe(item)
    })
  }
})

describe('Game Engine: what the Sage asks about', () => {
  const fail = (failures: number) =>
    ({ type: 'TEST_FAIL', check: 'npm test', kind: 'test', failures }) as const
  const pass = { type: 'TEST_PASS', check: 'npm test', kind: 'test' } as const
  /** A one-line edit: too small to forge, but part of a fix. */
  const fix = (path: string, diff = `@@ -3,1 +3,1 @@\n-  return a - b\n+  return a + b`) => ({
    type: 'FILE_EDIT' as const,
    path,
    module: 'src',
    isNewFile: false,
    linesBefore: 20,
    linesAdded: 1,
    linesRemoved: 1,
    diff,
  })

  const play = (...events: Parameters<typeof step>[1][]) => {
    let state = newGame()
    let effects: ReturnType<typeof step>['effects'] = []
    for (const event of events) {
      ;({ state, effects } = step(state, event))
    }

    return { state, effects }
  }

  test('a Battle won asks about the edits made while it stood: the fix', () => {
    const { effects } = play(
      fail(2),
      fix('src/sum.ts'),
      fix('src/format.ts', '@@ -1,1 +1,1 @@\n-const sep = ","\n+const sep = ", "'),
      pass,
    )

    expect(effects.filter(effect => effect.type === 'CODE_CHANGED')).toEqual([
      {
        type: 'CODE_CHANGED',
        changes: [
          { path: 'src/sum.ts', diff: '@@ -3,1 +3,1 @@\n-  return a - b\n+  return a + b' },
          { path: 'src/format.ts', diff: '@@ -1,1 +1,1 @@\n-const sep = ","\n+const sep = ", "' },
        ],
      },
    ])
  })

  test('a Battle won with no edit made while it stood asks nothing: no code changed', () => {
    const { effects } = play(fail(2), pass)

    expect(effects.some(effect => effect.type === 'CODE_CHANGED')).toBe(false)
  })

  test('an edit made before the Battle is no part of its fix', () => {
    const { effects } = play(fix('src/old.ts'), fail(1), fix('src/sum.ts'), pass)

    expect(effects.find(effect => effect.type === 'CODE_CHANGED')).toEqual({
      type: 'CODE_CHANGED',
      changes: [{ path: 'src/sum.ts', diff: '@@ -3,1 +3,1 @@\n-  return a - b\n+  return a + b' }],
    })
  })

  test(`only the latest ${MAX_FIX_EDITS} edits of a long Battle are asked about`, () => {
    const edits = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(name => fix(`src/${name}.ts`))

    const { effects } = play(fail(1), ...edits, pass)

    const changed = effects.find(effect => effect.type === 'CODE_CHANGED')
    expect(changed?.type === 'CODE_CHANGED' && changed.changes.map(change => change.path)).toEqual([
      'src/c.ts',
      'src/d.ts',
      'src/e.ts',
      'src/f.ts',
      'src/g.ts',
    ])
  })

  test('the Battle Encounter shows the monster, not the edits', () => {
    const { state } = play(fail(1), fix('src/sum.ts'), pass)

    expect(state.encounter).toEqual({
      kind: 'Battle',
      check: 'npm test',
      foe: 'test',
      hp: 0,
      maxHp: 1,
      hits: 1,
      outcome: 'won',
      isCounted: true,
    })
  })
})

describe('Game Engine: the Question Queue', () => {
  const content: QuestionContent = {
    prompt: 'When does total() apply the bulk discount?',
    options: ['At or above the threshold', 'Below it', 'Always', 'Never'],
    answer: 0,
    explanation: 'The new branch checks subtotal >= BULK_THRESHOLD before discounting.',
    stat: 'intelligence',
    source: { path: 'src/order-ledger.ts', lines: ['  if (subtotal >= BULK_THRESHOLD) {'] },
  }
  const T = Date.UTC(2026, 9, 23, 20, 0)
  const ready = (at = T, question = content) => ({ type: 'QUESTION_READY', question, at }) as const

  /** Steps `state` through `events`, answering the last step. */
  const play = (state: GameState, ...events: Parameters<typeof step>[1][]) => {
    let effects: ReturnType<typeof step>['effects'] = []
    for (const event of events) {
      ;({ state, effects } = step(state, event))
    }

    return { state, effects }
  }

  test('a new game has no Question waiting', () => {
    expect(newGame().questions).toEqual([])
    expect(newGame().lastAnswer).toBeNull()
  })

  test('a generated Question joins the queue as the Sage\'s, not yet shown', () => {
    const { state, effects } = play(newGame(), ready())

    expect(state.questions).toEqual([
      { ...content, id: 'sage-1', npc: 'Sage', queuedAt: T, shownAt: null },
    ])
    expect(effects).toEqual([{ type: 'QUESTION_QUEUED', id: 'sage-1', waiting: 1 }])
  })

  test('Questions wait oldest first, each with an id of its own', () => {
    const { state, effects } = play(newGame(), ready(T), ready(T + 1000, { ...content, prompt: 'Why?' }))

    expect(state.questions.map(question => [question.id, question.prompt])).toEqual([
      ['sage-1', 'When does total() apply the bulk discount?'],
      ['sage-2', 'Why?'],
    ])
    expect(effects).toEqual([{ type: 'QUESTION_QUEUED', id: 'sage-2', waiting: 2 }])
  })

  test('an id is never reused, even once its Question is answered', () => {
    const { state } = play(
      newGame(),
      ready(),
      { type: 'QUESTION_ANSWERED', id: 'sage-1', choice: 0, at: T + 5000 },
      ready(T + 6000),
    )

    expect(state.questions.map(question => question.id)).toEqual(['sage-2'])
  })

  test('showing a Question records when the Player first saw it', () => {
    const { state } = play(
      newGame(),
      ready(),
      { type: 'QUESTION_SHOWN', id: 'sage-1', at: T + 60_000 },
      { type: 'QUESTION_SHOWN', id: 'sage-1', at: T + 90_000 },
    )

    expect(state.questions[0]?.shownAt).toBe(T + 60_000)
  })

  test(`a right answer earns ${QUESTION_XP} Intelligence XP and shows the explanation`, () => {
    const { state, effects } = play(
      newGame(),
      ready(),
      { type: 'QUESTION_SHOWN', id: 'sage-1', at: T + 60_000 },
      { type: 'QUESTION_ANSWERED', id: 'sage-1', choice: 0, at: T + 72_000 },
    )

    const answer = {
      question: { ...content, id: 'sage-1', npc: 'Sage', queuedAt: T, shownAt: T + 60_000 },
      choice: 0,
      isCorrect: true,
      answeredAt: T + 72_000,
      answerMs: 12_000,
      xp: 20,
      hpLost: 0,
    }
    expect(state.questions).toEqual([])
    expect(state.lastAnswer).toEqual(answer)
    expect(state.player.xp).toBe(20)
    expect(state.player.stats.intelligence).toBe(20)
    expect(state.player.hp).toBe(100)
    expect(effects).toEqual([
      { type: 'QUESTION_ANSWERED', answer },
      { type: 'XP_GAINED', amount: 20, stat: 'intelligence' },
    ])
  })

  test(`a wrong answer costs ${WRONG_ANSWER_HP} HP, earns nothing, and shows the explanation too`, () => {
    const { state, effects } = play(
      newGame(),
      ready(),
      { type: 'QUESTION_SHOWN', id: 'sage-1', at: T + 1000 },
      { type: 'QUESTION_ANSWERED', id: 'sage-1', choice: 2, at: T + 4000 },
    )

    expect(state.questions).toEqual([])
    expect(state.lastAnswer).toMatchObject({
      choice: 2,
      isCorrect: false,
      answerMs: 3000,
      xp: 0,
      hpLost: 10,
      question: { explanation: 'The new branch checks subtotal >= BULK_THRESHOLD before discounting.' },
    })
    expect(state.player.hp).toBe(90)
    expect(state.player.xp).toBe(0)
    expect(state.player.stats.intelligence).toBe(0)
    expect(effects).toEqual([
      {
        type: 'QUESTION_ANSWERED',
        answer: {
          question: { ...content, id: 'sage-1', npc: 'Sage', queuedAt: T, shownAt: T + 1000 },
          choice: 2,
          isCorrect: false,
          answeredAt: T + 4000,
          answerMs: 3000,
          xp: 0,
          hpLost: 10,
        },
      },
      { type: 'HP_LOST', amount: 10 },
    ])
  })

  test('a Wisdom-tagged Question answered right still earns Intelligence XP, the Stat in play', () => {
    const { state } = play(
      newGame(),
      ready(T, { ...content, stat: 'wisdom' }),
      { type: 'QUESTION_ANSWERED', id: 'sage-1', choice: 0, at: T + 9000 },
    )

    expect(state.player.stats).toMatchObject({ intelligence: 20, wisdom: 0 })
  })

  test('HP never drops below zero', () => {
    const worn = { ...newGame(), player: { ...newGame().player, hp: 4 } }

    const { state, effects } = play(worn, ready(), {
      type: 'QUESTION_ANSWERED',
      id: 'sage-1',
      choice: 1,
      at: T + 9000,
    })

    expect(state.player.hp).toBe(0)
    expect(effects).toContainEqual({ type: 'HP_LOST', amount: 4 })
  })

  test('a Question answered without being shown has no answer time', () => {
    const { state } = play(newGame(), ready(), {
      type: 'QUESTION_ANSWERED',
      id: 'sage-1',
      choice: 0,
      at: T + 9000,
    })

    expect(state.lastAnswer?.answerMs).toBeNull()
  })

  test('any waiting Question may be answered, not only the oldest', () => {
    const { state } = play(newGame(), ready(T), ready(T + 1), {
      type: 'QUESTION_ANSWERED',
      id: 'sage-2',
      choice: 0,
      at: T + 9000,
    })

    expect(state.questions.map(question => question.id)).toEqual(['sage-1'])
  })

  test('an answer to no waiting Question, or no option, changes nothing', () => {
    const queued = play(newGame(), ready()).state

    for (const event of [
      { type: 'QUESTION_ANSWERED', id: 'sage-9', choice: 0, at: T } as const,
      { type: 'QUESTION_ANSWERED', id: 'sage-1', choice: 4, at: T } as const,
      { type: 'QUESTION_ANSWERED', id: 'sage-1', choice: -1, at: T } as const,
    ]) {
      expect(step(queued, event)).toEqual({ state: queued, effects: [] })
    }
  })

  test('moving on from an answer puts its explanation away', () => {
    const { state } = play(
      newGame(),
      ready(),
      { type: 'QUESTION_ANSWERED', id: 'sage-1', choice: 0, at: T + 9000 },
      { type: 'ANSWER_DISMISSED' },
    )

    expect(state.lastAnswer).toBeNull()
  })

  test('a right answer can level the Player up', () => {
    const near = { ...newGame(), player: { ...newGame().player, xp: 90 } }

    const { state, effects } = play(near, ready(), {
      type: 'QUESTION_ANSWERED',
      id: 'sage-1',
      choice: 0,
      at: T + 9000,
    })

    expect(state.player).toMatchObject({ level: 2, xp: 10 })
    expect(effects).toContainEqual({ type: 'LEVEL_UP', level: 2 })
  })
})
