import { describe, expect, test } from 'claude-code/testing'

import { BOSS_ANSWER_XP, DEFAULT_RULES, HASTY_ANSWER_XP, MAX_QUEST_CHANGES, isCodeChanging, itemNameOf, MAJOR_EDIT_LINES, MIN_CRAFT_LINES, MAX_FIX_EDITS, QUESTION_XP, REWRITE_SHARE, TICKET_SOURCE, WRONG_ANSWER_HP, manaLevel, newGame, npcOf, questXp, step } from '../src/engine'
import type { GameState, QuestionContent } from '../types'

describe('Game Engine: a new Player', () => {
  test('starts at level 1 with no XP, full HP, no Stats and an empty tally', () => {
    const { player } = newGame()

    expect(player).toEqual({
      level: 1,
      xp: 0,
      totalXp: 0,
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
      tally: { questsClosed: 0, bossesWon: 0, bossStreak: 0, sageRight: 0, modulesDiscovered: 0, regions: [] },
    })
  })
})

describe('Game Engine: Exploration', () => {
  test('a file read starts an Exploration Encounter and earns 1 XP', () => {
    const visited = { ...newGame(), visitedModules: ['src'] }

    const { state, effects } = step(visited, {
      type: 'FILE_READ',
      path: 'src/engine.ts',
      module: 'src',
    })

    expect(state.player.xp).toBe(1)
    const encounter = { kind: 'Exploration', target: 'src/engine.ts', module: 'src', isFirstVisit: false, xp: 1 }
    expect(state.encounter).toEqual(encounter)
    expect(effects).toEqual([
      { type: 'ENCOUNTER_STARTED', encounter },
      { type: 'XP_GAINED', amount: 1 },
    ])
  })
})

describe('Game Engine: first visit to a module', () => {
  test('a new game has visited no module', () => {
    expect(newGame().visitedModules).toEqual([])
  })

  test('the first read in a module earns 5 bonus Wisdom XP on top of the 1', () => {
    const { state, effects } = step(newGame(), {
      type: 'FILE_READ',
      path: 'src/engine.ts',
      module: 'src',
    })

    expect(state.player.xp).toBe(6)
    expect(state.visitedModules).toEqual(['src'])
    const encounter = { kind: 'Exploration', target: 'src/engine.ts', module: 'src', isFirstVisit: true, xp: 6, discoveryXp: 5 }
    expect(state.encounter).toEqual(encounter)
    expect(effects).toEqual([
      { type: 'ENCOUNTER_STARTED', encounter },
      { type: 'XP_GAINED', amount: 1 },
      { type: 'MODULE_DISCOVERED', module: 'src' },
      { type: 'XP_GAINED', amount: 5, stat: 'wisdom' },
    ])
  })

  test('a repeat visit to the module earns only the 1', () => {
    const first = step(newGame(), { type: 'FILE_READ', path: 'src/engine.ts', module: 'src' })

    const { state, effects } = step(first.state, {
      type: 'FILE_READ',
      path: 'src/hud.tsx',
      module: 'src',
    })

    expect(state.player.xp).toBe(7)
    expect(state.visitedModules).toEqual(['src'])
    expect(state.encounter).toMatchObject({ module: 'src', isFirstVisit: false })
    expect(effects).not.toContainEqual({ type: 'MODULE_DISCOVERED', module: 'src' })
    expect(effects).toContainEqual({ type: 'XP_GAINED', amount: 1 })
  })

  test('each module is a first visit of its own, a nested one included', () => {
    const first = step(newGame(), { type: 'FILE_READ', path: 'src/engine.ts', module: 'src' })
    const second = step(first.state, { type: 'FILE_READ', path: 'tests/engine.test.ts', module: 'tests' })
    const third = step(second.state, {
      type: 'FILE_READ',
      path: 'tests/fixtures/tool-calls.ts',
      module: 'tests/fixtures',
    })

    expect(third.state.player.xp).toBe(18)
    expect(third.state.visitedModules).toEqual(['src', 'tests', 'tests/fixtures'])
  })

  test('a module visited in an earlier session is no first visit', () => {
    const remembered = { ...newGame(), visitedModules: ['src'] }

    const { state } = step(remembered, { type: 'FILE_READ', path: 'src/hud.tsx', module: 'src' })

    expect(state.player.xp).toBe(1)
  })

  test('a read outside the project discovers nothing and earns only the 1', () => {
    const { state, effects } = step(newGame(), {
      type: 'FILE_READ',
      path: '/home/marco/.claude/settings.json',
      module: null,
    })

    expect(state.player.xp).toBe(1)
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
          xp: 1,
        },
      },
      { type: 'XP_GAINED', amount: 1 },
    ])
  })

  test('the bonus counts toward levelling up', () => {
    const start = newGame({ ...newGame().player, xp: 96, totalXp: 96 })

    const { state, effects } = step(start, { type: 'FILE_READ', path: 'a.ts', module: '.' })

    expect(state.player).toMatchObject({ level: 2, xp: 2 })
    expect(effects).toContainEqual({ type: 'LEVEL_UP', level: 2 })
  })
})

