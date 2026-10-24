import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, ProcessRunResult, RenderSurface } from 'claude-code'

import { read } from './fixtures/tool-calls'
import { bandButtons, bandTexts, GAME, gameSized, inBand } from './fixtures/game-screen'

const START = { cwd: '/work', surface: 'desktop', isInteractive: true } as const

const ran = (exitCode: number, stdout: string, stderr = ''): ProcessRunResult => ({
  exitCode,
  stdout,
  stderr,
  isStdoutTruncated: false,
  isStderrTruncated: false,
})

/** Eight open issues: two pages of the Quest Board. */
const ISSUES = Array.from({ length: 8 }, (_, at) => ({
  number: at + 1,
  title: `Quest number ${at + 1}`,
  url: `https://github.com/majinmarco/claude-quest/issues/${at + 1}`,
  state: 'OPEN',
  labels: [{ name: 'ready-for-agent' }, { name: 'size: M' }],
}))

/** The pane ids the mod drew before the Game Screen, any of which an older load may have left open. */
const OLD_PANES = ['scene', 'quest-board', 'sage', 'boss', 'region-map', 'quest-log', 'overview']

/**
 * Answers the engine's side of the mod: its store, its commands, its panes
 * (`open`: the ids already open as the session starts), gh's issues, the
 * surfaces it draws on.
 */
const engine = (on: On, { surfaces = ['desktop'], open = [] as string[] }: { surfaces?: RenderSurface[]; open?: string[] } = {}) => {
  const kept = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_, e) => {
    kept.set(e.key, e.value)

    return { value: undefined }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.surfaces', () => ({ value: surfaces }))
  on('session.root', () => ({ value: '/work' }))
  on('session.repo', () => ({ value: { root: '/work', remote: 'git@github.com:majinmarco/claude-quest.git', internal: false, name: null } }))
  on('tool.call', () => read.result)
  on('fs.exists', () => ({ value: false }))
  on('fs.list', () => ({ value: [] }))
  on('process.run', (_, e) =>
    e.argv[0] === 'gh' && e.argv[2] === 'list' && !e.argv.includes('closed')
      ? { value: ran(0, JSON.stringify(ISSUES)) }
      : e.argv[0] === 'gh'
        ? { value: ran(0, '[]') }
        : { value: ran(128, '', 'fatal: not a git repository\n') },
  )
  const panes = new Set(open)
  const opened: string[] = []
  on('ui.open', (_, e) => {
    opened.push(e.id)
    panes.add(e.id)

    return { value: { isPlaced: true } }
  })
  const closed: string[] = []
  on('ui.close', (_, e) => {
    closed.push(e.id)
    panes.delete(e.id)

    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: [...panes].map(id => ({ id, title: id, isShown: true, isFocused: false, isPlaced: true })),
  }))
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 24, 9, 0) })

  return { opened, closed, panes, settle: () => clock.settle() }
}

/** Runs `/<command> <args>` as the Player types it. */
const run = ($: Engine, command: string, args = '') =>
  $.command.run({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })

type Drawn = Parameters<typeof bandTexts>[0] & {
  findAll: (query: { type: string }) => Promise<{ key: string | undefined; props: Record<string, unknown> }[]>
}

/** The view the tab row shows chosen: its Button drawn primary. */
const chosenView = async (ui: Drawn): Promise<string | undefined> =>
  (await inBand(ui, 'game-tabs', 'Button')).find(button => button.props.variant === 'primary')?.key?.replace('game-tab:', '')

describe('Game Screen: one pane', () => {
  test('every game command opens the Game Screen, and no other pane', async ($, on) => {
    const { opened, panes, settle } = engine(on, { surfaces: ['terminal'] })
    await $.session.start({ ...START, surface: 'terminal' })

    for (const [command, args] of [
      ['game', ''],
      ['scene', ''],
      ['quest-board', ''],
      ['map', ''],
      ['quest', '#3'],
      ['badges', ''],
      ['sage', ''],
      ['boss', ''],
      ['overview', ''],
    ] as const) {
      await run($, command, args)
      await settle()
      expect([...panes]).toEqual(['game'])
    }
    expect(new Set(opened)).toEqual(new Set(['game']))
  })

  test('panes an older load left open are closed as the session starts', async ($, on) => {
    const { closed, panes } = engine(on, { surfaces: ['terminal'], open: [...OLD_PANES, 'game'] })

    await $.session.start({ ...START, surface: 'terminal' })

    expect(closed.sort()).toEqual([...OLD_PANES].sort())
    expect([...panes]).toEqual(['game'])
  })

  test('the Game Screen opens itself once per session on a surface that draws its art', async ($, on) => {
    const { opened } = engine(on, { surfaces: ['desktop'] })
    on('session.attach', (_, e) => ({ clientId: e.clientId }))
    await $.session.start(START)
    await $.session.attach({ surface: 'vscode', clientId: 'vscode:default' })

    expect(opened).toEqual(['game'])
  })

  test('in the terminal alone it waits for a command', async ($, on) => {
    const { opened } = engine(on, { surfaces: ['terminal'] })
    await $.session.start({ ...START, surface: 'terminal' })

    expect(opened).toEqual([])
  })
})

