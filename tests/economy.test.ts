// The reward economy (ADR 0002): XP pools, the level curve, HP and
// Exhaustion, the Quest reward, Badges, trophies and titles, through the Game
// Engine's step and its pure helpers.

import { describe, expect, test } from 'claude-code/testing'

import { CRAFTING_XP, earnedBadges, newGame, newPlayer, POOL_CAPS, step, titleOf, xpToClear } from '../src/engine'
import type { GameEvent, GameState, Player, QuestionContent } from '../src/engine'
import { comeBack, emptyParty, setOut, tally } from '../src/party'
import { migratePlayer } from '../src/persistence'

const play = (state: GameState, ...events: GameEvent[]) =>
  events.reduce<{ state: GameState; effects: ReturnType<typeof step>['effects'] }>(
    (played, event) => {
      const next = step(played.state, event)

      return { state: next.state, effects: [...played.effects, ...next.effects] }
    },
    { state, effects: [] },
  )

const read = (path: string, module: string | null = 'src'): GameEvent => ({ type: 'FILE_READ', path, module })

/** `count` reads of files in one Module already visited. */
const reads = (count: number): GameEvent[] =>
  Array.from({ length: count }, (_, at) => read(`src/file-${at}.ts`))

const visited = (state: GameState = newGame()): GameState => ({ ...state, visitedModules: ['src'] })

describe('Economy: levels', () => {
  test('clearing a level takes 100 + 50·(L−1)² XP', () => {
    expect([1, 2, 3, 4, 5, 9].map(xpToClear)).toEqual([100, 150, 300, 550, 900, 3300])
  })

  test('a new Player has no lifetime XP', () => {
    expect(newPlayer()).toMatchObject({ level: 1, xp: 0, totalXp: 0, hp: 100, maxHp: 100 })
  })

  test('level and XP into it follow lifetime XP: 250 total is level 3 with none into it', () => {
    const nearly = visited(newGame({ ...newPlayer(), level: 2, xp: 149, totalXp: 249 }))
    const { state, effects } = step(nearly, read('src/a.ts'))

    expect(state.player).toMatchObject({ level: 3, xp: 0, totalXp: 250 })
    expect(effects).toContainEqual({ type: 'LEVEL_UP', level: 3 })
  })

  test('a level-up heals fully', () => {
    const hurt = visited(newGame({ ...newPlayer(), level: 1, xp: 99, totalXp: 99, hp: 40 }))
    const { state, effects } = step(hurt, read('src/a.ts'))

    expect(state.player.hp).toBe(100)
    expect(effects).toContainEqual({ type: 'HP_HEALED', amount: 60 })
  })
})

