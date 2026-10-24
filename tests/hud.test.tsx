import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, SessionMeasureInput } from 'claude-code'

import { read, readMissing } from './fixtures/tool-calls'

const HUD = {
  plugin: 'quest-mod',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const SURFACES = ['terminal', 'desktop'] as const

/** The text band on every surface: the desktop's pixel strip has its own tests (hud-strip.test.tsx). */
const TEXT_HUD = { options: { hudStyle: 'text' } }

const START = { cwd: '/work', surface: 'desktop', isInteractive: true } as const

/** Answers the mod's `$.store` from a Map the test can read afterwards. */
const keptStore = (on: On, entries: Record<string, unknown> = {}) => {
  const kept = new Map(Object.entries(entries))
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_, e) => {
    kept.set(e.key, e.value)

    return { value: undefined }
  })

  return kept
}

const LEVEL_3 = {
  level: 3,
  xp: 42,
  hp: 90,
  maxHp: 100,
  stats: {
    intelligence: 2,
    wisdom: 0,
    dexterity: 0,
    strength: 1,
    charisma: 0,
    constitution: 0,
  },
}

describe('HUD', () => {
  test('a new Player is kept on first load and shows level 1 and no XP', TEXT_HUD, async ($, on) => {
    const kept = keptStore(on)
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    await $.session.start(START)

    expect(kept.get('player')).toMatchObject({ level: 1, xp: 0, hp: 100 })

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...HUD, surface })

      expect((await ui.find({ type: 'Text', text: /^Lv / }))?.text).toBe('Lv 1')
      expect((await ui.find({ type: 'Text', text: /^XP / }))?.text).toBe('XP 0/100')
      await ui.unmount()
    }
  })

  test('a Read fires, and the HUD shows the XP gain and the Exploration', TEXT_HUD, async ($, on) => {
    const kept = keptStore(on)
    on('tool.call', () => read.result)
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    await $.session.start(START)

    await $.tool.call(read.input)

    // A read pays 1 XP.
    expect(kept.get('player')).toMatchObject({ level: 1, xp: 1 })

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...HUD, surface })

      expect((await ui.find({ type: 'Text', text: /^XP / }))?.text).toBe('XP 1/100')
      expect((await ui.find({ type: 'Text', text: /Exploring/ }))?.text).toBe(
        'Exploring GLOSSARY.md',
      )
      await ui.unmount()
    }
  })

  test('a Read that failed earns nothing', async ($, on) => {
    const kept = keptStore(on)
    on('tool.call', () => readMissing.result)
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    await $.session.start(START)

    await $.tool.call(readMissing.input)

    const ui = await $.ui.mount({ ...HUD, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /^XP / }))?.text).toBe('XP 0/100')
    await ui.unmount()
  })

  test('a Player kept from an earlier session comes back', async ($, on) => {
    keptStore(on, { player: LEVEL_3 })
    on('tool.call', () => read.result)
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    await $.session.start(START)

    await $.tool.call(read.input)

    // Kept by an older mod: 100 + 200 + 42 = 342 XP lifetime, still level 3
    // on the new curve (250 to reach it), 92 into it; the read adds 1.
    const ui = await $.ui.mount({ ...HUD, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /^Lv / }))?.text).toBe('Lv 3 Scholar')
    expect((await ui.find({ type: 'Text', text: /^XP / }))?.text).toBe('XP 93/300')
    await ui.unmount()
  })

  test('a Read before the session has started keeps building on the kept Player', async ($, on) => {
    const kept = keptStore(on, { player: LEVEL_3 })
    on('tool.call', () => read.result)

    await $.tool.call(read.input)

    expect(kept.get('player')).toMatchObject({ level: 3, xp: 93, totalXp: 343 })
  })
})

/** Answers the session's model and usage, as Claude Code would. */
const measuring = (on: On, context: { window: number; percent?: number } = { window: 200_000 }) => {
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({
    value: { startedAt: 0, context, rateLimits: [], cost: { usd: 0.5 } },
  }))
}

const measurement = (percent: number, usd: number): SessionMeasureInput => ({
  context: { tokens: percent * 2_000, window: 200_000, percent },
  rateLimits: [],
  cost: { usd },
  changed: ['context', 'cost'],
})

