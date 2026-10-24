import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { editOneLine, editTwelveLines, writeNewFile } from './fixtures/file-changes'

const SCENE = {
  plugin: 'quest-mod',
  component: 'Pane',
  requestId: 'scene',
  props: {
    title: 'Scene',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

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

const START = { cwd: '/work/forge', surface: 'desktop', isInteractive: true } as const

/** A recorded file change: what the hook saw, and what the tool answered. */
type Recorded = { input: { tool: string; tool_use_id: string }; result: unknown }

/**
 * Answers the engine's side of the mod, each tool call with the result its
 * recording answered, and keeps what the mod stores.
 */
const engine = (on: On) => {
  const kept = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_, e) => {
    kept.set(e.key, e.value)

    return { value: undefined }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('session.root', () => ({ value: '/work/forge' }))
  on('fs.exists', () => ({ value: false }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', () => ({ value: undefined }))

  const answers = new Map<string, unknown>()
  on('tool.call', (_, e) => answers.get(e.tool_use_id ?? '') as never)
  mock.clock(on, { now: Date.UTC(2026, 9, 23, 20, 0) })

  return {
    player: () => kept.get('player'),
    /** Teaches the engine a recording's answer, and gives its call to make. */
    recorded: (call: Recorded) => {
      answers.set(call.input.tool_use_id, call.result)

      return call.input as never
    },
  }
}

/** The Scene's line and art on `surface`. */
const sceneOn = async ($: Engine, surface: 'terminal' | 'desktop') => {
  const ui = await $.ui.mount({ ...SCENE, surface })
  const text = (await ui.find({ type: 'Text' }))?.text
  const art = await ui.find({ type: 'Svg' })
  await ui.unmount()

  return { text, art }
}

describe('Crafting', () => {
  test('a new file is forged on the desktop: the blacksmith at the anvil, the item named after it', async ($, on) => {
    const { recorded, player } = engine(on)
    await $.session.start(START)

    await $.tool.call(recorded(writeNewFile))

    const { text, art } = await sceneOn($, 'desktop')
    expect(text).toBe(
      'The blacksmith forges the User Profile Card: new file user-profile-card.tsx in src, 23 lines · +10 XP',
    )
    expect(art?.props.alt).toBe(text)
    expect(art?.props.isInteractive).toBe(true)
    expect(String(art?.props.source)).toMatch(/^<svg [^>]*>.*<animate/)
    expect(player()).toMatchObject({ xp: 10 })
  })

  test('in the terminal a major edit is one line: the item reforged, its lines counted', async ($, on) => {
    const { recorded } = engine(on)
    await $.session.start({ ...START, surface: 'terminal' })

    await $.tool.call(recorded(editTwelveLines))

    const { text, art } = await sceneOn($, 'terminal')
    expect(text).toBe(
      'The blacksmith reforges the Order Ledger: order-ledger.ts in src, +12 -10 lines · +10 XP',
    )
    expect(art).toBeUndefined()
  })

  test('a minor edit forges nothing: the Scene stays as it was, no XP', async ($, on) => {
    const { recorded, player } = engine(on)
    await $.session.start(START)

    await $.tool.call(recorded(editOneLine))

    expect((await sceneOn($, 'terminal')).text).toMatch(/^No Encounter yet/)
    expect(player()).toMatchObject({ xp: 0 })
  })

  test('the HUD names the item being crafted', async ($, on) => {
    const { recorded } = engine(on)
    await $.session.start(START)

    await $.tool.call(recorded(writeNewFile))

    const ui = await $.ui.mount({ ...HUD, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /Crafting/ }))?.text).toBe(
      'Crafting: User Profile Card',
    )
    await ui.unmount()
  })

  test('the tool call\'s own result reaches the model unchanged', async ($, on) => {
    const { recorded } = engine(on)
    await $.session.start(START)

    const outcome = await $.tool.call(recorded(writeNewFile))

    expect(outcome).toEqual(writeNewFile.result)
  })
})