describe('Economy: the ambient pool', () => {
  test('a read pays 1 XP, no Stat', () => {
    const { state, effects } = step(visited(), read('src/a.ts'))

    expect(state.player).toMatchObject({ xp: 1, totalXp: 1 })
    expect(effects).toContainEqual({ type: 'XP_GAINED', amount: 1 })
    expect(state.encounter).toMatchObject({ kind: 'Exploration', xp: 1 })
  })

  test('a first visit to a Module pays 5 Wisdom XP beside the read', () => {
    const { state, effects } = step(newGame(), read('src/a.ts'))

    expect(state.player.totalXp).toBe(6)
    expect(state.player.stats.wisdom).toBe(5)
    expect(state.player.tally.modulesDiscovered).toBe(1)
    expect(effects).toContainEqual({ type: 'XP_GAINED', amount: 5, stat: 'wisdom' })
    expect(state.encounter).toMatchObject({ isFirstVisit: true, xp: 6 })
  })

  test('outside a Quest it caps at 20 XP for the session, then pays nothing', () => {
    const { state, effects } = play(visited(), ...reads(25))

    expect(state.player.totalXp).toBe(20)
    expect(state.pools).toEqual({ ambient: 20, battle: 0, sage: 0 })
    expect(state.encounter).toMatchObject({ xp: 0 })
    expect(effects.filter(effect => effect.type === 'XP_CAPPED')).toEqual([
      { type: 'XP_CAPPED', pool: 'ambient' },
    ])
  })

  test('during a Quest it caps at 60, counted on the Quest, the XP_CAPPED told once', () => {
    const questing = step(visited(), { type: 'QUEST_START', ticket: '#4' }).state
    const { state, effects } = play(questing, ...reads(70))

    expect(state.player.totalXp).toBe(60)
    expect(state.quest?.pools).toEqual({ ambient: 60, battle: 0, sage: 0 })
    expect(state.pools).toEqual({ ambient: 0, battle: 0, sage: 0 })
    expect(effects.filter(effect => effect.type === 'XP_CAPPED')).toHaveLength(1)
  })

  test('a new Quest has its own pools, and is told again when they fill', () => {
    const first = play(step(visited(), { type: 'QUEST_START', ticket: '#4' }).state, ...reads(60)).state
    const { state, effects } = play(first, { type: 'QUEST_START', ticket: '#5' }, ...reads(60))

    expect(state.quest?.pools?.ambient).toBe(60)
    expect(state.player.totalXp).toBe(120)
    expect(effects.filter(effect => effect.type === 'XP_CAPPED')).toHaveLength(1)
  })

  test('a payment that would overflow the pool pays what is left', () => {
    const nearlyFull = { ...visited(), pools: { ambient: 18, battle: 0, sage: 0 } }
    const { state, effects } = step(nearlyFull, read('src/new/a.ts', 'src/new'))

    expect(state.player.totalXp).toBe(2)
    expect(state.player.stats.wisdom).toBe(1)
    expect(effects).toContainEqual({ type: 'XP_CAPPED', pool: 'ambient' })
  })

  test('a discovery in a full pool pays nothing but still counts toward the Cartographer', () => {
    const full = { ...visited(), pools: { ambient: 20, battle: 0, sage: 0 } }
    const { state } = step(full, read('lib/a.ts', 'lib'))

    expect(state.player.totalXp).toBe(0)
    expect(state.player.tally.modulesDiscovered).toBe(1)
    expect(state.visitedModules).toContain('lib')
  })

  test('a Crafting pays 5 XP into the ambient pool', () => {
    const { state, effects } = step(newGame(), {
      type: 'FILE_EDIT',
      path: 'src/order-ledger.ts',
      module: 'src',
      isNewFile: true,
      linesBefore: null,
      linesAdded: 12,
      linesRemoved: 0,
      diff: '@@ -0,0 +1,12 @@\n+export {}',
    })

    expect(state.player.totalXp).toBe(5)
    expect(state.pools?.ambient).toBe(5)
    expect(state.encounter).toMatchObject({ kind: 'Crafting', xp: 5 })
    expect(effects).toContainEqual({ type: 'XP_GAINED', amount: 5 })
  })
})

const fail = (failures: number | null, check = 'vitest run'): GameEvent => ({
  type: 'TEST_FAIL',
  check,
  kind: 'test',
  failures,
})
const pass = (check = 'vitest run'): GameEvent => ({ type: 'TEST_PASS', check, kind: 'test' })
const fix = (path = 'src/a.ts'): GameEvent => ({
  type: 'FILE_EDIT',
  path,
  module: 'src',
  isNewFile: false,
  linesBefore: 40,
  linesAdded: 1,
  linesRemoved: 1,
  diff: '@@ -1 +1 @@\n-a\n+b',
})

