import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import {
  eslintFailing,
  jestSuiteBroken,
  tscFailing3,
  vitestFailing1,
  vitestFailing3,
  vitestPassing,
} from './fixtures/bash-calls'

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

const START = { cwd: '/work/runners', surface: 'desktop', isInteractive: true } as const

/** A recorded Bash call: what the hook saw, and what the tool answered. */
type Recorded = { input: { command: string; tool: 'Bash'; tool_use_id: string }; result: unknown }

/**
 * Answers the engine's side of the mod, each Bash call with the result its
 * recording answered, and keeps what the mod toasts and stores.
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
  on('session.root', () => ({ value: '/work/runners' }))
  on('fs.exists', () => ({ value: false }))
  on('ui.open', () => ({ value: { isPlaced: true } }))

  const answers = new Map<string, unknown>()
  on('tool.call', (_, e) => answers.get(e.tool_use_id ?? '') as never)

  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  mock.clock(on, { now: Date.UTC(2026, 9, 23, 20, 0) })

  return {
    toasts,
    player: () => kept.get('player'),
    /** Teaches the engine a recording's answer, and gives its call to make. */
    recorded: (call: Recorded) => {
      answers.set(call.input.tool_use_id, call.result)

      return call.input
    },
  }
}

/** The Scene's line and art on `surface`. */
const lineOn = async ($: Engine, surface: 'terminal' | 'desktop') => {
  const ui = await $.ui.mount({ ...SCENE, surface })
  const text = (await ui.find({ type: 'Text' }))?.text
  const art = await ui.find({ type: 'Svg' })
  await ui.unmount()

  return { text, art }
}

describe('Battle', () => {
  test('a failing test run spawns a bug with an HP per failure, played on the desktop', async ($, on) => {
    const { recorded } = engine(on)
    await $.session.start(START)

    await $.tool.call(recorded(vitestFailing3))

    const { text, art } = await lineOn($, 'desktop')
    expect(text).toBe('A bug appears: vitest run, 3 failing · 3/3 HP')
    expect(art?.props.alt).toBe(text)
    expect(art?.props.isInteractive).toBe(true)
    expect(String(art?.props.source)).toMatch(/^<svg [^>]*>.*<animate/)
  })

  test('in the terminal the Battle is one line: hits, then the win', async ($, on) => {
    const { recorded, player, toasts } = engine(on)
    await $.session.start({ ...START, surface: 'terminal' })

    await $.tool.call(recorded(vitestFailing3))
    await $.tool.call(recorded(vitestFailing1))
    expect((await lineOn($, 'terminal')).text).toBe('2 hits on the bug: vitest run · 1/3 HP')

    await $.tool.call(recorded(vitestPassing))
    expect((await lineOn($, 'terminal')).text).toBe(
      'Battle won: vitest run all green · +30 XP (Strength)',
    )
    expect(player()).toMatchObject({ xp: 30, stats: { strength: 30 } })
    expect(toasts).toContain('Battle won! vitest run is all green: +30 XP (Strength)')
  })

  test('a failure whose counts cannot be read spawns a one-HP monster', async ($, on) => {
    const { recorded } = engine(on)
    await $.session.start(START)

    await $.tool.call(recorded(jestSuiteBroken))

    expect((await lineOn($, 'terminal')).text).toBe(
      'A bug appears: jest failed, its failures unread · 1/1 HP',
    )
  })

  test('a lint run spawns a slime, a type-check a ghost', async ($, on) => {
    const { recorded } = engine(on)
    await $.session.start(START)

    await $.tool.call(recorded(eslintFailing))
    expect((await lineOn($, 'terminal')).text).toBe(
      'A slime appears: eslint bad.js, 3 errors · 3/3 HP',
    )

    await $.tool.call(recorded(tscFailing3))
    expect((await lineOn($, 'terminal')).text).toBe(
      'A ghost appears: tsc --noEmit bad3.ts, 3 type errors · 3/3 HP',
    )
  })

  test('the HUD names the Battle and its monster\'s HP', async ($, on) => {
    const { recorded } = engine(on)
    await $.session.start(START)

    await $.tool.call(recorded(vitestFailing3))

    const ui = await $.ui.mount({ ...HUD, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /Battle/ }))?.text).toBe('Battle: bug 3/3 HP')
    await ui.unmount()
  })

  test('the tool call\'s own result reaches the model unchanged', async ($, on) => {
    const { recorded } = engine(on)
    await $.session.start(START)

    const outcome = await $.tool.call(recorded(vitestFailing3))

    expect(outcome).toEqual(vitestFailing3.result)
  })
})