describe('HUD: session vitals', () => {
  test('before any measurement, a fresh session shows Mana with no reading', TEXT_HUD, async ($, on) => {
    keptStore(on)
    measuring(on)
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    await $.session.start(START)

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...HUD, surface })
      expect((await ui.find({ type: 'Text', text: /^Mana / }))?.text).toBe('Mana --')
      expect((await ui.find({ type: 'Text', text: /^\$/ }))?.text).toBe('$0.50')
      await ui.unmount()
    }
  })

  test('a resumed session shows its Mana from the start', TEXT_HUD, async ($, on) => {
    keptStore(on)
    measuring(on, { window: 200_000, percent: 63 })
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    await $.session.start(START)

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...HUD, surface })
      expect((await ui.find({ type: 'Text', text: /^Mana / }))?.text).toBe('Mana 63%')
      await ui.unmount()
    }
  })

  test('a measurement shows Mana, the model and the spend', TEXT_HUD, async ($, on) => {
    keptStore(on)
    measuring(on)
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('session.measure', (_, e) => ({ changed: e.changed }))
    await $.session.start(START)

    await $.session.measure(measurement(42, 1.25))

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...HUD, surface })

      const mana = await ui.find({ type: 'Text', text: /^Mana / })
      expect(mana?.text).toBe('Mana 42%')
      expect(mana?.props.color).toBe('blue')
      expect((await ui.find({ type: 'Text', text: /opus/ }))?.text).toBe(
        'claude-opus-5-5',
      )
      expect((await ui.find({ type: 'Text', text: /^\$/ }))?.text).toBe('$1.25')
      expect(await ui.find({ type: 'Text', text: /compaction/i })).toBeUndefined()
      await ui.unmount()
    }
  })

  test('Mana turns yellow as it fills', TEXT_HUD, async ($, on) => {
    keptStore(on)
    measuring(on)
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('session.measure', (_, e) => ({ changed: e.changed }))
    await $.session.start(START)

    await $.session.measure(measurement(65, 2))

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...HUD, surface })
      expect((await ui.find({ type: 'Text', text: /^Mana / }))?.props.color).toBe(
        'yellow',
      )
      await ui.unmount()
    }
  })

  test('Mana past 80% turns red and warns before compaction, once', TEXT_HUD, async ($, on) => {
    const toasts: string[] = []
    keptStore(on)
    measuring(on)
    on('ui.toast', (_, e) => {
      toasts.push(e.text)

      return { value: undefined }
    })
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    on('session.measure', (_, e) => ({ changed: e.changed }))
    await $.session.start(START)

    await $.session.measure(measurement(85, 4))
    await $.session.measure(measurement(88, 4.5))

    expect(toasts).toEqual([
      'Mana at 85%: the context will compact soon. Wrap up or start a fresh session.',
    ])

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...HUD, surface })

      expect((await ui.find({ type: 'Text', text: /^Mana / }))?.props.color).toBe(
        'red',
      )
      expect((await ui.find({ type: 'Text', text: /compaction/i }))?.text).toBe(
        'Compaction near',
      )
      await ui.unmount()
    }
  })
})

const REGION = '/work/.claude/claude-quest.json'

/** Answers the mod's `$.fs` from a Map of files the test can read afterwards. */
const projectFiles = (on: On, files: Record<string, string> = {}) => {
  const kept = new Map(Object.entries(files))
  on('session.root', () => ({ value: '/work' }))
  on('clock.now', () => ({ value: Date.UTC(2026, 9, 23, 20, 0) }))
  on('fs.exists', (_, e) => ({ value: kept.has(e.path) }))
  on('fs.read', (_, e) => ({ value: kept.get(e.path) ?? '' }))
  on('fs.write', (_, e) => {
    kept.set(e.path, e.text)

    return { value: undefined }
  })

  return kept
}

/** Runs `/<command> <args>` as the person types it at the terminal. */
const implement = (
  $: Engine,
  args: string,
  command = 'mattpocock-skills:implement',
) =>
  $.command.run({
    command,
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })

describe('Quests', () => {
  test('/implement #4 starts a Quest the HUD shows', TEXT_HUD, async ($, on) => {
    keptStore(on)
    projectFiles(on)
    on('command.run', () => ({}))
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    await $.session.start(START)

    await implement($, '#4')

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...HUD, surface })
      expect((await ui.find({ type: 'Text', text: /^Quest / }))?.text).toBe('Quest #4')
      await ui.unmount()
    }
  })

  test('with no Quest started, the HUD shows none', async ($, on) => {
    keptStore(on)
    projectFiles(on)
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    await $.session.start(START)

    const ui = await $.ui.mount({ ...HUD, surface: 'terminal' })
    expect(await ui.find({ type: 'Text', text: /^Quest / })).toBeUndefined()
    await ui.unmount()
  })

  test('the first Quest creates the Region file and records the Quest in its history', async ($, on) => {
    keptStore(on)
    const files = projectFiles(on)
    on('command.run', () => ({}))
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    await $.session.start(START)

    await implement($, '#4', 'implement')

    expect(JSON.parse(files.get(REGION) ?? 'null')).toEqual({
      quests: [{ ticket: '#4', startedAt: '2026-10-23T20:00:00.000Z', status: 'active' }],
    })
  })

  test('a Quest is added to the history the Region file already holds', async ($, on) => {
    keptStore(on)
    const earlier = { ticket: '#2', startedAt: '2026-10-22T09:00:00.000Z', status: 'active' }
    const files = projectFiles(on, { [REGION]: JSON.stringify({ quests: [earlier] }) })
    on('command.run', () => ({}))
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    await $.session.start(START)

    await implement($, 'ABC-123')

    expect(JSON.parse(files.get(REGION) ?? 'null')).toEqual({
      quests: [
        earlier,
        { ticket: 'ABC-123', startedAt: '2026-10-23T20:00:00.000Z', status: 'active' },
      ],
    })
  })

  test('a Quest record names the session that started it', async ($, on) => {
    keptStore(on)
    const files = projectFiles(on)
    on('session.id', () => ({ value: 'session-b' }))
    on('command.run', () => ({}))
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    await $.session.start(START)

    await implement($, '#4')

    expect(JSON.parse(files.get(REGION) ?? 'null').quests).toEqual([
      { ticket: '#4', startedAt: '2026-10-23T20:00:00.000Z', status: 'active', sessionId: 'session-b' },
    ])
  })

  test('starting a ticket whose Quest is still active in the history takes that run up again', async ($, on) => {
    keptStore(on)
    const yesterday = { ticket: '#4', startedAt: '2026-10-22T09:00:00.000Z', status: 'active', sessionId: 'session-a' }
    const other = { ticket: '#7', startedAt: '2026-10-22T10:00:00.000Z', status: 'active', sessionId: 'session-c' }
    const files = projectFiles(on, { [REGION]: JSON.stringify({ quests: [yesterday, other] }) })
    on('session.id', () => ({ value: 'session-b' }))
    on('command.run', () => ({}))
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    await $.session.start(START)

    await implement($, '#4')

    expect(JSON.parse(files.get(REGION) ?? 'null').quests).toEqual([
      { ...yesterday, sessionId: 'session-b', resumedAt: '2026-10-23T20:00:00.000Z' },
      other,
    ])
  })

  test('a session starting marks Quests left active for over 7 days abandoned', async ($, on) => {
    keptStore(on)
    const stale = { ticket: '#2', startedAt: '2026-10-15T19:00:00.000Z', status: 'active' }
    const recent = { ticket: '#3', startedAt: '2026-10-17T09:00:00.000Z', status: 'active' }
    const closed = { ticket: '#1', startedAt: '2026-09-01T09:00:00.000Z', status: 'won', endedAt: '2026-09-02T09:00:00.000Z' }
    const files = projectFiles(on, { [REGION]: JSON.stringify({ quests: [closed, stale, recent], questSource: { kind: 'github' } }) })
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    await $.session.start(START)

    expect(JSON.parse(files.get(REGION) ?? 'null')).toEqual({
      quests: [closed, { ...stale, status: 'abandoned', endedAt: '2026-10-23T20:00:00.000Z' }, recent],
      questSource: { kind: 'github' },
    })
  })

  test('a session starting with no stale Quest leaves the Region file as it is', async ($, on) => {
    keptStore(on)
    const files = projectFiles(on)
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    await $.session.start(START)

    expect(files.has(REGION)).toBe(false)
  })

  test('a second Quest replaces the first, which the history records as abandoned', async ($, on) => {
    const toasts: string[] = []
    keptStore(on)
    const files = projectFiles(on)
    on('ui.toast', (_, e) => {
      toasts.push(e.text)

      return { value: undefined }
    })
    on('command.run', () => ({}))
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    await $.session.start(START)

    await implement($, '#4')
    await implement($, '#5')

    expect(toasts).toEqual([
      'Quest started: #4 · /quest for the brief',
      'Quest abandoned: #4',
      'Quest started: #5 · /quest for the brief',
    ])
    expect(JSON.parse(files.get(REGION) ?? 'null')).toEqual({
      quests: [
        { ticket: '#4', startedAt: '2026-10-23T20:00:00.000Z', status: 'abandoned' },
        { ticket: '#5', startedAt: '2026-10-23T20:00:00.000Z', status: 'active' },
      ],
    })

    const ui = await $.ui.mount({ ...HUD, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /^Quest / }))?.text).toBe('Quest #5')
    await ui.unmount()
  })

  test('/implement with no ticket starts no Quest and writes no Region file', async ($, on) => {
    keptStore(on)
    const files = projectFiles(on)
    on('command.run', () => ({}))
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    await $.session.start(START)

    await implement($, 'the spec in docs/spec.md')

    expect(files.has(REGION)).toBe(false)
  })
})

