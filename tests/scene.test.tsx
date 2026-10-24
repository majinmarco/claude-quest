import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderSurface } from 'claude-code'

import { read } from './fixtures/tool-calls'

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

const START = { cwd: '/work/claude-quest', surface: 'desktop', isInteractive: true } as const

const ROOT = '/work/claude-quest'
const REGION = `${ROOT}/.claude/claude-quest.json`

/**
 * Answers the engine's side of the mod: its store, its command, its panes, the
 * surfaces it draws on and the project's files (the Region file among them).
 */
const engine = (
  on: On,
  {
    surfaces = ['desktop'],
    files = {},
  }: { surfaces?: RenderSurface[]; files?: Record<string, string> } = {},
) => {
  const kept = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_, e) => {
    kept.set(e.key, e.value)

    return { value: undefined }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.surfaces', () => ({ value: surfaces }))
  on('session.root', () => ({ value: ROOT }))
  on('tool.call', () => read.result)

  const project = new Map(Object.entries(files))
  on('fs.exists', (_, e) => ({ value: project.has(e.path) }))
  on('fs.read', (_, e) => ({ value: project.get(e.path) ?? '' }))
  on('fs.write', (_, e) => {
    project.set(e.path, e.text)

    return { value: undefined }
  })

  const opened: string[] = []
  on('ui.open', (_, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true } }
  })

  // The clock lets a test wait out what the mod does not await.
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 23, 20, 0) })

  return { opened, project, clock, player: () => kept.get('player') }
}

/** Runs `/scene` as the person types it. */
const scene = ($: Engine) =>
  $.command.run({
    command: 'scene',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })

/** A Read of `file`, under the project's root, as Claude Code makes it. */
const readOf = (file: string) => ({ ...read.input, file_path: `${ROOT}/${file}` })

describe('Scene pane', () => {
  test('/scene opens the Scene pane', async ($, on) => {
    const { opened } = engine(on, { surfaces: ['terminal'] })
    await $.session.start({ ...START, surface: 'terminal' })

    await scene($)

    expect(opened).toEqual(['scene'])
  })

  test('a session on the desktop opens the Scene as it starts', async ($, on) => {
    const { opened } = engine(on, { surfaces: ['desktop'] })

    await $.session.start(START)

    expect(opened).toEqual(['scene'])
  })

  test('a session only in the terminal leaves the Scene closed until asked', async ($, on) => {
    const { opened } = engine(on, { surfaces: ['terminal'] })

    await $.session.start({ ...START, surface: 'terminal' })

    expect(opened).toEqual([])
  })

  test('the desktop joining a terminal session opens the Scene', async ($, on) => {
    const { opened } = engine(on, { surfaces: ['terminal'] })
    on('session.attach', (_, e) => ({ clientId: e.clientId }))
    await $.session.start({ ...START, surface: 'terminal' })

    await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })

    expect(opened).toEqual(['scene'])
  })

  test('before any Encounter the desktop shows the hero waiting', async ($, on) => {
    engine(on)
    await $.session.start(START)

    const ui = await $.ui.mount({ ...SCENE, surface: 'desktop' })
    const art = await ui.find({ type: 'Svg' })
    expect(art?.props.alt).toBe('No Encounter yet: the Scene wakes as Claude reads the code.')
    expect((await ui.find({ type: 'Text' }))?.text).toBe(
      'No Encounter yet: the Scene wakes as Claude reads the code.',
    )
    await ui.unmount()
  })

  test('a Read plays an animated Exploration scene on the desktop', async ($, on) => {
    engine(on)
    await $.session.start(START)

    await $.tool.call(readOf('src/engine.ts'))

    const ui = await $.ui.mount({ ...SCENE, surface: 'desktop' })
    const art = await ui.find({ type: 'Svg' })
    expect(art?.props.isInteractive).toBe(true)
    expect(String(art?.props.source)).toMatch(/^<svg [^>]*>.*<animateTransform /)
    expect(art?.props.alt).toBe('Exploring engine.ts in src · first visit, +6 XP')
    await ui.unmount()
  })

  test('in the terminal the Scene is one line telling the Encounter', async ($, on) => {
    engine(on)
    await $.session.start(START)

    await $.tool.call(readOf('src/engine.ts'))
    await $.tool.call(readOf('src/hud.tsx'))

    const ui = await $.ui.mount({ ...SCENE, surface: 'terminal' })
    const lines = await ui.findAll({ type: 'Text' })
    expect(lines.map(line => line.text)).toEqual(['Exploring hud.tsx in src'])
    await ui.unmount()
  })

  test('a Read at the project root explores the root', async ($, on) => {
    engine(on)
    await $.session.start(START)

    await $.tool.call(readOf('GLOSSARY.md'))

    const ui = await $.ui.mount({ ...SCENE, surface: 'terminal' })
    expect((await ui.find({ type: 'Text' }))?.text).toBe(
      'Exploring GLOSSARY.md in the project root · first visit, +6 XP',
    )
    await ui.unmount()
  })
})

