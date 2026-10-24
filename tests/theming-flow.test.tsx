// Haiku theming (issue #17) as the session plays it, with a mocked model: a
// Region with no theme asks for one when its map or its Island is first
// drawn, once; a Dungeon asks when its Floors are first drawn, once, its
// theme kept on the Snapshot; replies breaking the contract are discarded
// and the defaults drawn; Haiku unavailable this session asks nothing.

import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { FsEntry, On, ProcessRunResult } from 'claude-code'

import type { RegionEntry } from '../src/region-registry'
import { writeNewFile } from './fixtures/file-changes'
import { HERE, THREE_REGIONS } from './fixtures/world-regions'

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

const MAP = pane('region-map', 'Region map')
const OVERVIEW = pane('overview', 'Overview')

const ROOT = '/work/forge'
const START = { cwd: ROOT, surface: 'desktop', isInteractive: true } as const

const USAGE = { input_tokens: 300, output_tokens: 40, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const ran = (exitCode: number, stdout: string, stderr = ''): ProcessRunResult => ({
  exitCode,
  stdout,
  stderr,
  isStdoutTruncated: false,
  isStderrTruncated: false,
})

const file = (name: string, size = 1): FsEntry => ({ name, kind: 'file', size, mtimeMs: 1, isLink: false })
const dir = (name: string): FsEntry => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })

/** The README of /work/forge: Markdown, longer than Haiku is shown. */
const README = `# Forge\n\nA **forge** for [user profiles](https://example.com): cards, avatars and badges.\n\n${'lorem ipsum '.repeat(200)}`

const BILLING = { number: 2, title: 'Billing' }

const issue = (number: number, milestone: { number: number; title: string } | null = null) => ({
  number,
  title: `Quest ${number}`,
  url: `https://github.com/majinmarco/forge/issues/${number}`,
  labels: [],
  milestone: milestone === null ? null : { ...milestone, description: '', dueOn: null },
})

/** A model reply as `$.model.complete` resolves it. */
const answered = (reply: unknown) => ({ isAnswered: true as const, text: typeof reply === 'string' ? reply : JSON.stringify(reply), usage: USAGE })

/** An API error as `$.model.complete` resolves it. */
const apiError = (status: number, error: string) => ({ isAnswered: false as const, reason: 'api-error' as const, status, error, usage: USAGE })

type Reply = ReturnType<typeof answered> | ReturnType<typeof apiError>

/**
 * The session around the mod: its store, the project at /work/forge (a
 * README at its root), gh listing its issues, and a fake Haiku answering
 * Region themes, Dungeon themes and the Sage each with its own reply.
 * Records what each was asked.
 */