describe('Economy: Battles', () => {
  test('a Battle won with a fix pays 10 Strength XP per HP at its first counted run', () => {
    const { state, effects } = play(newGame(), fail(2), fix(), fail(1), pass())

    expect(state.player.totalXp).toBe(20)
    expect(state.player.stats.strength).toBe(20)
    expect(state.encounter).toMatchObject({ outcome: 'won', xp: 20 })
    expect(effects).toContainEqual({ type: 'XP_GAINED', amount: 20, stat: 'strength' })
  })

  test('it pays for 3 HP at most, however many failed', () => {
    const { state } = play(newGame(), fail(40), fix(), pass())

    expect(state.player.totalXp).toBe(30)
  })

  test('a monster that grew pays by its first counted HP, not its largest', () => {
    const { state } = play(newGame(), fail(1), fix(), fail(5), pass())

    expect(state.player.totalXp).toBe(10)
  })

  test('an uncounted monster pays as one HP', () => {
    const { state } = play(newGame(), fail(null), fix(), pass())

    expect(state.player.totalXp).toBe(10)
  })

  test('a Battle won with no edit made while it stood (a flaky check) pays nothing', () => {
    const { state, effects } = play(newGame(), fail(3), pass())

    expect(state.player.totalXp).toBe(0)
    expect(state.encounter).toMatchObject({ outcome: 'won', xp: 0 })
    expect(effects.some(effect => effect.type === 'XP_GAINED' || effect.type === 'BADGE_EARNED')).toBe(false)
  })

  test('outside a Quest Battles cap at 30 XP for the session', () => {
    const { state, effects } = play(newGame(), fail(3), fix(), pass(), fail(3), fix(), pass())

    expect(state.player.totalXp).toBe(30)
    expect(effects).toContainEqual({ type: 'XP_CAPPED', pool: 'battle' })
  })

  test('during a Quest Battles cap at 60', () => {
    const won = [fail(3), fix(), pass()]
    const { state } = play(newGame(), { type: 'QUEST_START', ticket: '#4' }, ...won, ...won, ...won)

    expect(state.player.totalXp).toBe(60)
    expect(state.quest?.pools?.battle).toBe(60)
  })
})

const question = (overrides: Partial<QuestionContent> = {}): QuestionContent => ({
  prompt: 'What does deposit do with a locked vault?',
  options: ['It throws', 'It adds the gold', 'It returns', 'It unlocks'],
  answer: 0,
  explanation: 'It throws before adding any gold.',
  stat: 'intelligence',
  source: { path: 'src/vault.ts', lines: ['if (vault.locked) {'] },
  ...overrides,
})
const T = Date.UTC(2026, 9, 23, 21, 0)
const ready = (key?: string, content: QuestionContent = question()): GameEvent =>
  key === undefined
    ? { type: 'QUESTION_READY', question: content, at: T }
    : { type: 'QUESTION_READY', question: content, at: T, key }
/** Answers the first Question waiting with `choice`, a minute after it was queued. */
const answerFirst = (state: GameState, choice = 0) =>
  step(state, { type: 'QUESTION_ANSWERED', id: state.questions[0]?.id ?? 'none', choice, at: T + 60_000 })

