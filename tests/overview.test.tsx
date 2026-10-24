// The Overview pane (`/overview`): the character sheet above the World, a
// Button per Island opening its Region's map; and the registry of Regions the
// mod keeps for it, at session start and Quest close.

import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { RegionEntry } from '../src/region-registry'
import { commitAfterAdd, GIT_SHOW_DEPOSIT } from './fixtures/git-commits'
import { HERE, snapshotOf, THREE_REGIONS } from './fixtures/world-regions'

const pane = (requestId: string, title: string) =>
  ({
    plugin: 'quest-mod',
    component: 'Pane',
    requestId,
    props: {
      title,
      isFocused: true,
      bodyColumns: 80,
      placement: 'dock',
      scroll: { offset: 0, bodyRows: 60 },
      view: {},
    },
  }) as const

const OVERVIEW = pane('overview', 'Overview')
const REGION_MAP = pane('region-map', 'Region map')

const NOW = Date.UTC(2026, 9, 24, 12, 0)

const SCHOLAR = {
  level: 4,
  xp: 10,
  totalXp: 560,
  hp: 100,
  maxHp: 100,
  stats: { intelligence: 300, wisdom: 40, dexterity: 0, strength: 60, charisma: 0, constitution: 0 },
  tally: { questsClosed: 2, bossesWon: 1, bossStreak: 1, sageRight: 6, modulesDiscovered: 9, regions: ['claude-quest'] },
  badges: [{ id: 'first-quest', name: 'Questbound' }],
  trophies: [{ name: 'Bane of claude-quest#12', region: 'claude-quest', ticket: '#12', earnedAt: 1 }],
}

/**
 * Answers the engine's side of the mod: its store (with its keys), the
 * session's root and repo, its files, git answering `git show`, its panes.
 */