const engine = (
  on: On,
  {
    open = [] as unknown[],
    closed = [] as unknown[],
    stored = {} as Record<string, unknown>,
    region = answered({ name: 'Emberforge Vale', biome: 'forest' }) as Reply,
    dungeon = answered({ name: 'The Gilded Vault', kind: 'library' }) as Reply,
    sage = answered({}) as Reply,
    root = ROOT,
  } = {},
) => {
  const kept = new Map(Object.entries(stored))
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 24, 9, 0) })
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  on('store.set', (_, e) => {
    kept.set(e.key, e.value)

    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...kept.keys()] }))
  on('session.root', () => ({ value: root }))
  on('session.repo', () => ({ value: { root: ROOT, remote: 'https://ghp_secret@github.com/majinmarco/forge.git', internal: false, name: null } }))
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('command.run', () => ({}))
  on('fs.exists', () => ({ value: false }))
  on('fs.write', () => ({ value: undefined }))
  on('fs.list', (_, e) => ({ value: e.path === ROOT ? [file('README.md', README.length), dir('src')] : [] }))
  on('fs.read', (_, e) => ({ value: e.path === `${ROOT}/README.md` ? README : '' }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('process.run', (_, e) => {
    const state = e.argv[e.argv.indexOf('--state') + 1] ?? ''

    return { value: e.argv[0] === 'gh' ? ran(0, JSON.stringify(state === 'closed' ? closed : open)) : ran(0, '') }
  })
  const asked = { region: [] as string[], dungeon: [] as string[], sage: [] as string[] }
  on('model.complete', (_, e) => {
    const system = e.system ?? ''
    const purpose = system.includes('Region of the World') ? 'region' : system.includes('is a Dungeon') ? 'dungeon' : 'sage'
    asked[purpose].push(typeof e.prompt === 'string' ? e.prompt : JSON.stringify(e.prompt))

    return { value: (purpose === 'region' ? region : purpose === 'dungeon' ? dungeon : sage) as never }
  })
  const answers = new Map<string, unknown>()
  on('tool.call', (_, e) => answers.get(e.tool_use_id ?? '') as never)

  return {
    asked,
    clock,
    regions: () => kept.get('regions') as Record<string, RegionEntry> | undefined,
    /** Plays a recorded tool call, and lets whatever it started finish. */
    call: async ($: Engine, recorded: { input: { tool_use_id: string }; result: unknown }) => {
      answers.set(recorded.input.tool_use_id, recorded.result)
      await $.tool.call(recorded.input as never)
      await clock.advance(5_000)
    },
  }
}

/** Runs `/<command>` as the Player types it. */
const run = ($: Engine, command: string) =>
  $.command.run({ command, args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } })

type Drawn = {
  findAll: (query: { type: string }) => Promise<{ key: string | undefined; text: string; props: Record<string, unknown> }[]>
}

const texts = async (ui: Drawn) => (await ui.findAll({ type: 'Text' })).map(found => found.text)
const svgs = async (ui: Drawn) => (await ui.findAll({ type: 'Svg' })).map(found => found.props)
const buttonTexts = async (ui: Drawn, prefix: string) =>
  (await ui.findAll({ type: 'Button' })).filter(found => found.key?.startsWith(prefix)).map(found => found.text)

/** Opens the map, draws it once on the desktop, and lets what the drawing started finish. */
const drawMap = async ($: Engine, clock: { settle: () => Promise<void> }, press: string[] = []) => {
  await run($, 'map')
  const ui = await $.ui.mount({ ...MAP, surface: 'desktop' })
  for (const key of press) {
    await clock.settle()
    await ui.press({ key })
  }
  await clock.settle()
  await clock.settle()
  const drawn = { texts: await texts(ui), svgs: await svgs(ui), sites: await buttonTexts(ui, 'site:') }
  await ui.unmount()

  return drawn
}