/** Runs `/command args` as the Player would. */
const runCommand = ($: Engine, command: string, args = '') =>
  $.command.run({
    command,
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  })

/** Records the mod's toasts. */
const toastsOf = (on: On) => {
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })

  return toasts
}

/** A Player kept by this mod: level 4, a Scholar, two Badges and a trophy. */
const SCHOLAR = {
  level: 4,
  xp: 10,
  totalXp: 560,
  hp: 0,
  maxHp: 100,
  stats: { intelligence: 300, wisdom: 40, dexterity: 0, strength: 60, charisma: 0, constitution: 0 },
  tally: { questsClosed: 2, bossesWon: 1, bossStreak: 1, sageRight: 6, modulesDiscovered: 9, regions: ['vault'] },
  badges: [
    { id: 'first-quest', name: 'Questbound' },
    { id: 'boss-slayer', name: 'Boss Slayer' },
  ],
  trophies: [{ name: 'Bane of vault#12', region: 'vault', ticket: '#12', earnedAt: 1 }],
}

describe('HUD: the Player\'s progress', () => {
  test('the HUD shows the title, Exhausted at 0 HP, the Badge count and the Stats, dim', TEXT_HUD, async ($, on) => {
    keptStore(on, { player: SCHOLAR })
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    await $.session.start(START)

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...HUD, surface })

      expect((await ui.find({ type: 'Text', text: /^Lv / }))?.text).toBe('Lv 4 Scholar')
      const exhausted = await ui.find({ type: 'Text', text: 'Exhausted' })
      expect(exhausted?.props.color).toBe('red')
      expect(await ui.find({ type: 'Text', text: /^HP / })).toBeUndefined()
      expect((await ui.find({ type: 'Text', text: /^★/ }))?.text).toBe('★2')
      const stats = await ui.find({ type: 'Text', text: /^INT / })
      expect(stats?.text).toBe('INT 300 · WIS 40 · DEX 0 · STR 60')
      expect(stats?.props.dimColor).toBe(true)
      await ui.unmount()
    }
  })

  test('/badges prints the character sheet as text: XP to next, six Stats, every Badge, Trophies by Region, the tally', async ($, on) => {
    keptStore(on, { player: SCHOLAR })
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    await $.session.start(START)

    expect((await runCommand($, 'badges')).text).toBe(
      [
        'Lv 4 Scholar · 560 XP lifetime',
        'XP 10/550 to Lv 5 ▱▱▱▱▱▱▱▱▱▱',
        'Stats',
        '  INT Intelligence 300',
        '  WIS Wisdom 40',
        '  DEX Dexterity 0',
        '  STR Strength 60',
        '  CHA Charisma 0 · not yet in play',
        '  CON Constitution 0 · not yet in play',
        'Badges (2/11)',
        '  ☆ First Blood',
        '  ★ Questbound',
        '  ★ Boss Slayer',
        '  ☆ Flawless',
        '  ☆ Dragon Slayer',
        '  ☆ Cartographer',
        "  ☆ Sage's Apprentice",
        '  ☆ Unbroken',
        '  ☆ Wayfarer',
        '  ☆ Second Wind',
        '  ☆ Oracle',
        'Trophies (1)',
        '  vault: #12',
        'Quests closed 2 · Bosses won 1 · Boss streak 1 · Modules discovered 9',
        'Cartographer: 9/25 Modules discovered',
        "  Charted here: none yet. Answer the Cartographer's Scouting right to chart its Modules.",
      ].join('\n'),
    )
  })

  test('a Player kept by an older mod is migrated, kept so, and told once when the level changed', async ($, on) => {
    const kept = keptStore(on, {
      player: { level: 5, xp: 40, hp: 100, maxHp: 100, stats: LEVEL_3.stats, badges: [{ name: "Bane of #12's Boss", ticket: '#12', earnedAt: 7 }] },
    })
    const toasts = toastsOf(on)
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    await $.session.start(START)
    // A reload of the mod runs session.start again.
    await $.session.start(START)

    expect(kept.get('player')).toMatchObject({
      level: 4,
      totalXp: 1040,
      trophies: [{ name: 'Bane of #12', region: null, ticket: '#12', earnedAt: 7 }],
    })
    expect(toasts.filter(toast => toast.includes('rebalanced'))).toEqual([
      "Claude Quest's levels were rebalanced: you are level 4 (was 5), your XP kept.",
    ])
  })

  test('a full XP pool is told once, pointing to the Sage', async ($, on) => {
    keptStore(on)
    const toasts = toastsOf(on)
    on('tool.call', () => read.result)
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    await $.session.start(START)

    for (let n = 0; n < 25; n += 1) {
      await $.tool.call(read.input)
    }

    expect(toasts).toEqual([
      "Exploration and Crafting XP is full for this session, outside a Quest. The Sage's Questions still pay: /sage",
    ])
    const ui = await $.ui.mount({ ...HUD, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /^XP / }))?.text).toBe('XP 20/100')
    await ui.unmount()
  })
})

