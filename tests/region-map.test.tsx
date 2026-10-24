import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { FsEntry, On, ProcessRunResult } from 'claude-code'

import { takeQuestContract } from './take-quest-contract'
import { GAME, inPanel } from './fixtures/game-screen'

const MAP = GAME

const START = { cwd: '/work', surface: 'desktop', isInteractive: true } as const
const REGION = '/work/.claude/claude-quest.json'

const ran = (exitCode: number, stdout: string, stderr = ''): ProcessRunResult => ({
  exitCode,
  stdout,
  stderr,
  isStdoutTruncated: false,
  isStderrTruncated: false,
})

type Milestone = { number: number; title: string } | null

const issue = (number: number, milestone: Milestone = null, labels: string[] = []) => ({
  number,
  title: `Quest ${number}`,
  url: `https://github.com/majinmarco/claude-quest/issues/${number}`,
  labels: labels.map(name => ({ name })),
  milestone: milestone === null ? null : { ...milestone, description: '', dueOn: null },
})

const BILLING = { number: 2, title: 'Billing' }
const SEARCH = { number: 3, title: 'Search' }

const dir = (name: string): FsEntry => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })
const file = (name: string): FsEntry => ({ name, kind: 'file', size: 1, mtimeMs: 1, isLink: false })

/** The project on disk at /work: some files at the root, src with files and two folders, docs, ignored folders. */
const TREE: Record<string, FsEntry[]> = {
  '/work': [file('README.md'), dir('src'), dir('docs'), dir('node_modules'), dir('.git'), dir('dist')],
  '/work/src': [file('index.ts'), dir('engine'), dir('art')],
  '/work/docs': [dir('adr')],
  '/work/node_modules': [dir('typescript')],
}

/**
 * The session around the mod: its store, the project at /work (its tree,
 * its Region file), and gh answering open and closed issues. Records the gh
 * listings and what the store keeps.
 */
const world = (
  on: On,
  { open = [] as unknown[], closed = [] as unknown[], region = null as unknown, stored = {} as Record<string, unknown> } = {},
) => {
  const kept = new Map(Object.entries(stored))
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 24, 9, 0) })
  on('session.root', () => ({ value: '/work' }))
  on('session.repo', () => ({ value: { root: '/work', remote: 'https://github.com/majinmarco/claude-quest', internal: false, name: null } }))
  on('fs.exists', (_, e) => ({ value: e.path === REGION && region !== null }))
  on('fs.read', () => ({ value: JSON.stringify(region) }))
  on('fs.list', (_, e) => ({ value: TREE[e.path ?? '/work'] ?? [] }))
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_, e) => {
    kept.set(e.key, e.value)

    return { value: undefined }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  const opened: string[] = []
  on('ui.open', (_, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true } }
  })
  const listings: string[] = []
  on('process.run', (_, e) => {
    const state = e.argv[e.argv.indexOf('--state') + 1] ?? ''
    // Only gh's listings: the session's own git calls (Crafting from the diff) are not the map's.
    if (e.argv[0] === 'gh') {
      listings.push(state)
    }

    return { value: ran(0, JSON.stringify(state === 'closed' ? closed : open)) }
  })

  return { kept, opened, listings, settle: () => clock.settle() }
}

/** Runs the map command as the Player types it. */
const map = ($: Engine) =>
  $.command.run({ command: 'map', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })

type Drawn = Parameters<typeof inPanel>[0]

// The map is the Game Screen's panel: its elements alone, the shell's left out.
const texts = async (ui: Drawn) => (await inPanel(ui, 'Text')).map(found => found.text)
const buttons = async (ui: Drawn) => (await inPanel(ui, 'Button')).map(found => found.key ?? '')
const altOf = async (ui: Drawn) => String((await inPanel(ui, 'Svg'))[0]?.props.alt ?? '')