const engine = (
  on: On,
  { stored = {} as Record<string, unknown>, root = '/work/vault', remote = 'git@github.com:acme/vault.git' as string | null } = {},
) => {
  const kept = new Map(Object.entries(stored))
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_, e) => {
    kept.set(e.key, e.value)

    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...kept.keys()] }))
  on('session.root', () => ({ value: root }))
  on('session.repo', () => ({ value: remote === null ? null : { root, remote, internal: false, name: null } }))
  const files = new Map<string, string>()
  on('fs.exists', (_, e) => ({ value: files.has(e.path) }))
  on('fs.read', (_, e) => ({ value: files.get(e.path) ?? '' }))
  on('fs.write', (_, e) => {
    files.set(e.path, e.text)

    return { value: undefined }
  })
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('command.run', () => ({}))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  const opened: string[] = []
  on('ui.open', (_, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true } }
  })
  on('process.run', (_, e) => ({
    value:
      e.argv[0] === 'gh'
        ? { exitCode: 1, stdout: '', stderr: 'offline\n', isStdoutTruncated: false, isStderrTruncated: false }
        : { exitCode: 0, stdout: GIT_SHOW_DEPOSIT, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  const clock = mock.clock(on, { now: NOW })

  return { kept, opened, clock, regions: () => kept.get('regions') as Record<string, RegionEntry> | undefined }
}

/** Runs `/<command> <args>` as the person types it. */
const run = ($: Engine, command: string, args = '') =>
  $.command.run({
    command,
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })

const START = (cwd: string) => ({ cwd, surface: 'terminal', isInteractive: true }) as const

type Drawn = {
  findAll: (query: { type: string }) => Promise<{ key: string | undefined; text: string; props: Record<string, unknown> }[]>
}

const textsOf = async (ui: Drawn) => (await ui.findAll({ type: 'Text' })).map(found => found.text)

const islandButtons = async (ui: Drawn) =>
  (await ui.findAll({ type: 'Button' })).filter(found => found.key?.startsWith('island:'))

describe('The registry of Regions', () => {
  test('a session start puts its project on the World, its remote kept; the next session touches it', async ($, on) => {
    const { regions, clock } = engine(on)
    await $.session.start(START('/work/vault'))

    expect(regions()).toEqual({
      '/work/vault': {
        id: 'vault',
        root: '/work/vault',
        remote: 'git@github.com:acme/vault.git',
        firstPlayedAt: '2026-10-24T12:00:00.000Z',
        lastPlayedAt: '2026-10-24T12:00:00.000Z',
      },
    })

    await clock.advance(60_000)
    await $.session.start(START('/work/vault'))
    expect(regions()?.['/work/vault']).toMatchObject({ firstPlayedAt: '2026-10-24T12:00:00.000Z', lastPlayedAt: '2026-10-24T12:01:00.000Z' })
  })

  test('a Player who played before the registry is seeded once, from their tally and the Modules they discovered', async ($, on) => {
    const { regions, kept } = engine(on, {
      stored: {
        player: { ...SCHOLAR, tally: { ...SCHOLAR.tally, regions: ['older', 'gone'] } },
        'discovered:/work/older': ['src'],
      },
    })
    await $.session.start(START('/work/vault'))

    expect(Object.keys(regions() ?? {})).toEqual(['/work/older', '/work/vault', 'name:gone'])
    expect(regions()?.['/work/older']).toEqual({
      id: 'older',
      root: '/work/older',
      remote: null,
      firstPlayedAt: '2026-10-24T12:00:00.000Z',
      lastPlayedAt: '2026-10-24T12:00:00.000Z',
    })
    expect(regions()?.['name:gone']).toMatchObject({ id: 'gone', root: '' })

    // Seeded once: a Region forgotten from the registry stays forgotten.
    const { ['name:gone']: _gone, ...rest } = regions() ?? {}
    kept.set('regions', rest)
    await $.session.start(START('/work/vault'))
    expect(Object.keys(regions() ?? {})).toEqual(['/work/older', '/work/vault'])
  })

  test('a Quest closing touches its Region', { options: { bossFightCallsPerQuest: 0 } }, async ($, on) => {
    const { regions, clock } = engine(on)
    on('tool.call', () => commitAfterAdd.result as never)
    await $.session.start(START('/work/vault'))
    await clock.advance(30 * 60_000)

    await run($, 'mattpocock-skills:implement', '#12')
    // The commit summons no boss (its budget is 0): the Quest closes unfought.
    await $.tool.call(commitAfterAdd.input as never)
    await clock.advance(10_000)

    expect(regions()?.['/work/vault']?.lastPlayedAt).toBe('2026-10-24T12:30:00.000Z')
  })
})

describe('The Overview', () => {
  test('/overview opens the pane; on the desktop the sheet stands beside the portrait, above the World', async ($, on) => {
    const { opened } = engine(on, { stored: { player: SCHOLAR, regions: THREE_REGIONS }, root: HERE, remote: 'git@github.com:majinmarco/claude-quest.git' })
    await $.session.start(START(HERE))

    expect((await run($, 'overview')).text).toBe('Overview opened.')
    expect(opened).toContain('overview')

    const ui = await $.ui.mount({ ...OVERVIEW, surface: 'desktop' })
    const art = (await ui.findAll({ type: 'Svg' })).map(found => found.props)
    expect(art[0]).toMatchObject({ alt: 'Portrait: Scholar', width: 80 })
    expect(String(art[1]?.alt)).toBe(
      'World: 1 claude-quest (medium, you are here · 5/12 cleared); 2 vault (majinmarco/vault) (small, 6/6 cleared); 3 vault (acme/vault) (small, not mapped yet)',
    )
    const texts = await textsOf(ui)
    expect(texts).toContain('Lv 4 Scholar · 560 XP lifetime')
    expect(texts).toContain('XP 10/550 to Lv 5 ▱▱▱▱▱▱▱▱▱▱')
    expect(texts).toContain('  claude-quest: #12')
    const dex = await ui.find({ type: 'Text', text: '  DEX Dexterity 0 · not yet in play' })
    expect(dex?.props.dimColor).toBe(true)
    expect((await ui.find({ type: 'Text', text: '  INT Intelligence 300' }))?.props.dimColor).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: '  ☆ Flawless' }))?.props.dimColor).toBe(true)
    expect((await ui.find({ type: 'Text', text: '  ★ Questbound' }))?.props.dimColor).toBeUndefined()

    expect((await islandButtons(ui)).map(button => [button.key, button.props.hotkey, button.text])).toEqual([
      [`island:${HERE}`, '1', '1 claude-quest · you are here · 5/12 cleared'],
      ['island:/home/player/vault', '2', '2 vault (majinmarco/vault) · 6/6 cleared'],
      ['island:/home/player/clients/vault', '3', '3 vault (acme/vault) · not mapped yet'],
    ])
    await ui.unmount()
  })

  test('in the terminal the sheet is text and the World a grid of Islands, with the same Buttons', async ($, on) => {
    engine(on, { stored: { player: SCHOLAR, regions: THREE_REGIONS }, root: HERE })
    await $.session.start(START(HERE))
    await run($, 'overview')

    const ui = await $.ui.mount({ ...OVERVIEW, surface: 'terminal' })
    expect(await ui.findAll({ type: 'Svg' })).toEqual([])
    const texts = await textsOf(ui)
    expect(texts).toContain('  DEX Dexterity 0 · not yet in play')
    expect(texts.filter(text => text.includes('◉'))).toHaveLength(2)
    expect(texts.some(text => text.includes('▓') && text.includes('░'))).toBe(true)
    expect(texts.some(text => text.includes('not mapped yet'))).toBe(true)
    expect((await islandButtons(ui)).map(button => button.key)).toEqual([
      `island:${HERE}`,
      'island:/home/player/vault',
      'island:/home/player/clients/vault',
    ])
    await ui.unmount()
  })

  test("the session's Island opens the live Region map; another's opens its Snapshot, dated", async ($, on) => {
    const { opened } = engine(on, { stored: { player: SCHOLAR, regions: THREE_REGIONS }, root: HERE })
    await $.session.start(START(HERE))
    await run($, 'overview')
    const ui = await $.ui.mount({ ...OVERVIEW, surface: 'terminal' })

    await ui.press({ key: 'island:/home/player/vault' })
    expect(opened).toContain('region-map')
    let map = await $.ui.mount({ ...REGION_MAP, surface: 'terminal' })
    expect(await textsOf(map)).toEqual(['Region map: not drawn yet', 'Region: vault', 'as of 2026-10-20'])
    await map.unmount()

    await ui.press({ key: `island:${HERE}` })
    map = await $.ui.mount({ ...REGION_MAP, surface: 'terminal' })
    expect(await textsOf(map)).toEqual(['Region map: not drawn yet', 'Region: claude-quest'])
    await map.unmount()
    await ui.unmount()
  })

  test('past nine Islands the Buttons are paged, each page numbered 1 to 9 by hotkey', async ($, on) => {
    const regions = Object.fromEntries(
      Array.from({ length: 11 }, (_, at) => {
        const root = `/w/project-${at + 1}`
        const entry: RegionEntry = {
          id: `project-${at + 1}`,
          root,
          remote: null,
          firstPlayedAt: `2026-10-${String(at + 1).padStart(2, '0')}T00:00:00.000Z`,
          lastPlayedAt: `2026-10-${String(at + 1).padStart(2, '0')}T00:00:00.000Z`,
          snapshot: snapshotOf([[5, 1]]),
        }
        return [root, entry]
      }),
    )
    engine(on, { stored: { player: SCHOLAR, regions }, root: '/w/project-1' })
    await $.session.start(START('/w/project-1'))
    await run($, 'overview')
    const ui = await $.ui.mount({ ...OVERVIEW, surface: 'desktop' })

    const first = await islandButtons(ui)
    expect(first).toHaveLength(9)
    expect(first.map(button => button.props.hotkey)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9'])

    await ui.press({ key: 'islands-next' })
    const second = await islandButtons(ui)
    expect(second.map(button => [button.text, button.props.hotkey])).toEqual([
      ['10 project-10 · 1/5 cleared', '1'],
      ['11 project-11 · 1/5 cleared', '2'],
    ])
    expect(await ui.find({ type: 'Text', text: 'Page 2 of 2' })).toBeDefined()
    await ui.unmount()
  })
})