/** A Question as the HUD counts it. */
const waiting = (id: string, npc: 'Sage' | 'Boss') => ({
  id,
  npc,
  queuedAt: 0,
  shownAt: null,
  prompt: 'Q?',
  options: ['a', 'b', 'c', 'd'],
  answer: 0,
  explanation: '',
  stat: 'intelligence',
  source: { path: 'src/a.ts', lines: [] },
})

/**
 * The HUD's worst case: Exhausted, three Badges, a Quest with a long title,
 * its Boss Fight under way, two Questions waiting, a Crafting, every vital.
 */
const WORST_CASE = {
  player: {
    ...SCHOLAR,
    xp: 275,
    totalXp: 525,
    stats: { ...SCHOLAR.stats, intelligence: 120, wisdom: 45, strength: 30 },
    badges: [...SCHOLAR.badges, { id: 'sage-friend', name: 'Sage Friend' }],
  },
  encounter: { kind: 'Crafting', target: 'src/order-ledger.ts', module: 'src', item: 'Order Ledger', isNewFile: true, linesAdded: 40, linesRemoved: 0 },
  vitals: { mana: 62, model: 'claude-opus-5-5', spendUsd: 3.47 },
  quest: { ticket: '#6', encounters: [], title: 'Jira Quest Source: read the project, its statuses and story points' },
  visitedModules: [],
  battles: [],
  questions: [waiting('sage-1', 'Sage'), waiting('sage-2', 'Sage')],
  questionsAsked: 2,
  lastAnswer: null,
  sageCallsOutsideQuest: 0,
  bossFight: {
    ticket: '#6',
    sha: 'abc1234',
    cwd: null,
    status: 'fighting',
    hp: 2,
    maxHp: 2,
    questions: [waiting('boss-1', 'Boss'), waiting('boss-2', 'Boss'), waiting('boss-3', 'Boss')],
    lastAnswer: null,
    questionCount: 3,
  },
  answeredKeys: [],
  region: 'claude-quest',
}