describe('Game Screen: views', () => {
  test('each command opens the Game Screen on its view; /game and /scene keep the last one', async ($, on) => {
    const { settle } = engine(on, { surfaces: ['terminal'] })
    await $.session.start({ ...START, surface: 'terminal' })
    const viewAfter = async (command: string, args = '') => {
      await run($, command, args)
      await settle()
      const ui = await $.ui.mount({ ...GAME, surface: 'terminal' })
      const view = await chosenView(ui)
      await ui.unmount()

      return view
    }

    expect(await viewAfter('game')).toBe('quests')
    expect(await viewAfter('map')).toBe('map')
    expect(await viewAfter('scene')).toBe('map')
    expect(await viewAfter('quest', '#3')).toBe('log')
    expect(await viewAfter('badges')).toBe('sheet')
    expect(await viewAfter('quest-board')).toBe('quests')
    expect(await viewAfter('overview')).toBe('sheet')
    expect(await viewAfter('sage')).toBe('sheet')
    expect(await viewAfter('boss')).toBe('sheet')
    expect(await viewAfter('game')).toBe('sheet')
  })

  test('the tab row switches views with Buttons on hotkeys 1 to 4, Lv and ★ at its end', async ($, on) => {
    engine(on, { surfaces: ['terminal'] })
    await $.session.start({ ...START, surface: 'terminal' })
    await run($, 'game')

    const ui = await $.ui.mount({ ...GAME, surface: 'terminal' })
    const tabs = await inBand(ui, 'game-tabs', 'Button')
    expect(tabs.map(tab => [tab.key, tab.props.hotkey, tab.text])).toEqual([
      ['game-tab:quests', '1', '1 Quests'],
      ['game-tab:map', '2', '2 Map'],
      ['game-tab:log', '3', '3 Log'],
      ['game-tab:sheet', '4', '4 Sheet'],
    ])
    expect(await bandTexts(ui, 'game-tabs')).toEqual(expect.arrayContaining(['Lv 1', '★0']))

    await ui.press({ key: 'game-tab:sheet' })
    expect(await chosenView(ui)).toBe('sheet')
    await ui.press({ key: 'game-tab:log' })
    expect(await chosenView(ui)).toBe('log')
    await ui.unmount()
  })

  test('the view and each view\'s place survive a view switch and a reload', async ($, on) => {
    const { settle } = engine(on, { surfaces: ['terminal'] })
    await $.session.start({ ...START, surface: 'terminal' })
    await run($, 'quest-board')
    await settle()

    let ui = await $.ui.mount({ ...GAME, surface: 'terminal' })
    await ui.press({ key: 'page-next' })
    expect(await bandTexts(ui, 'game-panel')).toContain('Page 2 of 2')
    await ui.press({ key: 'game-tab:sheet' })
    await ui.press({ key: 'game-tab:quests' })
    expect(await bandTexts(ui, 'game-panel')).toContain('Page 2 of 2')
    await ui.press({ key: 'game-tab:map' })
    await ui.unmount()

    // A reload runs session.start again over the session's $.state.
    await $.session.start({ ...START, surface: 'terminal' })
    ui = await $.ui.mount({ ...GAME, surface: 'terminal' })
    expect(await chosenView(ui)).toBe('map')
    await ui.press({ key: 'game-tab:quests' })
    expect(await bandTexts(ui, 'game-panel')).toContain('Page 2 of 2')
    await ui.unmount()
  })

  test("the Board's selected Scroll takes U and T: the first on the page until one is unrolled", async ($, on) => {
    const { settle } = engine(on, { surfaces: ['terminal'] })
    await $.session.start({ ...START, surface: 'terminal' })
    await run($, 'quest-board')
    await settle()

    const ui = await $.ui.mount({ ...GAME, surface: 'terminal' })
    const hotkeyed = async () =>
      (await inBand(ui, 'game-panel', 'Button')).filter(button => button.props.hotkey !== undefined).map(button => [button.key, button.props.hotkey])
    expect(await hotkeyed()).toEqual([
      ['quest:#1', 't'],
      ['scroll:#1', 'u'],
    ])
    await ui.press({ key: 'scroll:#3' })
    expect(await hotkeyed()).toEqual([
      ['quest:#3', 't'],
      ['scroll:#3', 'u'],
    ])
    await ui.unmount()
  })
})