describe('Haiku theming: a Region', () => {
  test('a Region with no theme asks once when its map is first drawn: shown data, kept on its entry', async ($, on) => {
    const { asked, clock, regions } = engine(on)
    await $.session.start(START)

    const drawn = await drawMap($, clock)

    expect(asked.region).toHaveLength(1)
    // The pane open as the theme is kept is drawn again with it.
    expect(drawn.texts.slice(0, 2)).toEqual(['Emberforge Vale', 'forge'])
    const [prompt] = asked.region
    expect(prompt).toContain('<data>')
    expect(prompt).toContain('Folder: forge')
    // The remote as owner/repo: never its credentials.
    expect(prompt).toContain('Remote: majinmarco/forge')
    expect(prompt).not.toContain('ghp_secret')
    // The README as plain text, its first 1500 characters.
    expect(prompt).toContain('README:\nForge A forge for user profiles: cards, avatars and badges.')
    expect(prompt?.split('README:\n')[1]?.split('\n</data>')[0]).toHaveLength(1500)
    expect(regions()?.[ROOT]?.theme).toEqual({ name: 'Emberforge Vale', biome: 'forest', themedAt: '2026-10-24T09:00:00.000Z' })
  })

  test('a second draw asks nothing; it shows the themed name with the folder name beside it, in the biome', async ($, on) => {
    const { asked, clock } = engine(on)
    await $.session.start(START)
    await drawMap($, clock)

    const again = await drawMap($, clock)

    expect(asked.region).toHaveLength(1)
    expect(again.texts.slice(0, 2)).toEqual(['Emberforge Vale', 'forge'])
    expect(String(again.svgs[0]?.alt)).toMatch(/^Emberforge Vale: 1 The Wilds/)
    // The forest's grass, not the meadow's.
    expect(String(again.svgs[0]?.source)).toContain('#5a9e4b')
  })

  test('a Region already themed (a second session) asks nothing', async ($, on) => {
    const theme = { name: 'Old Forge', biome: 'snow' as const, themedAt: '2026-10-01T09:00:00.000Z' }
    const entry: RegionEntry = { id: 'forge', root: ROOT, remote: null, firstPlayedAt: '2026-10-01T09:00:00.000Z', lastPlayedAt: '2026-10-01T09:00:00.000Z', theme }
    const { asked, clock, regions } = engine(on, { stored: { regions: { [ROOT]: entry } } })
    await $.session.start(START)

    const drawn = await drawMap($, clock)
    await $.session.start(START)
    await drawMap($, clock)

    expect(asked.region).toEqual([])
    expect(drawn.texts.slice(0, 2)).toEqual(['Old Forge', 'forge'])
    expect(regions()?.[ROOT]?.theme).toEqual(theme)
  })

  for (const [what, reply] of [
    ['not JSON', answered('A forest, surely.')],
    ['a biome outside the list', answered({ name: 'Emberforge', biome: 'volcano' })],
    ['an empty name', answered({ name: '  ', biome: 'forest' })],
    ['a name too long', answered({ name: 'The Very Long And Winding Valley Of Forges', biome: 'forest' })],
    ['an error', apiError(500, 'api_error')],
  ] as const) {
    test(`a reply with ${what} is discarded: the folder name and the meadow are drawn, and it is not asked again this session`, async ($, on) => {
      const { asked, clock, regions } = engine(on, { region: reply })
      await $.session.start(START)

      await drawMap($, clock)
      const again = await drawMap($, clock)

      expect(asked.region).toHaveLength(1)
      expect(regions()?.[ROOT]?.theme).toBeUndefined()
      expect(again.texts[0]).toBe('forge')
      expect(String(again.svgs[0]?.source)).not.toContain('#5a9e4b')
    })
  }

  test('with Haiku unavailable this session no theme is asked', async ($, on) => {
    const { asked, clock, call } = engine(on, { sage: apiError(401, 'authentication_failed') })
    await $.session.start(START)
    // The Sage finds Haiku unavailable on the account.
    await call($, writeNewFile)
    expect(asked.sage).toHaveLength(1)

    await drawMap($, clock)

    expect(asked.region).toEqual([])
  })

  test('the Overview asks once for each Island with no theme, and shows themed names with the real ones beside them', async ($, on) => {
    const { asked, clock, regions } = engine(on, { stored: { regions: THREE_REGIONS }, root: HERE })
    await $.session.start({ ...START, cwd: HERE })
    await run($, 'overview')

    const ui = await $.ui.mount({ ...OVERVIEW, surface: 'desktop' })
    await clock.settle()
    await clock.settle()
    await ui.unmount()
    const again = await $.ui.mount({ ...OVERVIEW, surface: 'desktop' })
    await clock.settle()
    const islands = await buttonTexts(again, 'island:')
    await again.unmount()

    expect(asked.region).toHaveLength(3)
    expect(asked.region.map(prompt => prompt.split('\n')[2])).toEqual(['Folder: claude-quest', 'Folder: vault', 'Folder: vault'])
    expect(Object.values(regions() ?? {}).every(entry => entry.theme?.name === 'Emberforge Vale')).toBe(true)
    expect(islands[0]).toBe('1 Emberforge Vale (claude-quest) · you are here · 5/12 cleared')
    expect(islands[1]).toBe('2 Emberforge Vale (vault (majinmarco/vault)) · 6/6 cleared')
  })
})