/** The session's game, as `$.state` holds it, answered from `game`. */
const keptGame = (on: On, game: unknown) =>
  on('state.get', (_, e, next) => (e.key === 'game' ? { value: { value: game, version: 1 } } : next(e)))

type Node = { type: string; text?: string; props?: Record<string, unknown>; children?: (Node | string)[] }

/** The cells a node takes across: its text, a row's children with their gaps between. */
const cellsOf = (node: Node | string): number => {
  if (typeof node === 'string') {
    return [...node].length
  }
  const children = node.children ?? []
  if (node.type === 'Box' && node.props?.flexDirection === 'row') {
    const gap = Number(node.props.gap ?? 0)

    return children.reduce<number>((sum, child) => sum + cellsOf(child), 0) + gap * Math.max(children.length - 1, 0)
  }

  return children.reduce<number>((sum, child) => sum + cellsOf(child), 0)
}

/** The HUD's rows as drawn at `bodyColumns`: each row's texts, and its width in cells. */
const hudRows = async ($: Engine, surface: 'terminal' | 'desktop', bodyColumns: number) => {
  const ui = await $.ui.mount({ ...HUD, surface, props: { ...HUD.props, bodyColumns } })
  const [band] = (await ui.findAll({ type: 'Box' })) as unknown as Node[]
  await ui.unmount()

  return (band?.children ?? []).map(row => ({
    cells: cellsOf(row),
    texts: typeof row === 'string' ? [row] : (row.children ?? []).map(child => (typeof child === 'string' ? child : (child.children ?? []).join(''))),
  }))
}

describe('HUD: laid out by the band\'s width', () => {
  test('the worst case fits 80 columns in three rows, every part kept, the Quest\'s title shortened', TEXT_HUD, async ($, on) => {
    keptGame(on, WORST_CASE)

    for (const surface of SURFACES) {
      const rows = await hudRows($, surface, 80)

      expect(rows.length).toBeLessThanOrEqual(3)
      for (const row of rows) {
        expect(row.cells).toBeLessThanOrEqual(80)
      }
      const shown = rows.flatMap(row => row.texts)
      expect(shown).toContain('Lv 4 Scholar')
      expect(shown).toContain('Exhausted')
      expect(shown).toContain('XP 275/550')
      expect(shown).toContain('Quest #6 Jira Quest Source…')
      expect(shown).toContain('Boss 2/2 HP · /boss')
      expect(shown).toContain('2 Questions waiting · /sage')
      expect(shown).toContain('Crafting: Order Ledger')
      expect(shown).toContain('Mana 62%')
      expect(shown).toContain('$3.47')
      expect(shown).toContain('INT 120 · WIS 45 · DEX 0 · STR 30')
      expect(shown).toContain('★3')
    }
  })

  test('at 40 columns the Quest shortens to its reference and the lesser parts give way, every row inside', async ($, on) => {
    keptGame(on, WORST_CASE)

    const rows = await hudRows($, 'terminal', 40)
    const shown = rows.flatMap(row => row.texts)

    expect(rows.length).toBeLessThanOrEqual(3)
    for (const row of rows) {
      expect(row.cells).toBeLessThanOrEqual(40)
    }
    expect(shown).toContain('Lv 4 Scholar')
    expect(shown).toContain('Exhausted')
    expect(shown).toContain('Quest #6')
    expect(shown).toContain('Boss 2/2 HP · /boss')
    expect(shown).toContain('2 Questions waiting · /sage')
    expect(shown).not.toContain('INT 120 · WIS 45 · DEX 0 · STR 30')
  })

  test('a wide band shows every part, the Quest\'s title whole up to its cut', TEXT_HUD, async ($, on) => {
    keptGame(on, WORST_CASE)

    const shown = (await hudRows($, 'desktop', 200)).flatMap(row => row.texts)

    expect(shown).toContain('Quest #6 Jira Quest Source: read the p…')
    expect(shown).toContain('★3')
    expect(shown).toContain('Crafting: Order Ledger')
    expect(shown).toContain('Mana 62%')
    expect(shown).toContain('claude-opus-5-5')
    expect(shown).toContain('$3.47')
    expect(shown).toContain('INT 120 · WIS 45 · DEX 0 · STR 30')
  })
})