describe('Game Screen: layout', () => {
  test('room for the stage, three dialogue rows and eight panel rows: the full stage', async ($, on) => {
    engine(on)
    await $.session.start(START)

    const ui = await $.ui.mount({ ...gameSized(40), surface: 'desktop' })
    const [stage] = await inBand(ui, 'game-stage', 'Svg')
    expect(stage?.props.width).toBe(384)
    expect(String(stage?.props.source)).toContain('viewBox="0 0 128 64"')
    await ui.unmount()
  })

  test('a shorter pane shrinks the stage to one strip of sprites', async ($, on) => {
    engine(on)
    await $.session.start(START)

    for (const props of [gameSized(20), gameSized(12, 60, 'inline')]) {
      const ui = await $.ui.mount({ ...props, surface: 'desktop' })
      const [stage] = await inBand(ui, 'game-stage', 'Svg')
      expect(stage?.props.width).toBe(256)
      expect(String(stage?.props.source)).toContain('viewBox="0 0 128 16"')
      await ui.unmount()
    }
  })

  test('a narrow pane draws the full stage as wide as it is', async ($, on) => {
    engine(on)
    await $.session.start(START)

    const ui = await $.ui.mount({ ...gameSized(40, 40), surface: 'desktop' })
    const [stage] = await inBand(ui, 'game-stage', 'Svg')
    expect(stage?.props.width).toBe(320)
    await ui.unmount()
  })

  test('the terminal draws four text bands: the Scene line, the dialogue box, the tab row, the panel', async ($, on) => {
    engine(on, { surfaces: ['terminal'] })
    await $.session.start({ ...START, surface: 'terminal' })
    await run($, 'game')

    for (const props of [gameSized(40), gameSized(10)]) {
      const ui = await $.ui.mount({ ...props, surface: 'terminal' })
      expect(await inBand(ui, 'game-stage', 'Svg')).toEqual([])
      expect(await bandTexts(ui, 'game-stage')).toEqual(['No Encounter yet: the Scene wakes as Claude reads the code.'])
      expect((await bandTexts(ui, 'game-dialogue')).length).toBeGreaterThan(0)
      expect(await bandButtons(ui, 'game-tabs')).toHaveLength(4)
      expect((await bandTexts(ui, 'game-panel')).length).toBeGreaterThan(0)
      const rules = (await ui.findAll({ type: 'Text' })).filter(text => /^─+$/.test(String((text as { text?: string }).text ?? '')))
      expect(rules).toHaveLength(3)
      await ui.unmount()
    }
  })

  test('the panel is drawn whole: the pane scrolls it, it is never cut to the window', async ($, on) => {
    const { settle } = engine(on, { surfaces: ['terminal'] })
    await $.session.start({ ...START, surface: 'terminal' })
    await run($, 'quest-board')
    await settle()

    const ui = await $.ui.mount({ ...gameSized(10), surface: 'terminal' })
    expect((await inBand(ui, 'game-panel', 'Button')).filter(button => button.key?.startsWith('quest:'))).toHaveLength(6)
    await ui.unmount()
  })

  test('on the desktop the narrator tells the Encounter in the dialogue box, under the stage', async ($, on) => {
    engine(on)
    await $.session.start(START)
    await $.tool.call({ ...read.input, file_path: '/work/src/engine.ts' })

    const ui = await $.ui.mount({ ...GAME, surface: 'desktop' })
    expect(await bandTexts(ui, 'game-dialogue')).toEqual([expect.stringMatching(/^Exploring engine\.ts in src/)])
    const [stage] = await inBand(ui, 'game-stage', 'Svg')
    expect(String(stage?.props.alt)).toMatch(/^Exploring engine\.ts in src/)
    await ui.unmount()
  })
})
