// Prophecy through the mod: a test file edited arms it, the HUD's Buttons
// (or /prophecy) call it, the next Check settles it with a toast.

import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { vitestFailing1, vitestFailing3, vitestPassing } from './fixtures/bash-calls'
import { editOneLine } from './fixtures/file-changes'

const ROOT = '/work/runners'

const HUD = {
  plugin: 'quest-mod',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const START = { cwd: ROOT, surface: 'terminal', isInteractive: true } as const

/** A recorded call: what the hook saw, and what the tool answered. */
type Recorded = { input: { tool: string; tool_use_id: string; file_path?: string }; result: unknown }

/** The recorded one-line Edit, made to `path` instead. */
const editOf = (path: string, id: string): Recorded => ({
  input: { ...editOneLine.input, file_path: path, tool_use_id: id },
  result: { ...editOneLine.result, result: { ...editOneLine.result.result, filePath: path } },
})

const editTest = editOf(`${ROOT}/tests/greeting.test.ts`, 'toolu_edit_test')
const editSource = editOf(`${ROOT}/src/greeting.ts`, 'toolu_edit_source')

/** Answers the engine's side of the mod, and keeps what the mod toasts and stores. */
const engine = (on: On) => {
  const kept = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_, e) => {
    kept.set(e.key, e.value)

    return { value: undefined }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('command.run', () => ({}))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('session.root', () => ({ value: ROOT }))
  on('fs.exists', () => ({ value: false }))
  on('fs.write', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.log', () => ({ value: undefined }))
  on('process.run', () => ({
    value: { exitCode: 1, stdout: '', stderr: 'offline\n', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  const answers = new Map<string, unknown>()
  // What happens while a call runs, before it answers, by its id.
  const meanwhile = new Map<string, () => Promise<void>>()
  on('tool.call', async (_, e) => {
    await meanwhile.get(e.tool_use_id ?? '')?.()

    return answers.get(e.tool_use_id ?? '') as never
  })
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  mock.clock(on, { now: Date.UTC(2026, 9, 24, 10, 0) })

  return {
    toasts,
    meanwhile,
    player: () => kept.get('player') as { stats: Record<string, number> } | undefined,
    call: ($: Engine, recorded: Recorded) => {
      answers.set(recorded.input.tool_use_id, recorded.result)

      return $.tool.call(recorded.input as never)
    },
  }
}

/** Runs `/<command> <args>` as the person types it. */
const run = ($: Engine, command: string, args = '') =>
  $.command.run({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })

const startQuest = ($: Engine) => run($, 'mattpocock-skills:implement', '#18')

/** The Prophecy's Buttons the HUD draws on `surface` (label and hotkey), and the call shown. */
const hudOn = async ($: Engine, surface: 'terminal' | 'desktop') => {
  const ui = await $.ui.mount({ ...HUD, surface })
  const buttons = await ui.findAll({ type: 'Button' })
  const called = await ui.find({ type: 'Text', text: /^Prophecy: [A-Z]/ })
  await ui.unmount()

  return {
    buttons: buttons.map(button => ({ label: button.props.label, hotkey: button.props.hotkey })),
    called: called === undefined ? undefined : { text: called.text, dim: called.props.dimColor },
  }
}

const THREE = [
  { label: '1 Red', hotkey: '1' },
  { label: '2 Green', hotkey: '2' },
  { label: '3 Rout', hotkey: '3' },
]

describe('Prophecy', () => {
  test('a test file edited during a Quest arms it: Red, Green and Rout on hotkeys 1, 2, 3, in the text band and beside the pixel strip', async ($, on) => {
    const { call } = engine(on)
    await $.session.start(START)
    await startQuest($)

    await call($, editSource)
    expect((await hudOn($, 'terminal')).buttons).toEqual([])

    await call($, editTest)
    expect((await hudOn($, 'terminal')).buttons).toEqual(THREE)
    expect((await hudOn($, 'desktop')).buttons).toEqual(THREE)
  })

  test('a Button pressed calls it: the Buttons go, the call shows dim, and a right call is fulfilled with a toast', async ($, on) => {
    const { call, toasts, player } = engine(on)
    await $.session.start(START)
    await startQuest($)
    await call($, editTest)

    const ui = await $.ui.mount({ ...HUD, surface: 'terminal' })
    await ui.press({ key: 'prophecy:red' })
    await ui.unmount()

    expect(await hudOn($, 'terminal')).toEqual({ buttons: [], called: { text: 'Prophecy: Red', dim: true } })

    await call($, vitestFailing1)
    expect(toasts).toContain('Prophecy fulfilled: Red (+10 DEX)')
    expect(player()?.stats.dexterity).toBe(10)
    expect((await hudOn($, 'terminal')).called).toBeUndefined()
  })

  test('a wrong call fails with a toast, costing nothing', async ($, on) => {
    const { call, toasts, player } = engine(on)
    await $.session.start(START)
    await startQuest($)
    await call($, editTest)

    expect((await run($, 'prophecy', 'rout')).text).toBe('You call it: Rout. The next Check will tell.')
    await call($, vitestPassing)

    expect(toasts).toContain('Prophecy failed: it was Green')
    expect(player()?.stats.dexterity).toBe(0)
  })

  test('/prophecy takes a call only while one is armed and not yet called, and says how to', async ($, on) => {
    const { call } = engine(on)
    await $.session.start(START)
    await startQuest($)

    expect((await run($, 'prophecy', 'red')).text).toBe('No Prophecy is armed: one is when Claude edits a test file.')
    await call($, editTest)
    expect((await run($, 'prophecy')).text).toBe(
      'A Prophecy is armed (greeting.test.ts): call the next Check with /prophecy red, green or rout.',
    )
    expect((await run($, 'prophecy', 'purple')).text).toBe('Call it with /prophecy red, green or rout.')
    expect((await run($, 'prophecy', 'Rout')).text).toBe('You call it: Rout. The next Check will tell.')
    expect((await run($, 'prophecy', 'red')).text).toBe('You called it already: Rout. The next Check will tell.')
  })

  test('no call is taken while the Check runs: what it prints cannot be read before calling', async ($, on) => {
    const { call, toasts, meanwhile } = engine(on)
    await $.session.start(START)
    await startQuest($)
    await call($, editTest)

    // The Check under way: the Player calls it from the prompt meanwhile.
    let calledMidway: string | undefined
    meanwhile.set(vitestFailing1.input.tool_use_id, async () => {
      calledMidway = (await run($, 'prophecy', 'red')).text
    })
    await call($, vitestFailing1)

    expect(calledMidway).toBe('No Prophecy is armed: one is when Claude edits a test file.')
    expect(toasts.some(toast => toast.startsWith('Prophecy'))).toBe(false)
  })

  test('the Player\'s Stats show Dexterity in play in /badges', async ($, on) => {
    const { call } = engine(on)
    await $.session.start(START)
    await startQuest($)
    await call($, editTest)
    await run($, 'prophecy', 'rout')
    await call($, vitestFailing3)

    const sheet = (await run($, 'badges')).text?.split('\n') ?? []
    expect(sheet).toContain('  DEX Dexterity 10')
    expect(sheet.some(line => line.startsWith('  DEX') && line.includes('not yet in play'))).toBe(false)
  })
})