describe('Region map', () => {
  test('/map opens the Game Screen on the map; it never opens by itself', async ($, on) => {
    const { opened } = world(on, { open: [issue(5)] })
    await $.session.start(START)
    expect(opened).toEqual([])

    await map($)

    expect(opened).toEqual(['game'])
    const ui = await $.ui.mount({ ...MAP, surface: 'terminal' })
    expect((await ui.find({ type: 'Button', key: 'game-tab:map' }))?.props.variant).toBe('primary')
    await ui.unmount()
  })

  test('the desktop draws the overworld as tiles, the terminal as a grid, with the same buttons', async ($, on) => {
    world(on, { open: [issue(5, BILLING), issue(6)] })
    await $.session.start(START)
    await map($)

    const desktop = await $.ui.mount({ ...MAP, surface: 'desktop' })
    expect(await altOf(desktop)).toBe('work: 1 The Wilds 0/1, 2 Billing 0/1')
    const shown = await buttons(desktop)
    await desktop.unmount()

    const terminal = await $.ui.mount({ ...MAP, surface: 'terminal' })
    expect(await inPanel(terminal, 'Svg')).toEqual([])
    expect((await texts(terminal)).some(text => text.includes('┌1'))).toBe(true)
    expect(await buttons(terminal)).toEqual(shown)
    expect(shown).toEqual(['map-overworld', 'map-modules', 'map-refresh', 'site:wilds', 'site:2'])
    await terminal.unmount()
  })

  test('the site buttons carry hotkeys by their number', async ($, on) => {
    world(on, { open: [issue(5, BILLING), issue(6, SEARCH), issue(7)] })
    await $.session.start(START)
    await map($)

    const ui = await $.ui.mount({ ...MAP, surface: 'terminal' })
    const sites = (await ui.findAll({ type: 'Button' })).filter(found => found.key?.startsWith('site:'))
    expect(sites.map(found => [found.key, found.props.hotkey])).toEqual([
      ['site:wilds', '1'],
      ['site:2', '2'],
      ['site:3', '3'],
    ])
    await ui.unmount()
  })

  test('a repo with no milestones draws a Region that is all Wilds', async ($, on) => {
    world(on, { open: [issue(5), issue(6)], closed: [issue(4)] })
    await $.session.start(START)
    await map($)

    const ui = await $.ui.mount({ ...MAP, surface: 'terminal' })
    expect((await buttons(ui)).filter(key => key.startsWith('site:'))).toEqual(['site:wilds'])
    expect((await ui.find({ type: 'Button', key: 'site:wilds' }))?.text).toBe('1 The Wilds 1/3')
    await ui.unmount()
  })

  test('closed tickets are listed once per session per Region; open ones each time the map opens', async ($, on) => {
    const { listings } = world(on, { open: [issue(5)], closed: [issue(4)] })
    await $.session.start(START)

    await map($)
    await map($)

    expect(listings).toEqual(['open', 'closed', 'open'])
  })

  test('a Dungeon of 45 Quests has three Floors; Rooms are lit when closed in the source or won here', async ($, on) => {
    const quests = Array.from({ length: 45 }, (_, at) => issue(100 + at, SEARCH))
    world(on, {
      open: quests.filter(quest => quest.number !== 100),
      closed: [quests[0]],
      region: {
        quests: [
          { ticket: '#101', startedAt: '2026-10-20T10:00:00.000Z', status: 'won', endedAt: '2026-10-20T11:00:00.000Z' },
          { ticket: '#102', startedAt: '2026-10-20T10:00:00.000Z', status: 'won', endedAt: '2026-10-20T11:00:00.000Z' },
          { ticket: '#102', startedAt: '2026-10-21T10:00:00.000Z', status: 'lost', endedAt: '2026-10-21T11:00:00.000Z' },
        ],
      },
    })
    await $.session.start(START)
    await map($)

    const ui = await $.ui.mount({ ...MAP, surface: 'desktop' })
    await ui.press({ key: 'site:3' })
    expect(await altOf(ui)).toMatch(/^Search, Floor 1 of 3: 1 #100 cleared, 2 #101 cleared, 3 #102 open, 4 #103 open/)
    expect((await ui.find({ type: 'Button', key: 'room:#100' }))?.text).toBe('1 #100 ✓')
    await ui.press({ key: 'floor-next' })
    await ui.press({ key: 'floor-next' })
    expect(await altOf(ui)).toBe('Search, Floor 3 of 3: 41 #140 open, 42 #141 open, 43 #142 open, 44 #143 open, 45 #144 open')
    expect(await ui.find({ type: 'Button', key: 'floor-next' })).toBeUndefined()
    await ui.press({ key: 'map-back' })
    expect(await altOf(ui)).toBe('work: 1 Search 2/45')
    await ui.unmount()
  })

  test('the terminal draws a Floor as boxes: lit, dark, and Fog past the last Quest', async ($, on) => {
    world(on, { open: [issue(5), issue(6)], closed: [issue(4)] })
    await $.session.start(START)
    await map($)

    const ui = await $.ui.mount({ ...MAP, surface: 'terminal' })
    await ui.press({ key: 'site:wilds' })
    expect(await texts(ui)).toContain(
      '│▣ 1│──│▢ 2│──│▢ 3│  ░░░░░  ░░░░░',
    )
    await ui.unmount()
  })

  test('only an open Room offers Take Quest; a cleared one does not', async ($, on) => {
    world(on, { open: [issue(5)], closed: [issue(4)] })
    await $.session.start(START)
    await map($)

    const ui = await $.ui.mount({ ...MAP, surface: 'terminal' })
    await ui.press({ key: 'site:wilds' })
    await ui.press({ key: 'room:#4' })
    expect(await ui.find({ type: 'Button', key: 'take-quest' })).toBeUndefined()
    await ui.press({ key: 'room:#5' })
    expect((await ui.find({ type: 'Button', key: 'take-quest' }))?.props.hotkey).toBe('t')
    await ui.unmount()
  })

  test('the Module view lists the top two folder levels, ignores the ignored ones, and names only the discovered', async ($, on) => {
    world(on, { open: [issue(5)], stored: { 'discovered:/work': ['src/engine', '.'] } })
    await $.session.start(START)
    await map($)

    const ui = await $.ui.mount({ ...MAP, surface: 'terminal', props: { ...MAP.props, bodyColumns: 30 } })
    await ui.press({ key: 'map-modules' })
    const shown = await texts(ui)
    // A discovered Module is a row of two runs, the square and the name; one under Fog, one run.
    expect(shown.filter(text => /^▣ \S/.test(text))).toEqual(['▣ .', '▣ src/engine'])
    expect(shown.filter(text => text.startsWith('░'))).toHaveLength(3)
    expect(shown).toContain('2 of 5 Modules discovered')
    for (const fogged of ['src/art', 'docs/adr', 'node_modules', 'typescript', 'dist']) {
      expect(shown.some(text => text.includes(fogged))).toBe(false)
    }
    await ui.unmount()
  })

  test('drawing the overworld keeps the Region Snapshot in the registry', async ($, on) => {
    const { kept, settle } = world(on, {
      open: [issue(5, BILLING), issue(6)],
      closed: [issue(4, BILLING)],
      stored: { 'discovered:/work': ['src'] },
    })
    await $.session.start(START)
    await map($)

    const ui = await $.ui.mount({ ...MAP, surface: 'desktop' })
    await settle()
    await ui.unmount()

    expect(kept.get('regions')).toEqual({
      '/work': {
        id: 'work',
        root: '/work',
        remote: 'https://github.com/majinmarco/claude-quest',
        firstPlayedAt: '2026-10-24T09:00:00.000Z',
        lastPlayedAt: '2026-10-24T09:00:00.000Z',
        snapshot: {
          takenAt: '2026-10-24T09:00:00.000Z',
          dungeons: [{ key: '2', name: 'Billing', total: 2, cleared: 1 }],
          wilds: { total: 1, cleared: 0 },
          modules: { discovered: 1, total: 5 },
        },
      },
    })
  })

  test('another Region is drawn from its Snapshot, dated, with no Take Quest and no Quest Source read', async ($, on) => {
    const { listings } = world(on)
    // The Overview opening the map from a Snapshot: the state it leaves, as
    // the pane keeps it.
    let kept: unknown = {
        target: {
          kind: 'snapshot',
          entry: {
            id: 'old-shop',
            root: '/elsewhere/old-shop',
            remote: null,
            firstPlayedAt: '2026-09-01T10:00:00.000Z',
            lastPlayedAt: '2026-09-02T10:00:00.000Z',
            snapshot: {
              takenAt: '2026-09-02T10:00:00.000Z',
              dungeons: [{ key: 'SHOP-1', name: 'Checkout', total: 3, cleared: 1 }],
              wilds: { total: 0, cleared: 0 },
              modules: { discovered: 2, total: 4 },
            },
          },
        },
        view: 'overworld',
        site: null,
        floor: 0,
        selected: null,
        project: null,
        open: { state: 'loading' },
        closed: {},
      }
    let version = 1
    on('state.get', (_, e, next) => (e.key === 'regionMap' ? { value: { value: kept, version } } : next(e)))
    on('state.set', (_, e, next) => {
      if (e.key !== 'regionMap') {
        return next(e)
      }
      kept = e.value
      version += 1

      return { value: { isSet: true as const, version } }
    })
    await $.session.start(START)
    // The Map view chosen on the tab row, as the Overview leaves it.
    const tabs = await $.ui.mount({ ...MAP, surface: 'terminal' })
    await tabs.press({ key: 'game-tab:map' })
    await tabs.unmount()

    // The state is the test's own here, so each step is drawn afresh.
    const drawn = async (press?: string) => {
      const ui = await $.ui.mount({ ...MAP, surface: 'terminal' })
      if (press !== undefined) {
        await ui.press({ key: press })
        await ui.unmount()

        return drawn()
      }

      return { ui, shown: await texts(ui), keys: await buttons(ui) }
    }
    const overworld = await drawn()
    expect(overworld.shown).toContain('old-shop \u00b7 as of 2026-09-02')
    expect(overworld.keys).toEqual(['map-overworld', 'map-modules', 'site:SHOP-1'])
    await overworld.ui.unmount()
    const dungeon = await drawn('site:SHOP-1')
    expect(dungeon.shown).toContain('1 of 3 Rooms cleared')
    expect(dungeon.keys.some(key => key.startsWith('room:') || key === 'take-quest')).toBe(false)
    await dungeon.ui.unmount()
    const modules = await drawn('map-modules')
    expect(modules.shown).toContain('2 of 4 Modules discovered')
    await modules.ui.unmount()
    expect(listings).toEqual([])
  })
})

// Picking a Quest from a Room: the contract the Quest Board keeps too.
takeQuestContract({
  name: 'Region map',
  open: map,
  take: async $ => {
    const ui = await $.ui.mount({ ...MAP, surface: 'terminal' })
    await ui.press({ key: 'site:wilds' })
    await ui.press({ key: 'room:#5' })
    await ui.press({ key: 'take-quest' })
    await ui.unmount()
  },
})