describe('Game Engine: levelling', () => {
  test('crossing 100 XP at level 1 reaches level 2, carrying the rest over', () => {
    const start = newGame({ ...newGame().player, xp: 98, totalXp: 98 })

    const { state, effects } = step(start, { type: 'FILE_READ', path: 'a.ts', module: '.' })

    expect(state.player.level).toBe(2)
    expect(state.player.xp).toBe(4)
    expect(effects).toContainEqual({ type: 'LEVEL_UP', level: 2 })
  })

  test('level 2 takes 150 XP to clear', () => {
    const start = { ...newGame({ ...newGame().player, level: 2, xp: 148, totalXp: 248 }), visitedModules: ['.'] }

    const { state, effects } = step(start, { type: 'FILE_READ', path: 'a.ts', module: '.' })

    expect(state.player).toMatchObject({ level: 2, xp: 149 })
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

    expect(state.quest).toEqual({
      ticket: '#4',
      encounters: [],
      difficulty: 'Unrated',
      pools: { ambient: 0, battle: 0, sage: 0 },
      sageWrong: 0,
    })
    expect(effects).toEqual([{ type: 'QUEST_STARTED', ticket: '#4' }])
  })

  test('a Quest takes the difficulty its ticket was listed with', () => {
    const { state } = step(newGame(), { type: 'QUEST_START', ticket: '#4', difficulty: 'Hard' })

    expect(state.quest?.difficulty).toBe('Hard')
  })

  test('Encounters during the Quest are attached to it, oldest first', () => {
    const questing = step(newGame(), { type: 'QUEST_START', ticket: '#4' }).state

    const once = step(questing, { type: 'FILE_READ', path: 'src/engine.ts', module: 'src' }).state
    const { state } = step(once, { type: 'FILE_READ', path: 'src/hud.tsx', module: 'src' })

    expect(state.quest?.encounters).toEqual([
      { kind: 'Exploration', target: 'src/engine.ts', module: 'src', isFirstVisit: true, xp: 6, discoveryXp: 5 },
      { kind: 'Exploration', target: 'src/hud.tsx', module: 'src', isFirstVisit: false, xp: 1 },
    ])
  })

  test('starting a second Quest abandons the active one and replaces it', () => {
    const questing = step(newGame(), { type: 'QUEST_START', ticket: '#4' }).state
    const explored = step(questing, { type: 'FILE_READ', path: 'a.ts', module: '.' }).state

    const { state, effects } = step(explored, { type: 'QUEST_START', ticket: 'ABC-123' })

    expect(state.quest).toMatchObject({ ticket: 'ABC-123', encounters: [] })
    expect(effects).toEqual([
      { type: 'QUEST_ABANDONED', ticket: '#4' },
      { type: 'QUEST_STARTED', ticket: 'ABC-123' },
    ])
  })

  test('starting the active Quest again carries on with it', () => {
    const questing = step(newGame(), { type: 'QUEST_START', ticket: '#4' }).state
    const explored = step(questing, { type: 'FILE_READ', path: 'a.ts', module: '.' }).state

    const { state, effects } = step(explored, { type: 'QUEST_START', ticket: '#4' })

    expect(state.quest).toMatchObject({
      ticket: '#4',
      encounters: [{ kind: 'Exploration', target: 'a.ts', module: '.', isFirstVisit: true, xp: 6 }],
    })
    expect(effects).toEqual([])
  })
})

describe('Game Engine: Quest details', () => {
  const questing = step(newGame(), { type: 'QUEST_START', ticket: '#4' }).state

  test('the details of the active Quest\'s ticket are kept on it', () => {
    const { state, effects } = step(questing, {
      type: 'QUEST_DETAILS',
      ticket: '#4',
      title: 'Bulk discounts',
      summary: 'Orders of 10 or more get 10% off.',
      difficulty: 'Medium',
      verified: 'found',
    })

    expect(state.quest).toMatchObject({
      ticket: '#4',
      title: 'Bulk discounts',
      summary: 'Orders of 10 or more get 10% off.',
      difficulty: 'Medium',
      verified: 'found',
    })
    // A summary found asks the Quest Giver for the Briefing.
    expect(effects).toEqual([
      { type: 'BRIEFING_WANTED', ticket: '#4', title: 'Bulk discounts', summary: 'Orders of 10 or more get 10% off.' },
    ])
  })

  test('details given in parts keep what came before', () => {
    const titled = step(questing, { type: 'QUEST_DETAILS', ticket: '#4', title: 'Bulk discounts' }).state

    const { state } = step(titled, { type: 'QUEST_DETAILS', ticket: '#4', summary: 'Orders of 10 or more.' })

    expect(state.quest).toMatchObject({ title: 'Bulk discounts', summary: 'Orders of 10 or more.', difficulty: 'Unrated' })
  })

  test('a summary is kept to 1500 characters', () => {
    const { state } = step(questing, { type: 'QUEST_DETAILS', ticket: '#4', summary: 'x'.repeat(4000) })

    expect(state.quest?.summary).toHaveLength(1500)
  })

  test('a difficulty fixed at the start is kept: only an Unrated Quest takes one from its details', () => {
    const rated = step(newGame(), { type: 'QUEST_START', ticket: '#4', difficulty: 'Easy' }).state

    expect(step(rated, { type: 'QUEST_DETAILS', ticket: '#4', difficulty: 'Epic' }).state.quest?.difficulty).toBe('Easy')
    expect(step(questing, { type: 'QUEST_DETAILS', ticket: '#4', difficulty: 'Epic' }).state.quest?.difficulty).toBe('Epic')
    const older = { ...questing, quest: { ...questing.quest!, difficulty: undefined } }
    expect(step(older, { type: 'QUEST_DETAILS', ticket: '#4', difficulty: 'Hard' }).state.quest?.difficulty).toBe('Hard')
  })

  test('details of another ticket (a Quest since replaced) change nothing', () => {
    const { state } = step(questing, { type: 'QUEST_DETAILS', ticket: '#5', title: 'Elsewhere' })

    expect(state).toBe(questing)
    expect(step(newGame(), { type: 'QUEST_DETAILS', ticket: '#4', title: 'x' }).state.quest).toBeNull()
  })
})