describe('Economy: Questions', () => {
  test('a right answer pays 20 XP to its Stat tag: Wisdom for wisdom', () => {
    const { state, effects } = answerFirst(play(newGame(), ready(undefined, question({ stat: 'wisdom' }))).state)

    expect(state.player.stats).toMatchObject({ wisdom: 20, intelligence: 0 })
    expect(effects).toContainEqual({ type: 'XP_GAINED', amount: 20, stat: 'wisdom' })
    expect(state.lastAnswer?.xp).toBe(20)
  })

  test('any other tag pays Intelligence', () => {
    const { state } = answerFirst(play(newGame(), ready(undefined, question({ stat: 'charisma' }))).state)

    expect(state.player.stats).toMatchObject({ intelligence: 20, charisma: 0 })
  })

  test('a right answer that is not hasty counts toward the Sage\'s Apprentice', () => {
    const { state } = answerFirst(play(newGame(), ready()).state)

    expect(state.player.tally.sageRight).toBe(1)
  })

  test('outside a Quest the Sage pays 100 XP for the session, then 0, told once', () => {
    let state: GameState = newGame()
    const effects: ReturnType<typeof step>['effects'] = []
    for (let n = 0; n < 6; n += 1) {
      state = step(state, ready(undefined, question({ prompt: `Question ${n}?` }))).state
      const answered = answerFirst(state)
      state = answered.state
      effects.push(...answered.effects)
    }

    expect(state.player.totalXp).toBe(100)
    expect(state.lastAnswer?.xp).toBe(0)
    expect(effects.filter(effect => effect.type === 'XP_CAPPED')).toEqual([{ type: 'XP_CAPPED', pool: 'sage' }])
  })

  test('a Question for a change answered this session is not queued again', () => {
    const answered = answerFirst(play(newGame(), ready('change-1')).state).state
    const { state, effects } = step(answered, ready('change-1'))

    expect(state.questions).toEqual([])
    expect(effects).toEqual([])
    expect(step(answered, ready('change-2')).state.questions).toHaveLength(1)
  })

  test('a Question for a change whose Question is already waiting is not queued twice', () => {
    const waiting = play(newGame(), ready('change-1')).state
    const { state, effects } = step(waiting, ready('change-1', question({ prompt: 'Another wording?' })))

    expect(state.questions).toHaveLength(1)
    expect(effects).toEqual([])
  })

  test('a wrong Sage answer during a Quest is counted on it', () => {
    const questing = play(newGame(), { type: 'QUEST_START', ticket: '#4' }, ready()).state

    expect(answerFirst(questing, 1).state.quest?.sageWrong).toBe(1)
  })
})

describe('Economy: HP and Exhaustion', () => {
  const exhausted = (state: GameState = newGame()): GameState => ({ ...state, player: { ...state.player, hp: 0 } })

  test('a new Quest heals 25 HP, up to the most', () => {
    const hurt = { ...newGame(), player: { ...newPlayer(), hp: 50 } }
    const { state, effects } = step(hurt, { type: 'QUEST_START', ticket: '#4' })

    expect(state.player.hp).toBe(75)
    expect(effects).toContainEqual({ type: 'HP_HEALED', amount: 25 })
    expect(step({ ...hurt, player: { ...newPlayer(), hp: 90 } }, { type: 'QUEST_START', ticket: '#4' }).state.player.hp).toBe(100)
  })

  test('the Quest already running, started again, does not heal', () => {
    const questing = step(newGame(), { type: 'QUEST_START', ticket: '#4' }).state
    const hurt = { ...questing, player: { ...questing.player, hp: 50 } }

    expect(step(hurt, { type: 'QUEST_START', ticket: '#4' }).state.player.hp).toBe(50)
  })

  test('Exhausted, a wrong answer costs nothing more', () => {
    const { state, effects } = answerFirst(step(exhausted(), ready()).state, 1)

    expect(state.player.hp).toBe(0)
    expect(state.lastAnswer?.hpLost).toBe(0)
    expect(effects.some(effect => effect.type === 'HP_LOST')).toBe(false)
  })

  test('Exhausted, a right answer pays half', () => {
    const { state } = answerFirst(step(exhausted(), ready()).state)

    expect(state.lastAnswer?.xp).toBe(10)
    expect(state.player.totalXp).toBe(10)
  })
})

