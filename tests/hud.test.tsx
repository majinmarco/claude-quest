import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

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
