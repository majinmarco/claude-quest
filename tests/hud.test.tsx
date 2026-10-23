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
  test('a new Player is kept on first load and shows level 1 and no XP', async ($, on) => {
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

  test('a Read fires, and the HUD shows the XP gain and the Exploration', async ($, on) => {
    const kept = keptStore(on)
    on('tool.call', () => read.result)
    on('session.start', (_, e) => ({ cwd: e.cwd }))
    await $.session.start(START)

    await $.tool.call(read.input)

    expect(kept.get('player')).toMatchObject({ level: 1, xp: 5 })

    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...HUD, surface })

      expect((await ui.find({ type: 'Text', text: /^XP / }))?.text).toBe('XP 5/100')
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

    const ui = await $.ui.mount({ ...HUD, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /^Lv / }))?.text).toBe('Lv 3')
    expect((await ui.find({ type: 'Text', text: /^XP / }))?.text).toBe('XP 47/300')
    await ui.unmount()
  })

  test('a Read before the session has started keeps building on the kept Player', async ($, on) => {
    const kept = keptStore(on, { player: LEVEL_3 })
    on('tool.call', () => read.result)

    await $.tool.call(read.input)

    expect(kept.get('player')).toMatchObject({ level: 3, xp: 47 })
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
  test('before any measurement, a fresh session shows Mana with no reading', async ($, on) => {
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

  test('a resumed session shows its Mana from the start', async ($, on) => {
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

  test('a measurement shows Mana, the model and the spend', async ($, on) => {
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

  test('Mana turns yellow as it fills', async ($, on) => {
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

  test('Mana past 80% turns red and warns before compaction, once', async ($, on) => {
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
  test('/implement #4 starts a Quest the HUD shows', async ($, on) => {
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
      'Quest started: #4',
      'Quest abandoned: #4',
      'Quest started: #5',
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