describe('Economy: the Boss Fight and the Quest reward', () => {
  const review = (n: number): QuestionContent => question({ prompt: `Review question ${n}?` })
  const bossReady = (count = 3, ticket = '#12'): GameEvent => ({
    type: 'BOSS_FIGHT_READY',
    ticket,
    questions: Array.from({ length: count }, (_, at) => review(at + 1)),
    at: T,
  })
  const bossAnswer = (n: number, choice = 0): GameEvent => ({ type: 'BOSS_ANSWERED', id: `boss-${n}`, choice, at: T + n })
  const summon = (difficulty: 'Medium' | 'Unrated' | 'Epic' = 'Medium', state: GameState = { ...newGame(), region: 'vault' }) =>
    play(
      state,
      { type: 'QUEST_START', ticket: '#12', difficulty },
      { type: 'COMMIT', sha: '7ab19e4', cwd: null },
    ).state
  const win = (state: GameState, count = 3) =>
    play(state, bossReady(count), ...Array.from({ length: count }, (_, at) => bossAnswer(at + 1)))

  test('a right Boss answer pays 30 Intelligence XP, uncapped', () => {
    const { state } = play(summon(), bossReady(), bossAnswer(1))

    expect(state.player.totalXp).toBe(30)
    expect(state.bossFight?.lastAnswer?.xp).toBe(30)
  })

  test('a Boss Fight won pays the Quest reward by difficulty, Flawless half again, its trophy, and heals', () => {
    const hurt = summon()
    const { state, effects } = win({ ...hurt, player: { ...hurt.player, hp: 40 } })

    // 3 × 30 for the answers, 100 for a Medium Quest, 50 for Flawless.
    expect(state.player.totalXp).toBe(240)
    expect(state.player.hp).toBe(100)
    expect(state.bossFight).toMatchObject({ status: 'won', reward: 150, flawless: true, trophy: 'Bane of vault#12' })
    expect(state.player.trophies).toEqual([{ name: 'Bane of vault#12', region: 'vault', ticket: '#12', earnedAt: T + 3 }])
    expect(effects).toContainEqual({ type: 'XP_GAINED', amount: 100, stat: 'intelligence' })
    expect(effects).toContainEqual({ type: 'XP_GAINED', amount: 50, stat: 'intelligence' })
    expect(effects.map(effect => effect.type)).toContain('TROPHY_EARNED')
  })

  test('a Boss Fight won with a wrong Boss answer pays the Quest reward but is not Flawless', () => {
    const { state } = play(summon(), bossReady(), bossAnswer(1, 1), bossAnswer(2), bossAnswer(3))

    // 2 × 30 for the answers and 100 for a Medium Quest.
    expect(state.bossFight).toMatchObject({ status: 'won', reward: 100, flawless: false })
    expect(state.player.totalXp).toBe(160)
  })

  test('a wrong Sage answer in the Quest spoils Flawless', () => {
    const spoiled = answerFirst(step(summon(), ready()).state, 1).state
    const { state } = win(spoiled)

    expect(state.bossFight).toMatchObject({ reward: 100, flawless: false })
  })

  test('an Unrated Quest rewards 80; fewer than 3 Questions scale it down', () => {
    expect(win(summon('Unrated')).state.bossFight?.reward).toBe(120)
    expect(win(summon('Epic'), 2).state.bossFight?.reward).toBe(180)
  })

  test('the Quest reward and trophy are paid once per Region and ticket', () => {
    const once = win(summon()).state
    const { state, effects } = win(summon('Medium', once))

    expect(state.bossFight?.reward).toBe(0)
    expect(state.player.trophies).toHaveLength(1)
    expect(effects.map(effect => effect.type)).not.toContain('TROPHY_EARNED')
    expect(win(summon('Medium', { ...once, region: 'other' })).state.bossFight?.reward).toBe(150)
  })

  test('a ticket its Quest Source has not found pays no Quest reward and no trophy; its answers still pay', () => {
    const unverified = step(summon(), { type: 'QUEST_DETAILS', ticket: '#12', verified: 'not-found' }).state
    const { state, effects } = win(unverified)

    expect(state.bossFight).toMatchObject({ status: 'won', reward: 0 })
    expect(state.bossFight?.trophy).toBeUndefined()
    expect(state.player.totalXp).toBe(90)
    expect(state.player.trophies ?? []).toEqual([])
    expect(effects.map(effect => effect.type)).not.toContain('TROPHY_EARNED')
    const unfought = step(unverified, { type: 'BOSS_FIGHT_UNAVAILABLE', ticket: '#12', reason: 'no Haiku' }).state
    expect(unfought.bossFight?.reward).toBe(0)
  })

  test('a ticket its Quest Source has not found earns no Badges and leaves the tally and Boss streak as they were', () => {
    const streak = { ...newGame(), region: 'vault' }
    const before = { ...streak, player: { ...streak.player, tally: { ...streak.player.tally, bossStreak: 2 } } }
    const unverified = step(summon('Medium', before), { type: 'QUEST_DETAILS', ticket: '#12', verified: 'not-found' }).state
    const { state, effects } = win(unverified)

    expect(state.bossFight?.status).toBe('won')
    expect(state.player.badges ?? []).toEqual([])
    expect(effects.map(effect => effect.type)).not.toContain('BADGE_EARNED')
    expect(state.player.tally).toEqual(before.player.tally)
    const lost = play(unverified, bossReady(), bossAnswer(1, 1), bossAnswer(2, 1), bossAnswer(3)).state
    expect(lost.bossFight?.status).toBe('lost')
    expect(lost.player.tally.bossStreak).toBe(2)
  })

  test('a ticket its Quest Source could not be asked about (unknown) is rewarded as usual', () => {
    const unknown = step(summon(), { type: 'QUEST_DETAILS', ticket: '#12', verified: 'unknown' }).state

    expect(win(unknown).state.bossFight?.reward).toBe(150)
  })

  test('a Boss Fight lost, then won in a rematch, still pays the Quest reward once', () => {
    const lost = play(summon(), bossReady(), bossAnswer(1, 1), bossAnswer(2, 1), bossAnswer(3)).state
    expect(lost.bossFight?.status).toBe('lost')
    const { state } = win(summon('Medium', lost))

    // The rematch is its own Quest: no wrong answer in it, so Flawless too.
    expect(state.bossFight).toMatchObject({ status: 'won', reward: 150 })
    expect(state.player.trophies).toHaveLength(1)
  })

  test('with no Region known, a Quest won is still rewarded once', () => {
    const unknown = { ...newGame(), region: null }
    const once = win(summon('Medium', unknown)).state

    expect(win(summon('Medium', once)).state.bossFight?.reward).toBe(0)
  })

  test('the Quest just closed, started again, does not heal', () => {
    const closed = win(summon()).state
    const hurt = { ...closed, player: { ...closed.player, hp: 50 } }

    expect(step(hurt, { type: 'QUEST_START', ticket: '#12' }).state.player.hp).toBe(50)
    expect(step(hurt, { type: 'QUEST_START', ticket: '#13' }).state.player.hp).toBe(75)
  })

  test('an unfought Quest\'s share is paid once per Region and ticket', () => {
    const unfought: GameEvent = { type: 'BOSS_FIGHT_UNAVAILABLE', ticket: '#12', reason: 'no Haiku' }
    const once = step(summon(), unfought).state
    const { state } = step(summon('Medium', once), unfought)

    expect(state.player.totalXp).toBe(25)
    expect(state.bossFight?.reward).toBe(0)
  })

  test('a Boss Fight lost pays its right answers, no reward, and resets the streak', () => {
    const streaking = { ...newGame(), region: 'vault', player: { ...newPlayer(), tally: { ...newPlayer().tally, bossStreak: 2 } } }
    const { state } = play(summon('Medium', streaking), bossReady(), bossAnswer(1), bossAnswer(2, 1), bossAnswer(3, 1))

    expect(state.player.totalXp).toBe(30)
    expect(state.bossFight).toMatchObject({ status: 'lost', reward: 0 })
    expect(state.player.tally).toMatchObject({ bossStreak: 0, questsClosed: 1, regions: ['vault'] })
  })

  test('an unfought Quest pays a quarter of its reward', () => {
    const { state } = step(summon(), { type: 'BOSS_FIGHT_UNAVAILABLE', ticket: '#12', reason: 'no Haiku' })

    expect(state.player.totalXp).toBe(25)
    expect(state.bossFight).toMatchObject({ status: 'unfought', reward: 25 })
  })

  test('a skipped Boss Fight pays nothing and closes no Quest in the tally', () => {
    const { state } = play(summon(), bossReady(), { type: 'BOSS_FIGHT_SKIPPED' })

    expect(state.player.totalXp).toBe(0)
    expect(state.player.tally.questsClosed).toBe(0)
  })

  test('won while Exhausted earns the Second Wind', () => {
    const summoned = summon()
    const { state } = win({ ...summoned, player: { ...summoned.player, hp: 0 } })

    // Exhausted answers pay half: 3 × 15; the Quest reward is still full.
    expect(state.player.totalXp).toBe(45 + 150)
    expect(state.player.badges?.map(badge => badge.id)).toContain('second-wind')
  })

  test('the first Boss Fight won earns Questbound, Boss Slayer and Flawless', () => {
    const { state, effects } = win(summon())

    expect(state.player.badges?.map(badge => badge.id)).toEqual(['first-quest', 'boss-slayer', 'flawless'])
    expect(effects.filter(effect => effect.type === 'BADGE_EARNED')).toHaveLength(3)
  })
})