describe("Game Engine: the Quest Giver's Briefing", () => {
  const questing = step(newGame(), { type: 'QUEST_START', ticket: '#19' }).state
  const found = { type: 'QUEST_DETAILS', ticket: '#19', title: 'Briefing', summary: 'Brief the Player.', verified: 'found' } as const

  /** A Briefing's Question: about the ticket, no lines. */
  const briefingQuestion: QuestionContent = {
    prompt: 'What defines done?',
    options: ['One call', 'Two calls', 'No call', 'A setting'],
    answer: 0,
    explanation: 'The ticket asks for one call.',
    stat: 'wisdom',
    source: { path: TICKET_SOURCE, lines: [] },
  }
  const T = Date.UTC(2026, 9, 24, 12, 0)
  const KEY = 'briefing:#19:abc'
  const queued = step(questing, { type: 'QUESTION_READY', question: briefingQuestion, at: T, key: KEY, npc: 'quest-giver' })
  const shown = (after: number) => step(queued.state, { type: 'QUESTION_SHOWN', id: 'sage-1', at: T + after }).state

  test("the active Quest's ticket found with a summary wants a Briefing", () => {
    expect(step(questing, found).effects).toEqual([
      { type: 'BRIEFING_WANTED', ticket: '#19', title: 'Briefing', summary: 'Brief the Player.' },
    ])
  })

  test('no summary, a ticket not found, another ticket or no Quest want none', () => {
    expect(step(questing, { type: 'QUEST_DETAILS', ticket: '#19', title: 'Briefing' }).effects).toEqual([])
    expect(step(questing, { ...found, summary: '  ' }).effects).toEqual([])
    expect(step(questing, { ...found, verified: 'not-found' }).effects).toEqual([])
    expect(step(questing, { ...found, ticket: '#20' }).effects).toEqual([])
    expect(step(newGame(), found).effects).toEqual([])
  })

  test('with no Sage budget per ticket there is no Briefing', () => {
    expect(step(questing, found, { ...DEFAULT_RULES, sageCallsPerQuest: 0 }).effects).toEqual([])
  })

  test("its Question waits in the Question Queue as the Quest Giver's", () => {
    expect(queued.state.questions).toEqual([
      { ...briefingQuestion, key: KEY, id: 'sage-1', npc: 'quest-giver', queuedAt: T, shownAt: null },
    ])
    expect(queued.effects).toEqual([{ type: 'QUESTION_QUEUED', id: 'sage-1', waiting: 1, npc: 'quest-giver' }])
    expect(npcOf(queued.state.questions[0]!)).toBe('quest-giver')
  })

  test('a Question queued before other NPCs asked is the Sage\'s', () => {
    expect(npcOf({ npc: 'Sage' })).toBe('sage')
    expect(npcOf({} as { npc: 'Sage' })).toBe('sage')
  })

  test('a right answer is paid as a Sage Question: 20 XP to its Stat tag from the sage pool, toward Sage\'s Apprentice', () => {
    const { state } = step(shown(60_000), { type: 'QUESTION_ANSWERED', id: 'sage-1', choice: 0, at: T + 90_000 })

    expect(state.player.stats.wisdom).toBe(QUESTION_XP)
    expect(state.quest?.pools?.sage).toBe(QUESTION_XP)
    expect(state.player.tally.sageRight).toBe(1)
    expect(state.answeredKeys).toEqual([KEY])
  })

  test('a hasty right answer earns a quarter: the ticket is non-trivial reading', () => {
    const { state } = step(shown(0), { type: 'QUESTION_ANSWERED', id: 'sage-1', choice: 0, at: T + 1000 })

    expect(state.lastAnswer?.isHasty).toBe(true)
    expect(state.player.stats.wisdom).toBe(HASTY_ANSWER_XP)
    expect(state.player.tally.sageRight).toBe(0)
  })

  test('a wrong answer costs 10 HP and spoils Flawless', () => {
    const { state } = step(shown(60_000), { type: 'QUESTION_ANSWERED', id: 'sage-1', choice: 1, at: T + 90_000 })

    expect(state.player.hp).toBe(questing.player.hp - WRONG_ANSWER_HP)
    expect(state.quest?.sageWrong).toBe(1)
  })

  test('once answered, the same Briefing is not queued again', () => {
    const answered = step(shown(60_000), { type: 'QUESTION_ANSWERED', id: 'sage-1', choice: 0, at: T + 90_000 }).state

    const again = step(answered, { type: 'QUESTION_READY', question: briefingQuestion, at: T + 100_000, key: KEY, npc: 'quest-giver' })

    expect(again.state.questions).toEqual([])
    expect(again.effects).toEqual([])
  })
})

describe('Game Engine: Quest rewards', () => {
  test('the Quest reward grows with difficulty, 40 to 180', () => {
    expect(questXp('Trivial')).toBe(40)
    expect(questXp('Easy')).toBe(60)
    expect(questXp('Medium')).toBe(100)
    expect(questXp('Hard')).toBe(140)
    expect(questXp('Epic')).toBe(180)
  })

  test('a Quest whose ticket names no size is unrated and rewards between Easy and Medium', () => {
    expect(questXp('Unrated')).toBe(80)
  })
})