describe('Haiku theming: a Dungeon', () => {
  const billing = { open: [issue(5, BILLING), issue(6, BILLING), issue(7)], closed: [issue(4, BILLING)] }

  test('a Dungeon asks once when its Floors are first drawn, from its name and tickets', async ($, on) => {
    const { asked, clock, regions } = engine(on, billing)
    await $.session.start(START)

    await drawMap($, clock, ['site:2'])
    await drawMap($, clock, ['site:2'])

    expect(asked.dungeon).toHaveLength(1)
    const [prompt] = asked.dungeon
    expect(prompt).toContain('<data>')
    expect(prompt).toContain('Dungeon: Billing')
    expect(prompt).toContain('Tickets:\n- Quest 4\n- Quest 5\n- Quest 6')
    expect(prompt).not.toContain('Quest 7')
    expect(regions()?.[ROOT]?.snapshot?.dungeons).toEqual([
      { key: '2', name: 'Billing', total: 3, cleared: 1, theme: { name: 'The Gilded Vault', kind: 'library', themedAt: '2026-10-24T09:00:00.000Z' } },
    ])
  })

  test('a themed Dungeon is drawn in its kind, by its themed name with its own beside it; the overworld shows both', async ($, on) => {
    const { clock } = engine(on, billing)
    await $.session.start(START)
    await drawMap($, clock, ['site:2'])

    const floor = await drawMap($, clock, ['site:2'])
    const overworld = await drawMap($, clock)

    expect(String(floor.svgs[0]?.alt)).toMatch(/^The Gilded Vault \(Billing\), Floor 1 of 1/)
    expect(floor.texts).toContain('Billing')
    // The library's red floors, not the crypt's.
    expect(String(floor.svgs[0]?.source)).toContain('#9e3438')
    expect(overworld.sites).toContain('2 The Gilded Vault (Billing) 1/3')
  })

  test('the Snapshot taken again when the map is drawn keeps the theme of the Dungeon', async ($, on) => {
    const { clock, regions } = engine(on, billing)
    await $.session.start(START)
    await drawMap($, clock, ['site:2'])
    const themed = regions()?.[ROOT]?.snapshot?.dungeons[0]?.theme
    expect(themed?.name).toBe('The Gilded Vault')

    // Opening the map again takes the Snapshot again, knowing no themes.
    await clock.advance(60_000)
    await drawMap($, clock)

    expect(regions()?.[ROOT]?.snapshot?.takenAt).toBe('2026-10-24T09:01:00.000Z')
    expect(regions()?.[ROOT]?.snapshot?.dungeons[0]?.theme).toEqual(themed)
  })

  test('a Dungeon reply outside the kinds is discarded: its own name and the crypt are drawn', async ($, on) => {
    const { asked, clock, regions } = engine(on, { ...billing, dungeon: answered({ name: 'The Gilded Vault', kind: 'volcano' }) })
    await $.session.start(START)

    await drawMap($, clock, ['site:2'])
    const floor = await drawMap($, clock, ['site:2'])

    expect(asked.dungeon).toHaveLength(1)
    expect(regions()?.[ROOT]?.snapshot?.dungeons[0]?.theme).toBeUndefined()
    expect(String(floor.svgs[0]?.alt)).toMatch(/^Billing, Floor 1 of 1/)
    expect(String(floor.svgs[0]?.source)).not.toContain('#9e3438')
  })

  test('the Wilds ask for no theme', async ($, on) => {
    const { asked, clock } = engine(on, billing)
    await $.session.start(START)

    await drawMap($, clock, ['site:wilds'])

    expect(asked.dungeon).toEqual([])
  })
})