describe('Exploration: first visit to a module', () => {
  test('a Read outside the project explores, but discovers nothing', async ($, on) => {
    const { player, project, clock } = engine(on)
    await $.session.start(START)

    await $.tool.call({ ...read.input, file_path: '/home/marco/.claude/settings.json' })
    // The Region file is written after the tool call, never holding it up.
    await clock.settle()

    expect(player()).toMatchObject({ xp: 1 })
    expect(project.has(REGION)).toBe(false)
    const ui = await $.ui.mount({ ...SCENE, surface: 'terminal' })
    expect((await ui.find({ type: 'Text' }))?.text).toBe(
      'Exploring settings.json outside the project',
    )
    await ui.unmount()
  })

  test('the first Read in a module earns the bonus; the next in it does not', async ($, on) => {
    const { player } = engine(on)
    await $.session.start(START)

    await $.tool.call(readOf('src/engine.ts'))
    expect(player()).toMatchObject({ xp: 6 })

    await $.tool.call(readOf('src/hud.tsx'))
    expect(player()).toMatchObject({ xp: 7 })

    await $.tool.call(readOf('tests/engine.test.ts'))
    expect(player()).toMatchObject({ xp: 13 })

    const ui = await $.ui.mount({ ...HUD, surface: 'terminal' })
    expect((await ui.find({ type: 'Text', text: /^XP / }))?.text).toBe('XP 13/100')
    await ui.unmount()
  })

  test('the Region file keeps the modules discovered', async ($, on) => {
    const { project, clock } = engine(on)
    await $.session.start(START)

    await $.tool.call(readOf('src/engine.ts'))
    await $.tool.call(readOf('src/hud.tsx'))
    await $.tool.call(readOf('tests/fixtures/tool-calls.ts'))
    // The Region file is written after the tool call, never holding it up.
    await clock.settle()

    expect(JSON.parse(project.get(REGION) ?? 'null')).toEqual({
      quests: [],
      discoveredModules: ['src', 'tests/fixtures'],
    })
  })

  test('a module discovered in an earlier session earns no bonus', async ($, on) => {
    const earlier = { quests: [], discoveredModules: ['src'] }
    const { player } = engine(on, { files: { [REGION]: JSON.stringify(earlier) } })
    await $.session.start(START)

    await $.tool.call(readOf('src/engine.ts'))

    expect(player()).toMatchObject({ xp: 1 })
  })

  test('discovering a module keeps the rest of the Region file as it was', async ($, on) => {
    const quest = { ticket: '#7', startedAt: '2026-10-23T19:00:00.000Z', status: 'active' }
    const earlier = { quests: [quest], questSource: { kind: 'github' }, discoveredModules: ['src'] }
    const { project, clock } = engine(on, { files: { [REGION]: JSON.stringify(earlier) } })
    await $.session.start(START)

    await $.tool.call(readOf('hooks/register.tsx'))
    // The Region file is written after the tool call, never holding it up.
    await clock.settle()

    expect(JSON.parse(project.get(REGION) ?? 'null')).toEqual({
      ...earlier,
      discoveredModules: ['src', 'hooks'],
    })
  })
})