describe('Economy: Badges', () => {
  const withTally = (tally: Partial<Player['tally']>, badges: Player['badges'] = []): Player => ({
    ...newPlayer(),
    tally: { ...newPlayer().tally, ...tally },
    badges,
  })

  test('lifetime counts earn their Badges', () => {
    expect(earnedBadges(withTally({ modulesDiscovered: 25, sageRight: 25, bossStreak: 5, regions: ['a', 'b', 'c'] }))).toEqual([
      'cartographer',
      'apprentice',
      'unbroken',
      'wayfarer',
    ])
    expect(earnedBadges(withTally({ modulesDiscovered: 24, sageRight: 24, bossStreak: 4, regions: ['a', 'b'] }))).toEqual([])
  })

  test('a Battle won earns First Blood, and the Dragon Slayer against 20 HP or more', () => {
    expect(earnedBadges(newPlayer(), { battleWon: { maxHp: 19 } })).toEqual(['first-blood'])
    expect(earnedBadges(newPlayer(), { battleWon: { maxHp: 20 } })).toEqual(['first-blood', 'dragon-slayer'])
  })

  test('a Badge is earned once', () => {
    expect(earnedBadges(withTally({ modulesDiscovered: 30 }, [{ id: 'cartographer', name: 'Cartographer' }]))).toEqual([])
  })

  test('the first Battle won with a fix earns First Blood in play', () => {
    const { effects } = play(newGame(), fail(2), fix(), pass())

    expect(effects).toContainEqual({ type: 'BADGE_EARNED', badge: { id: 'first-blood', name: 'First Blood' } })
  })
})