describe('Game Engine: Battle', () => {
  const fail = (failures: number | null, check = 'vitest run') =>
    ({ type: 'TEST_FAIL', check, kind: 'test', failures }) as const
  const pass = (check = 'vitest run') => ({ type: 'TEST_PASS', check, kind: 'test' }) as const
  /** A one-line fix, made while a Battle stands. */
  const fix = {
    type: 'FILE_EDIT',
    path: 'src/a.ts',
    module: 'src',
    isNewFile: false,
    linesBefore: 40,
    linesAdded: 1,
    linesRemoved: 1,
    diff: '@@ -1 +1 @@\n-a\n+b',
  } as const

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

  test('the first counted run keeps its HP as what the win pays by', () => {
    expect(play(fail(3)).state.battles[0]?.firstHp).toBe(3)
    expect(play(fail(3), fail(5)).state.battles[0]?.firstHp).toBe(3)
    expect(play(fail(null)).state.battles[0]).not.toHaveProperty('firstHp')
  })

  test('a one-HP placeholder then a counted run respawns the monster at the count', () => {
    const { state, effects } = play(fail(null), fail(4))

    const encounter = {
      kind: 'Battle',
      check: 'vitest run',
      foe: 'test',
      hp: 4,
      maxHp: 4,
      hits: 0,
      outcome: 'spawned',
      isCounted: true,
    }
    expect(state.encounter).toEqual(encounter)
    expect(effects).toEqual([{ type: 'ENCOUNTER_STARTED', encounter }])
    expect(state.battles[0]).toMatchObject({ hp: 4, maxHp: 4, firstHp: 4, isCounted: true })
  })

  test('a respawned monster keeps the edits made while the placeholder stood', () => {
    const { state } = play(fail(null), fix, fail(5), pass())

    expect(state.encounter).toMatchObject({ outcome: 'won', xp: 30 })
  })

  test('a failure with no counts mid-Battle leaves the monster as it was', () => {
    const { state } = play(fail(3), fail(null))

    expect(state.encounter).toMatchObject({ hp: 3, hits: 0, outcome: 'stands' })
  })

  test('all green wins: the last hits land and Strength XP is earned, 10 per HP', () => {
    const { state, effects } = play(fail(3), fix, fail(1), pass())

    expect(state.encounter).toMatchObject({ hp: 0, maxHp: 3, hits: 1, outcome: 'won', xp: 30 })
    expect(effects).toEqual([
      { type: 'ENCOUNTER_UPDATED', encounter: state.encounter },
      { type: 'MONSTER_HIT', check: 'vitest run', hits: 1, hp: 0 },
      { type: 'BATTLE_WON', check: 'vitest run', foe: 'test' },
      { type: 'CODE_CHANGED', changes: [{ path: 'src/a.ts', diff: fix.diff }] },
      { type: 'XP_GAINED', amount: 30, stat: 'strength' },
      // 30 is the session's whole battle pool outside a Quest.
      { type: 'XP_CAPPED', pool: 'battle' },
      { type: 'BADGE_EARNED', badge: { id: 'first-blood', name: 'First Blood' } },
    ])
    expect(state.player.xp).toBe(30)
    expect(state.player.stats.strength).toBe(30)
  })

  test('a one-HP monster won earns 10 Strength XP', () => {
    const { state } = play(fail(null), fix, pass())

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

  test('a new Quest for another ticket clears the Battles under way, silently', () => {
    const questing = play({ type: 'QUEST_START', ticket: '#8' }, fail(3), fix).state

    const { state, effects } = step(questing, { type: 'QUEST_START', ticket: '#9' })

    expect(state.battles).toEqual([])
    expect(effects.map(effect => effect.type)).toEqual(['QUEST_ABANDONED', 'QUEST_STARTED'])
    // The check passing now plays nothing: its Battle is gone.
    expect(step(state, pass()).effects).toEqual([])
  })

  test('a Quest started between Quests clears the Battles left from before it', () => {
    const { state } = play(fail(3), { type: 'QUEST_START', ticket: '#9' })

    expect(state.battles).toEqual([])
  })

  test('the same Quest started again keeps its Battles', () => {
    const { state } = play({ type: 'QUEST_START', ticket: '#8' }, fail(3), { type: 'QUEST_START', ticket: '#8' })

    expect(state.battles).toHaveLength(1)
  })

  test('a Quest closing clears the Battles under way, paying nothing for them', () => {
    const fighting = play(
      { type: 'QUEST_START', ticket: '#8' },
      fail(3),
      fix,
      { type: 'COMMIT', sha: 'abc1234', cwd: null },
    ).state

    const { state, effects } = step(fighting, { type: 'BOSS_FIGHT_SKIPPED' })

    expect(state.battles).toEqual([])
    expect(effects.map(effect => effect.type)).toEqual(['QUEST_CLOSED'])
  })

  test('winning can level the Player up', () => {
    const nearly = newGame({ ...newGame().player, xp: 90, totalXp: 90 })
    const { effects } = [fail(10), fix, pass()].reduce(
      (played, event) => step(played.state, event),
      { state: nearly, effects: [] as ReturnType<typeof step>['effects'] },
    )

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

  test('a new file is forged: a Crafting Encounter of the item named after it, for 5 XP', () => {
    const { state, effects } = step(newGame(), newFile)

    const encounter = {
      kind: 'Crafting',
      target: '/work/forge/src/user-profile-card.tsx',
      module: 'src',
      item: 'User Profile Card',
      isNewFile: true,
      linesAdded: 23,
      linesRemoved: 0,
      xp: 5,
    }
    expect(state.encounter).toEqual(encounter)
    expect(state.player.xp).toBe(5)
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
      { type: 'XP_GAINED', amount: 5 },
    ])
  })

  test('a new file of 3 lines is forged', () => {
    expect(MIN_CRAFT_LINES).toBe(3)

    const { state } = step(newGame(), { ...newFile, linesAdded: 3 })

    expect(state.encounter?.kind).toBe('Crafting')
  })

  test('a new file of 2 lines or fewer forges nothing: an empty stub is no item', () => {
    const before = newGame()

    expect(step(before, { ...newFile, linesAdded: 2 })).toEqual({ state: before, effects: [] })
    expect(step(before, { ...newFile, linesAdded: 0 }).effects).toEqual([])
  })

  test('an Edit of every occurrence (a rename) is never major, however many lines', () => {
    const before = newGame()

    expect(step(before, { ...edit(32, 32), replaceAll: true })).toEqual({ state: before, effects: [] })
    expect(step(before, { ...edit(5, 5, 'src/config.ts', 5), replaceAll: true }).effects).toEqual([])
  })

  test('a replace-all Edit is still kept in the Quest\'s changes and a Battle\'s fix', () => {
    const questing = step(newGame(), { type: 'QUEST_START', ticket: '#9' }).state
    const fighting = step(questing, { type: 'TEST_FAIL', check: 'tsc', kind: 'typecheck', failures: 2 }).state

    const { state } = step(fighting, { ...edit(32, 32), replaceAll: true })

    expect(state.quest?.changes).toEqual([{ path: '/work/forge/src/order-ledger.ts', diff: '@@ -1,1 +1,1 @@\n-a\n+b' }])
    expect(state.battles[0]?.edits).toEqual([{ path: '/work/forge/src/order-ledger.ts', diff: '@@ -1,1 +1,1 @@\n-a\n+b' }])
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

  test('a rewrite of a 3-line file forges: every line replaced, 3 lines changed', () => {
    expect(step(newGame(), edit(3, 3, 'src/config.ts', 3)).state.encounter?.kind).toBe('Crafting')
  })

  test('rewriting a 2-line file is too small to forge, though every line was replaced', () => {
    expect(step(newGame(), edit(2, 2, 'src/config.ts', 2)).effects).toEqual([])
    expect(step(newGame(), edit(1, 1, 'src/one.ts', 1)).effects).toEqual([])
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
    const nearly = { ...newGame(), player: { ...newGame().player, xp: 96, totalXp: 96 } }

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
      xp: 10,
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
      isHasty: false,
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
          isHasty: false,
          xp: 0,
          hpLost: 10,
        },
      },
      { type: 'HP_LOST', amount: 10 },
    ])
  })

  test('a Wisdom-tagged Question answered right earns Wisdom XP, its tag', () => {
    const { state } = play(
      newGame(),
      ready(T, { ...content, stat: 'wisdom' }),
      { type: 'QUESTION_ANSWERED', id: 'sage-1', choice: 0, at: T + 9000 },
    )

    expect(state.player.stats).toMatchObject({ intelligence: 0, wisdom: 20 })
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
    const near = { ...newGame(), player: { ...newGame().player, xp: 90, totalXp: 90 } }

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

describe('Game Engine: the Haiku budget', () => {
  const rules = { ...DEFAULT_RULES, sageCallsPerQuest: 2, bossFightCallsPerQuest: 1, sageCallsOutsideQuest: 1 }
  const sage = { type: 'HAIKU_CALL_REQUESTED', purpose: 'sage' } as const
  const boss = { type: 'HAIKU_CALL_REQUESTED', purpose: 'boss' } as const
  const questing = step(newGame(), { type: 'QUEST_START', ticket: '#11' }).state

  /** Steps `state` through `events` under `rules`, keeping every effect. */
  const requests = (state: GameState, ...events: Parameters<typeof step>[1][]) => {
    const effects: ReturnType<typeof step>['effects'] = []
    for (const event of events) {
      const stepped = step(state, event, rules)
      state = stepped.state
      effects.push(...stepped.effects)
    }

    return { state, effects }
  }

  test('a Quest grants the Sage its calls, then refuses the one over the limit', () => {
    const { effects } = requests(questing, sage, sage, sage)

    expect(effects).toEqual([
      { type: 'HAIKU_CALL_GRANTED', purpose: 'sage', used: 1, limit: 2 },
      { type: 'HAIKU_CALL_GRANTED', purpose: 'sage', used: 2, limit: 2 },
      { type: 'HAIKU_CALL_REFUSED', purpose: 'sage', used: 2, limit: 2 },
    ])
  })

  test('the Boss Fight has an allowance of its own, beside the Sage\'s', () => {
    const { effects } = requests(questing, sage, sage, boss, boss)

    expect(effects.slice(2)).toEqual([
      { type: 'HAIKU_CALL_GRANTED', purpose: 'boss', used: 1, limit: 1 },
      { type: 'HAIKU_CALL_REFUSED', purpose: 'boss', used: 1, limit: 1 },
    ])
  })

  test('a Quest for another ticket starts with that ticket\'s whole budget', () => {
    const spent = requests(questing, sage, sage).state

    const { effects } = requests(spent, { type: 'QUEST_START', ticket: '#12' }, sage)

    expect(effects).toContainEqual({ type: 'HAIKU_CALL_GRANTED', purpose: 'sage', used: 1, limit: 2 })
  })

  test('the budget is per ticket for the session: switching away and back does not refill it', () => {
    const spent = requests(questing, sage, sage, boss).state

    const { effects } = requests(
      spent,
      { type: 'QUEST_START', ticket: '#12' },
      { type: 'QUEST_START', ticket: '#11' },
      sage,
      boss,
    )

    expect(effects.filter(effect => effect.type.startsWith('HAIKU'))).toEqual([
      { type: 'HAIKU_CALL_REFUSED', purpose: 'sage', used: 2, limit: 2 },
      { type: 'HAIKU_CALL_REFUSED', purpose: 'boss', used: 1, limit: 1 },
    ])
  })

  test('a Quest closed and started again keeps what its ticket spent', () => {
    const spent = requests(questing, sage, sage).state
    const closed = requests(spent, { type: 'COMMIT', sha: 'abc1234', cwd: null }, { type: 'BOSS_FIGHT_SKIPPED' }).state
    expect(closed.quest).toBeNull()

    const { effects } = requests(closed, { type: 'QUEST_START', ticket: '#11' }, sage)

    expect(effects).toContainEqual({ type: 'HAIKU_CALL_REFUSED', purpose: 'sage', used: 2, limit: 2 })
  })

  test('a refunded call (a transient failure) is given back to the ticket it was spent on', () => {
    const spent = requests(questing, sage, sage).state

    const { effects } = requests(spent, { type: 'HAIKU_CALL_REFUNDED', purpose: 'sage', ticket: '#11' }, sage)

    expect(effects).toEqual([{ type: 'HAIKU_CALL_GRANTED', purpose: 'sage', used: 2, limit: 2 }])
  })

  test('a refund between Quests goes back to the session\'s allowance', () => {
    const spent = requests(newGame(), sage).state

    const { effects } = requests(spent, { type: 'HAIKU_CALL_REFUNDED', purpose: 'sage', ticket: null }, sage)

    expect(effects).toEqual([{ type: 'HAIKU_CALL_GRANTED', purpose: 'sage', used: 1, limit: 1 }])
  })

  test('Haiku unavailable is told once, and every later call is refused for the session', () => {
    const { state, effects } = requests(questing, { type: 'HAIKU_UNAVAILABLE' }, { type: 'HAIKU_UNAVAILABLE' }, sage, boss)

    expect(state.haikuUnavailable).toBe(true)
    expect(effects).toEqual([
      { type: 'HAIKU_UNAVAILABLE' },
      { type: 'HAIKU_CALL_REFUSED', purpose: 'sage', used: 0, limit: 2, reason: 'unavailable' },
      { type: 'HAIKU_CALL_REFUSED', purpose: 'boss', used: 0, limit: 1, reason: 'unavailable' },
    ])
  })

  test('a Sage call for a change already asked about (answered, or waiting) is refused and spends nothing', () => {
    const T = Date.UTC(2026, 9, 23, 20, 0)
    const content: QuestionContent = {
      prompt: 'Q?',
      options: ['a', 'b', 'c', 'd'],
      answer: 0,
      explanation: 'e',
      stat: 'intelligence',
      source: { path: 'a.ts', lines: ['x'] },
    }
    const waiting = step(questing, { type: 'QUESTION_READY', question: content, at: T, key: 'change-1' }).state

    const { state, effects } = requests(waiting, { ...sage, key: 'change-1' }, { ...sage, key: 'change-2' })

    expect(effects).toEqual([
      { type: 'HAIKU_CALL_REFUSED', purpose: 'sage', used: 0, limit: 2, reason: 'asked' },
      { type: 'HAIKU_CALL_GRANTED', purpose: 'sage', used: 1, limit: 2 },
    ])
    expect(state.haikuCallsByTicket).toEqual({ '#11': { sage: 1, boss: 0 } })
  })

  test('outside a Quest the Sage has a small allowance for the session, and the Boss Fight none', () => {
    const { effects } = requests(newGame(), sage, sage, boss)

    expect(effects).toEqual([
      { type: 'HAIKU_CALL_GRANTED', purpose: 'sage', used: 1, limit: 1 },
      { type: 'HAIKU_CALL_REFUSED', purpose: 'sage', used: 1, limit: 1 },
      { type: 'HAIKU_CALL_REFUSED', purpose: 'boss', used: 0, limit: 0 },
    ])
  })

  test('the default budget is ten Sage calls and three Boss Fight calls per Quest', () => {
    expect(DEFAULT_RULES).toMatchObject({ sageCallsPerQuest: 10, bossFightCallsPerQuest: 3 })
  })
})

describe('Game Engine: hasty answers', () => {
  const T = Date.UTC(2026, 9, 23, 20, 0)
  const lines = ['  const subtotal = sum(lines)', '  if (subtotal >= BULK_THRESHOLD) {', '    return subtotal * 0.9']
  const content: QuestionContent = {
    prompt: 'When does total() apply the bulk discount?',
    options: ['At or above the threshold', 'Below it', 'Always', 'Never'],
    answer: 0,
    explanation: 'The new branch checks subtotal >= BULK_THRESHOLD before discounting.',
    stat: 'intelligence',
    source: { path: 'src/order-ledger.ts', lines },
  }

  /** A Question pointing at `source` lines, shown at T, answered right after `ms`. */
  const answeredAfter = (ms: number | null, source = lines) => {
    let state = step(newGame(), {
      type: 'QUESTION_READY',
      question: { ...content, source: { ...content.source, lines: source } },
      at: T,
    }).state
    if (ms !== null) {
      state = step(state, { type: 'QUESTION_SHOWN', id: 'sage-1', at: T }).state
    }

    return step(state, { type: 'QUESTION_ANSWERED', id: 'sage-1', choice: 0, at: T + (ms ?? 9000) })
  }

  test(`a right answer within 5 s to a Question of 3 lines earns ${HASTY_ANSWER_XP} XP, not ${QUESTION_XP}`, () => {
    const { state, effects } = answeredAfter(4999)

    expect(state.lastAnswer).toMatchObject({ isCorrect: true, isHasty: true, xp: 5 })
    expect(state.player.stats.intelligence).toBe(5)
    expect(effects).toContainEqual({ type: 'XP_GAINED', amount: 5, stat: 'intelligence' })
  })

  test('a right answer taking 5 s or more earns full XP', () => {
    const { state } = answeredAfter(5000)

    expect(state.lastAnswer).toMatchObject({ isHasty: false, xp: 20 })
  })

  test('a quick right answer to a trivial Question, under 3 lines, earns full XP', () => {
    const { state } = answeredAfter(1000, lines.slice(0, 2))

    expect(state.lastAnswer).toMatchObject({ isHasty: false, xp: 20 })
  })

  test('a right answer with no answer time (never shown first) to a non-trivial Question is hasty', () => {
    const { state } = answeredAfter(null)

    expect(state.lastAnswer).toMatchObject({ answerMs: null, isHasty: true, xp: HASTY_ANSWER_XP })
  })

  test('a right answer with no answer time to a trivial Question earns full XP', () => {
    const { state } = answeredAfter(null, lines.slice(0, 2))

    expect(state.lastAnswer).toMatchObject({ answerMs: null, isHasty: false, xp: QUESTION_XP })
  })

  test('the thresholds are the Player\'s rules', () => {
    let state = step(newGame(), { type: 'QUESTION_READY', question: content, at: T }).state
    state = step(state, { type: 'QUESTION_SHOWN', id: 'sage-1', at: T }).state

    const strict = step(state, { type: 'QUESTION_ANSWERED', id: 'sage-1', choice: 0, at: T + 9000 }, {
      ...DEFAULT_RULES,
      hastyAnswerMs: 10_000,
      nonTrivialLines: 1,
    })

    expect(strict.state.lastAnswer).toMatchObject({ isHasty: true, xp: 5 })
  })

  test('a quick wrong answer still costs HP, and is not hasty: haste only trims a reward', () => {
    let state = step(newGame(), { type: 'QUESTION_READY', question: content, at: T }).state
    state = step(state, { type: 'QUESTION_SHOWN', id: 'sage-1', at: T }).state

    const { state: after } = step(state, { type: 'QUESTION_ANSWERED', id: 'sage-1', choice: 1, at: T + 1000 })

    expect(after.lastAnswer).toMatchObject({ isCorrect: false, isHasty: false, xp: 0, hpLost: 10 })
  })
})

describe('Game Engine: the Boss Fight is summoned by the first commit', () => {
  const commit = (sha = '7ab19e4', cwd: string | null = null) => ({ type: 'COMMIT', sha, cwd }) as const
  const edit = (path: string, diff: string) => ({
    type: 'FILE_EDIT' as const,
    path,
    module: 'src',
    isNewFile: false,
    linesBefore: 40,
    linesAdded: 1,
    linesRemoved: 1,
    diff,
  })
  const questing = step(newGame(), { type: 'QUEST_START', ticket: '#12' }).state

  test('a new game has no Boss Fight', () => {
    expect(newGame().bossFight).toBeNull()
  })

  test('the first commit in an active Quest summons its Boss Fight, with the commit and the Quest\'s changes', () => {
    const edited = step(questing, edit('/work/vault/src/vault.ts', '@@ -1 +1 @@\n-a\n+b')).state

    const { state, effects } = step(edited, commit('7ab19e4', 'vault'))

    expect(effects).toEqual([
      {
        type: 'BOSS_FIGHT_SUMMONED',
        ticket: '#12',
        sha: '7ab19e4',
        cwd: 'vault',
        changes: [{ path: '/work/vault/src/vault.ts', diff: '@@ -1 +1 @@\n-a\n+b' }],
      },
    ])
    expect(state.bossFight).toEqual({
      ticket: '#12',
      sha: '7ab19e4',
      cwd: 'vault',
      status: 'summoned',
      hp: 0,
      maxHp: 0,
      questions: [],
      lastAnswer: null,
    })
    expect(state.quest?.ticket).toBe('#12')
  })

  test('later commits in the same Quest summon no other', () => {
    const summoned = step(questing, commit('7ab19e4')).state

    const { state, effects } = step(summoned, commit('348c470'))

    expect(effects).toEqual([])
    expect(state.bossFight?.sha).toBe('7ab19e4')
  })

  test('a commit outside a Quest summons nothing', () => {
    const { state, effects } = step(newGame(), commit())

    expect(effects).toEqual([])
    expect(state.bossFight).toBeNull()
  })

  test(`a Quest keeps its latest ${MAX_QUEST_CHANGES} changes, for when git cannot give the commit's diff`, () => {
    let state = questing
    for (let n = 0; n < MAX_QUEST_CHANGES + 2; n += 1) {
      state = step(state, edit(`src/file-${n}.ts`, `@@ -1 +1 @@\n+${n}`)).state
    }

    expect(state.quest?.changes).toHaveLength(MAX_QUEST_CHANGES)
    expect(state.quest?.changes?.[0]).toEqual({ path: 'src/file-2.ts', diff: '@@ -1 +1 @@\n+2' })
  })

  test('changes made between Quests belong to none', () => {
    const { state } = step(newGame(), edit('src/a.ts', '@@ -1 +1 @@\n+a'))

    expect(state.quest).toBeNull()
  })
})

describe('Game Engine: the Boss Fight', () => {
  const T = Date.UTC(2026, 9, 23, 21, 0)
  const review = (n: number): QuestionContent => ({
    prompt: `Review question ${n}?`,
    options: ['Right', 'Wrong one', 'Wrong two', 'Wrong three'],
    answer: 0,
    explanation: `Explanation ${n}.`,
    stat: 'intelligence',
    source: { path: 'src/vault.ts', lines: ['  if (vault.locked) {'] },
  })
  const ready = (ticket = '#12') => ({
    type: 'BOSS_FIGHT_READY' as const,
    ticket,
    questions: [review(1), review(2), review(3)],
    at: T,
  })
  const answer = (n: number, choice: number) =>
    ({ type: 'BOSS_ANSWERED', id: `boss-${n}`, choice, at: T + n * 60_000 }) as const

  /** Steps `state` through `events`, keeping every effect. */
  const play = (state: GameState, ...events: Parameters<typeof step>[1][]) => {
    const effects: ReturnType<typeof step>['effects'] = []
    for (const event of events) {
      const stepped = step(state, event)
      state = stepped.state
      effects.push(...stepped.effects)
    }

    return { state, effects }
  }

  const summoned = play(
    newGame(),
    { type: 'QUEST_START', ticket: '#12' },
    { type: 'COMMIT', sha: '7ab19e4', cwd: null },
  ).state
  const fighting = play(summoned, ready()).state

  test('its Questions ready, the fight starts: the boss has two HP for three Questions', () => {
    const { state, effects } = play(summoned, ready())

    expect(effects).toEqual([{ type: 'BOSS_FIGHT_STARTED', ticket: '#12', hp: 2, questionCount: 3 }])
    expect(state.bossFight).toMatchObject({ status: 'fighting', hp: 2, maxHp: 2, questionCount: 3 })
    expect(state.bossFight?.questions.map(question => [question.id, question.npc, question.prompt])).toEqual([
      ['boss-1', 'Boss', 'Review question 1?'],
      ['boss-2', 'Boss', 'Review question 2?'],
      ['boss-3', 'Boss', 'Review question 3?'],
    ])
  })

  test('the boss\'s Questions stay out of the Sage\'s Question Queue', () => {
    expect(fighting.questions).toEqual([])
  })

  test(`a right answer hits the boss and earns ${BOSS_ANSWER_XP} Intelligence XP`, () => {
    const { state, effects } = play(fighting, answer(1, 0))

    expect(state.bossFight).toMatchObject({ status: 'fighting', hp: 1 })
    expect(state.bossFight?.questions.map(question => question.id)).toEqual(['boss-2', 'boss-3'])
    expect(state.bossFight?.lastAnswer).toMatchObject({ isCorrect: true, xp: 30 })
    expect(effects).toContainEqual({ type: 'BOSS_HIT', hp: 1 })
    expect(effects).toContainEqual({ type: 'XP_GAINED', amount: 30, stat: 'intelligence' })
    expect(state.player.stats.intelligence).toBe(30)
  })

  test(`a wrong answer costs ${WRONG_ANSWER_HP} HP and leaves the boss unhurt`, () => {
    const { state, effects } = play(fighting, answer(1, 2))

    expect(state.player.hp).toBe(90)
    expect(state.bossFight).toMatchObject({ status: 'fighting', hp: 2 })
    expect(state.bossFight?.lastAnswer).toMatchObject({ isCorrect: false, hpLost: 10 })
    expect(effects).toContainEqual({ type: 'HP_LOST', amount: 10 })
    expect(effects.some(effect => effect.type === 'BOSS_HIT')).toBe(false)
  })

  test('every Question right wins: the Quest reward, Flawless, a trophy, and the Quest closes won', () => {
    const { state, effects } = play(fighting, answer(1, 0), answer(2, 0), answer(3, 0))

    // 3 right answers (90), an Unrated Quest's reward (80) and Flawless (40):
    // 210 XP, level 2 (at 100) with 110 into it.
    expect(state.player).toMatchObject({ level: 2, xp: 110, totalXp: 210, stats: { intelligence: 210 } })
    expect(state.player.trophies).toEqual([
      { name: 'Bane of #12', region: null, ticket: '#12', earnedAt: T + 180_000 },
    ])
    expect(state.quest).toBeNull()
    expect(state.bossFight).toMatchObject({ status: 'won', hp: 0, questions: [], reward: 120, flawless: true })
    expect(effects).toContainEqual({ type: 'XP_GAINED', amount: 80, stat: 'intelligence' })
    expect(effects).toContainEqual({
      type: 'BADGE_EARNED',
      badge: { id: 'boss-slayer', name: 'Boss Slayer', earnedAt: T + 180_000 },
    })
    expect(effects).toContainEqual({ type: 'QUEST_CLOSED', ticket: '#12', outcome: 'won' })
  })

  test('a trophy joins those the Player already has', () => {
    const decorated = {
      ...fighting,
      player: { ...fighting.player, trophies: [{ name: 'Bane of #11', region: null, ticket: '#11', earnedAt: 1 }] },
    }

    const { state } = play(decorated, answer(1, 0), answer(2, 0), answer(3, 0))

    expect(state.player.trophies?.map(trophy => trophy.ticket)).toEqual(['#11', '#12'])
  })

  test('two of three right win, once every Question is answered: the reward, not Flawless', () => {
    const { state, effects } = play(fighting, answer(1, 1), answer(2, 0), answer(3, 0))

    // 2 right answers (60) and an Unrated Quest's reward (80).
    expect(state.player).toMatchObject({ hp: 100, totalXp: 140 })
    expect(state.bossFight).toMatchObject({ status: 'won', hp: 0, reward: 80, flawless: false, trophy: 'Bane of #12' })
    expect(effects).toContainEqual({ type: 'QUEST_CLOSED', ticket: '#12', outcome: 'won' })
  })

  test('the boss fallen, the Questions left are finishing blows: still asked, still paid, the fight closes after them', () => {
    const fallen = play(fighting, answer(1, 0), answer(2, 0))
    expect(fallen.state.bossFight).toMatchObject({ status: 'fighting', hp: 0 })
    expect(fallen.state.quest).not.toBeNull()

    const { state, effects } = play(fallen.state, answer(3, 1))

    expect(effects.some(effect => effect.type === 'BOSS_HIT')).toBe(false)
    expect(state.bossFight).toMatchObject({ status: 'won', flawless: false })
    expect(state.player.hp).toBe(100)
  })

  test('a finishing blow right pays its XP and keeps the boss at 0 HP', () => {
    const { state, effects } = play(fighting, answer(1, 0), answer(2, 0), answer(3, 0))

    expect(effects.filter(effect => effect.type === 'BOSS_HIT')).toEqual([
      { type: 'BOSS_HIT', hp: 1 },
      { type: 'BOSS_HIT', hp: 0 },
    ])
    expect(state.bossFight).toMatchObject({ hp: 0, flawless: true })
  })

  test('one Question makes a boss of one HP; two make one of two', () => {
    const one = play(summoned, { ...ready(), questions: [review(1)] }).state
    const two = play(summoned, { ...ready(), questions: [review(1), review(2)] }).state

    expect(one.bossFight).toMatchObject({ hp: 1, maxHp: 1, questionCount: 1 })
    expect(two.bossFight).toMatchObject({ hp: 2, maxHp: 2, questionCount: 2 })
  })

  test('the Questions run out with the boss standing: lost, no reward, no trophy, the Quest closes lost', () => {
    const { state, effects } = play(fighting, answer(1, 0), answer(2, 1), answer(3, 2))

    expect(state.player).toMatchObject({ hp: 80, xp: 30, stats: { intelligence: 30 } })
    expect(state.player.trophies).toBeUndefined()
    expect(state.player.badges?.map(badge => badge.id)).toEqual(['first-quest'])
    expect(state.quest).toBeNull()
    expect(state.bossFight).toMatchObject({ status: 'lost', hp: 1, reward: 0 })
    expect(effects).toContainEqual({ type: 'QUEST_CLOSED', ticket: '#12', outcome: 'lost' })
    expect(effects.some(effect => effect.type === 'TROPHY_EARNED')).toBe(false)
  })

  test('skipping closes the Quest without the Boss Fight\'s reward; answers given keep theirs', () => {
    const answered = play(fighting, answer(1, 0)).state
    const { state, effects } = play(answered, { type: 'BOSS_FIGHT_SKIPPED' })

    expect(effects).toEqual([{ type: 'QUEST_CLOSED', ticket: '#12', outcome: 'skipped' }])
    expect(state.player.xp).toBe(30)
    expect(state.player.badges).toBeUndefined()
    expect(state.quest).toBeNull()
    expect(state.bossFight?.status).toBe('skipped')
  })

  test('a Boss Fight still being summoned can be skipped too', () => {
    const { state, effects } = play(summoned, { type: 'BOSS_FIGHT_SKIPPED' })

    expect(effects).toEqual([{ type: 'QUEST_CLOSED', ticket: '#12', outcome: 'skipped' }])
    expect(state.quest).toBeNull()
  })

  test('Questions arriving after a skip start nothing', () => {
    const skipped = play(summoned, { type: 'BOSS_FIGHT_SKIPPED' }).state

    const { state, effects } = play(skipped, ready())

    expect(effects).toEqual([])
    expect(state.bossFight?.status).toBe('skipped')
  })

  test('when no Boss Fight can be made, the Quest closes unfought, for a quarter of its reward', () => {
    const { state, effects } = play(summoned, {
      type: 'BOSS_FIGHT_UNAVAILABLE',
      ticket: '#12',
      reason: 'over budget',
    })

    expect(effects).toContainEqual({ type: 'XP_GAINED', amount: 20, stat: 'intelligence' })
    expect(effects.at(-1)).toEqual({ type: 'QUEST_CLOSED', ticket: '#12', outcome: 'unfought' })
    expect(state.quest).toBeNull()
    expect(state.bossFight).toMatchObject({ status: 'unfought', reward: 20 })
  })

  test('with no Boss Fight under way, an answer or a skip changes nothing', () => {
    const questing = play(newGame(), { type: 'QUEST_START', ticket: '#12' }).state

    for (const event of [answer(1, 0), { type: 'BOSS_FIGHT_SKIPPED' } as const]) {
      const { state, effects } = play(questing, event)
      expect(effects).toEqual([])
      expect(state).toEqual(questing)
    }
  })

  test('an answer to no Question of the fight, or no option, changes nothing', () => {
    for (const event of [answer(9, 0), answer(1, 4)]) {
      const { state, effects } = play(fighting, event)
      expect(effects).toEqual([])
      expect(state).toEqual(fighting)
    }
  })

  test('the next Quest starts with no Boss Fight, and its own first commit summons one', () => {
    const won = play(fighting, answer(1, 0), answer(2, 0), answer(3, 0)).state

    const next = play(won, { type: 'QUEST_START', ticket: '#13' })
    expect(next.state.bossFight).toBeNull()

    const { effects } = play(next.state, { type: 'COMMIT', sha: '691eb59', cwd: null })
    expect(effects).toContainEqual(expect.objectContaining({ type: 'BOSS_FIGHT_SUMMONED', ticket: '#13' }))
  })

  test('starting another Quest mid-fight abandons the Quest and drops its Boss Fight', () => {
    const { state, effects } = play(fighting, { type: 'QUEST_START', ticket: '#13' })

    expect(effects).toContainEqual({ type: 'QUEST_ABANDONED', ticket: '#12' })
    expect(state.bossFight).toBeNull()
  })

  test('a commit after the Quest closed summons nothing: no Quest is active', () => {
    const won = play(fighting, answer(1, 0), answer(2, 0), answer(3, 0)).state

    expect(play(won, { type: 'COMMIT', sha: '691eb59', cwd: null }).effects).toEqual([])
  })
})
