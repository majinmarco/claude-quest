import { describe, expect, test } from 'claude-code/testing'
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