describe('Economy: titles', () => {
  const at = (level: number, stats: Partial<Player['stats']>): Player => ({
    ...newPlayer(),
    level,
    stats: { ...newPlayer().stats, ...stats },
  })

  test('from level 3 the highest MVP Stat names the Player', () => {
    expect(titleOf(at(2, { intelligence: 50 }))).toBeNull()
    expect(titleOf(at(3, { intelligence: 50, wisdom: 10 }))).toBe('Scholar')
    expect(titleOf(at(3, { wisdom: 60, strength: 10 }))).toBe('Pathfinder')
    expect(titleOf(at(5, { strength: 70, intelligence: 60 }))).toBe('Warrior')
  })

  test('a tie goes to Intelligence, then Wisdom; from level 10 a Veteran', () => {
    expect(titleOf(at(4, { intelligence: 30, wisdom: 30 }))).toBe('Scholar')
    expect(titleOf(at(10, { wisdom: 30, strength: 30 }))).toBe('Veteran Pathfinder')
  })
})

describe('Economy: migrating an older Player', () => {
  const old = {
    level: 5,
    xp: 40,
    hp: 30,
    maxHp: 100,
    stats: { intelligence: 300, wisdom: 0, dexterity: 0, strength: 120, charisma: 0, constitution: 0 },
    badges: [{ name: "Bane of #12's Boss", ticket: '#12', earnedAt: 7 }],
  } as unknown as Player

  test('lifetime XP is the old curve\'s sum plus the XP, its level derived again', () => {
    // 100 + 200 + 300 + 400 + 40 = 1,040: level 4 on the new curve (550 to reach it), 490 into it.
    const { player, levelChange } = migratePlayer(old)

    expect(player).toMatchObject({ totalXp: 1040, level: 4, xp: 490, hp: 30, maxHp: 100 })
    expect(levelChange).toEqual({ from: 5, to: 4 })
  })

  test('old per-ticket badges become trophies; the tally is filled in', () => {
    const { player } = migratePlayer(old)

    expect(player.badges).toEqual([])
    expect(player.trophies).toEqual([{ name: 'Bane of #12', region: null, ticket: '#12', earnedAt: 7 }])
    expect(player.tally).toEqual(newPlayer().tally)
  })

  test('a Player already migrated is kept as it is', () => {
    const { player } = migratePlayer(old)

    expect(migratePlayer(player)).toEqual({ player, levelChange: null })
  })
})

describe('Economy: wait-time engagement adds no XP source (#22)', () => {
  /** A file a Bash heredoc made, as the diff path plays it. */
  const forgedByBash = (at: number): GameEvent => ({
    type: 'FILE_EDIT',
    path: `/work/forge/src/gen-${at}.ts`,
    module: 'src',
    isNewFile: true,
    linesBefore: null,
    linesAdded: 5,
    linesRemoved: 0,
    diff: '@@ -0,0 +1,5 @@\n+a\n+b\n+c\n+d\n+e',
    source: 'diff',
  })

  test('Crafting seen in the diff pays from the ambient pool, as an Edit\'s does, and stops when it is full', () => {
    const quest = play(newGame(), { type: 'QUEST_START', ticket: '#22' }).state
    const { state, effects } = play(quest, ...Array.from({ length: 20 }, (_, at) => forgedByBash(at)))

    expect(state.quest?.pools).toEqual({ ambient: POOL_CAPS.ambient, battle: 0, sage: 0 })
    expect(state.player.totalXp).toBe(POOL_CAPS.ambient)
    expect(effects.filter(effect => effect.type === 'XP_CAPPED')).toEqual([{ type: 'XP_CAPPED', pool: 'ambient' }])
  })

  test('Bash reads pay from the ambient pool as Read does: the pool is shared, not added to', () => {
    const quest = play(visited(newGame()), { type: 'QUEST_START', ticket: '#22' }).state
    const { state } = play(quest, ...reads(40), ...Array.from({ length: 20 }, (_, at) => forgedByBash(at)), ...reads(40))

    expect(state.quest?.pools?.ambient).toBe(POOL_CAPS.ambient)
    expect(state.player.totalXp).toBe(POOL_CAPS.ambient)
  })

  test('companions pay nothing: setting out, counting their loop and coming back never touch the Player', () => {
    let party = setOut(emptyParty(), 'agent-7', 'Implement issue #22')
    const forged = step(play(newGame(), { type: 'QUEST_START', ticket: '#22' }).state, forgedByBash(0))
    party = tally(party, 'agent-7', forged.effects)
    const back = comeBack(party, 'agent-7')

    expect(back.companion).toMatchObject({ forged: 1 })
    // The party is no part of the game: the only XP was the Crafting's own.
    expect(forged.state.player.totalXp).toBe(CRAFTING_XP)
  })
})
