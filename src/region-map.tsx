// The Region map pane (`/map`): the Region the Player is in, as an
// overworld of its Dungeons and the Wilds, each opening to Floors of Rooms
// (one per Quest), and the Module view of the project, chosen with numbered
// Buttons under the picture, the selection highlighted in the art. SVG where
// the surface draws it, a character grid in the terminal (src/map-art.ts). A
// Room still open starts its Quest as the Quest Board does (src/take-quest.ts).
// Another Region, opened from the World (the Overview, issue #16), is drawn
// from its Snapshot: dated, with Take Quest hidden and no Quest Source read.
// The pane never opens by itself. Drawing the overworld of the current
// Region keeps its Snapshot in the registry.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderInput } from 'claude-code'

import { floorGrid, floorSvg, hotkeyOf, MAP_COLORS, moduleCells, countedModules, modulesGrid, MODULES_SHOWN, modulesSvg, overworldGrid, overworldSvg } from './map-art'
import type { GridRow, ModuleCell } from './map-art'
import { readRegionFile } from './persistence'
import { regionQuestSource } from './quest-source-setting'
import { clearedOf, floorCount, floorRooms, liveRegion, ROOMS_PER_FLOOR, snapshotOf, snapshotRegion, WILDS_KEY } from './region-model'
import type { RegionModel, Site } from './region-model'
import { writeSnapshot } from './region-registry'
import type { RegionEntry } from './region-registry'
import { takeQuest } from './take-quest'
import { moduleOfFolder } from './translate'
import type { QuestCard, QuestRecord, QuestSourceProblem, RegionMapListing, RegionMapState } from '../types'

/** The pane: its id, which the Overview opens too. */
export const REGION_MAP = { id: 'region-map', title: 'Region map' } as const

/** Which Region the pane draws: the current project, or another from its registry entry. */
export type RegionMapTarget = { kind: 'live' } | { kind: 'snapshot'; entry: RegionEntry }

/** The pane as it starts: the current project, its overworld, nothing read yet. */
const INITIAL: RegionMapState = {
  target: { kind: 'live' },
  view: 'overworld',
  site: null,
  floor: 0,
  selected: null,
  project: null,
  open: { state: 'loading' },
  closed: {},
}

/** The pane's place and what it read, for the session; it survives a reload. */
const regionMap = atom({ plugin: 'quest-mod', key: 'regionMap' } as const, INITIAL)

/** The Snapshot last written this session, by its Region and content: an overworld drawn again unchanged writes none. */
let lastSnapshot = ''

/** The project folder's name, the Region's id: the last segment of its root. */
export const regionIdOf = (root: string): string =>
  root.replace(/\\/g, '/').replace(/\/+$/, '').split('/').pop() || root

/**
 * The project's Modules on disk: its top two folder levels, as Module names
 * (`src/engine`; `src` when `src` holds files itself; `.` for files at the
 * root), the ignored root-level folders (GLOSSARY.md, Module) left out. A
 * folder that cannot be listed adds nothing.
 */
export async function listModules($: EngineInterface, root: string): Promise<string[]> {
  const entries = await $.fs.list(root).catch(() => [])
  const modules = new Set<string>()
  if (entries.some(entry => entry.kind === 'file')) {
    modules.add('.')
  }
  const folders = entries.filter(entry => entry.kind === 'dir' && moduleOfFolder(entry.name) !== null)
  const inside = await Promise.all(folders.map(folder => $.fs.list(`${root}/${folder.name}`).catch(() => [])))
  folders.forEach((folder, at) => {
    const entries = inside[at] ?? []
    if (entries.some(entry => entry.kind === 'file')) {
      modules.add(folder.name)
    }
    for (const entry of entries) {
      if (entry.kind === 'dir') {
        modules.add(`${folder.name}/${entry.name}`)
      }
    }
  })

  return [...modules]
}

const isHistory = (value: unknown): value is QuestRecord[] =>
  Array.isArray(value) && value.every(record => typeof (record as QuestRecord | null)?.ticket === 'string')

/** The Region file history, or none when it cannot be read. */
async function historyOf($: EngineInterface): Promise<QuestRecord[]> {
  const region = await readRegionFile($).catch(() => null)
  const quests = region?.ok === true ? (region.value as { quests?: unknown } | undefined)?.quests : undefined

  return isHistory(quests) ? quests : []
}

/** A Quest Source listing as the pane keeps it. */
const listingOf = (listed: { ok: true; value: QuestCard[] } | { ok: false; problem: QuestSourceProblem }): RegionMapListing =>
  listed.ok ? { state: 'listed', quests: listed.value } : { state: 'unavailable', problem: listed.problem }

/**
 * Reads the current project for the map: its root and remote, its history,
 * its Modules on disk, its open tickets, and its closed ones unless this
 * session already listed them for this Region.
 */
async function readProject($: EngineInterface): Promise<void> {
  const root = await $.session.root().catch(() => null)
  if (root === null) {
    await update($, regionMap, (current): RegionMapState => ({
      ...current,
      project: null,
      open: { state: 'unavailable', problem: { kind: 'none', message: 'This session has no project folder to map.' } },
    }))
    return
  }

  const [repo, history, folders] = await Promise.all([
    $.session.repo().catch(() => null),
    historyOf($),
    listModules($, root),
  ])
  const kept = (await read($, regionMap)).closed[root]
  const listClosed = kept === undefined || kept.state === 'unavailable'
  await update($, regionMap, (current): RegionMapState => ({
    ...current,
    project: { root, id: regionIdOf(root), remote: repo?.remote ?? null, history, folders },
    open: { state: 'loading' },
    ...(listClosed ? { closed: { ...current.closed, [root]: { state: 'loading' } } } : {}),
  }))

  const { source } = await regionQuestSource($)
  const [open, closed] = await Promise.all([source.list(), listClosed ? source.listClosed() : Promise.resolve(null)])
  await update($, regionMap, (current): RegionMapState => ({
    ...current,
    open: listingOf(open),
    ...(closed === null ? {} : { closed: { ...current.closed, [root]: listingOf(closed) } }),
  }))
}

/**
 * Opens the Region map on its overworld: the current project (`live`, as
 * `/map` does), its tickets read again; or another Region from its registry
 * entry (`snapshot`), reading nothing.
 */
export async function openRegionMap($: EngineInterface, target: RegionMapTarget): Promise<void> {
  lastSnapshot = ''
  await update($, regionMap, (current): RegionMapState => ({ ...current, target, view: 'overworld', site: null, floor: 0, selected: null }))
  await $.ui.open(REGION_MAP)
  if (target.kind === 'live') {
    await readProject($)
  }
}

/** What the map buttons do. */
export type RegionMapActions = {
  /** Show the overworld, or the Module view. */
  show: (view: 'overworld' | 'modules') => void
  /** Enter a site: a Dungeon by its key, or the Wilds. */
  enter: (site: string) => void
  /** Show this Floor of the site entered, from 0. */
  floor: (floor: number) => void
  /** Select the Room at this place on the Floor. */
  select: (at: number) => void
  /** Start this Quest, as Take Quest on the Quest Board does. */
  take: (quest: QuestCard) => void
  /** Read the current project again. */
  refresh: () => void
}

function actionsOf($: EngineInterface): RegionMapActions {
  return {
    show: view => {
      void update($, regionMap, (current): RegionMapState => ({ ...current, view }))
    },
    enter: site => {
      void update($, regionMap, (current): RegionMapState => ({ ...current, view: 'dungeon', site, floor: 0, selected: null }))
    },
    floor: floor => {
      void update($, regionMap, (current): RegionMapState => ({ ...current, floor, selected: null }))
    },
    select: at => {
      void update($, regionMap, (current): RegionMapState => ({ ...current, selected: at }))
    },
    take: quest => {
      void takeQuest($, quest).catch(() => undefined)
    },
    refresh: () => {
      void readProject($).catch(() => undefined)
    },
  }
}

/** What the pane draws: the Region (null while it is read), or why it cannot, and where the Player is in it. */
export type RegionMapView = {
  /** The Region id, which seeds the layout, and the name lettered on it (the id, until a theme names it). */
  regionId: string
  regionName: string
  /** The Region; null while it is read, or when `problem` says why it cannot be. */
  region: RegionModel | null
  problem: QuestSourceProblem | null
  /** For another Region, the day its Snapshot was taken (`2026-10-24`); null for the current one. */
  asOf: string | null
  /** A line under the header: why some Rooms may be dark that should not be; null when nothing is amiss. */
  note: string | null
  place: Pick<RegionMapState, 'view' | 'site' | 'floor' | 'selected'>
  /** The Modules the Cartographer charted here, starred in the Module view; none when left out. */
  charted?: readonly string[]
}

/** A Button with its hotkey, when it has one. */
const hotkeyProps = (hotkey: string | undefined): { hotkey?: string } => (hotkey === undefined ? {} : { hotkey })

/** A site in words: its name, Rooms cleared of all. */
const siteLabel = (site: Site): string => `${site.name} ${clearedOf(site)}/${site.rooms.length}`

/**
 * The Region map, drawn for a pane or a panel `width` cells wide: a header,
 * the view buttons, then the view chosen. The overworld numbers each site as
 * its Button does; a Floor numbers its Rooms, and a Room still open starts
 * its Quest with Take Quest, which a Snapshot never shows.
 */
export function drawRegionMap($: EngineInterface, e: RenderInput<'Pane'>, view: RegionMapView, actions: RegionMapActions) {
  const elements = $.ui.resolve(e)
  const { Box, Text, Button } = elements
  // The terminal lists Svg too, as a fragment: it draws no SVG.
  const Svg = e.surface !== 'terminal' && 'Svg' in elements ? elements.Svg : undefined
  const { region, place } = view
  const isLive = view.asOf === null

  // A grid row as one Text, its runs inside it in their colours (a row of one run, that run alone).
  const colorOf = (color: string | undefined) => (color === undefined ? {} : { color })
  const lines = (rows: readonly GridRow[], prefix: string) =>
    rows.map((row, at) => {
      const [only] = row
      if (row.length <= 1) {
        return (
          <Text key={`${prefix}:${at}`} {...colorOf(only?.color)}>
            {only?.text ?? ' '}
          </Text>
        )
      }

      return (
        <Text key={`${prefix}:${at}`}>
          {row.map((run, i) => (
            <Text key={`run:${i}`} {...colorOf(run.color)}>
              {run.text}
            </Text>
          ))}
        </Text>
      )
    })

  const header = (
    <Box flexDirection="column">
      <Text bold color={MAP_COLORS.lit}>
        {view.asOf === null ? view.regionName : `${view.regionName} · as of ${view.asOf}`}
      </Text>
      {view.note !== null && <Text dimColor>{view.note}</Text>}
    </Box>
  )
  const tabs = (
    <Box flexDirection="row" gap={1}>
      <Button key="map-overworld" hotkey="o" {...(place.view === 'modules' ? { dimColor: true } : {})} onPress={() => actions.show('overworld')}>
        Overworld
      </Button>
      <Button key="map-modules" hotkey="m" {...(place.view === 'modules' ? {} : { dimColor: true })} onPress={() => actions.show('modules')}>
        Modules
      </Button>
      {isLive && (
        <Button key="map-refresh" hotkey="r" dimColor onPress={() => actions.refresh()}>
          Refresh
        </Button>
      )}
    </Box>
  )

  if (region === null) {
    return (
      <Box flexDirection="column" gap={1}>
        {header}
        {view.problem === null ? (
          <Text dimColor>Reading the Region…</Text>
        ) : (
          <Box flexDirection="column">
            <Text bold color="red">The Region could not be read.</Text>
            <Text>{view.problem.message}</Text>
          </Box>
        )}
        {tabs}
      </Box>
    )
  }

  if (place.view === 'modules') {
    const cells: ModuleCell[] =
      region.modules === null ? countedModules(region.moduleCounts.discovered, region.moduleCounts.total) : moduleCells(region.modules, view.charted)
    const { discovered, total } = region.moduleCounts
    const more = cells.length - MODULES_SHOWN

    return (
      <Box flexDirection="column" gap={1}>
        {header}
        {tabs}
        {Svg === undefined ? (
          <Box flexDirection="column">{lines(modulesGrid(cells, e.props.bodyColumns), 'module')}</Box>
        ) : (
          <Svg source={modulesSvg(cells, region.moduleCounts)} alt={`Module view: ${discovered} of ${total} Modules discovered`} />
        )}
        <Text dimColor>
          {`${discovered} of ${total} Modules discovered${more > 0 ? ` · ${more} more not shown` : ''}`}
        </Text>
      </Box>
    )
  }

  const entered = place.view === 'dungeon' ? region.sites.find(site => site.key === place.site) : undefined
  if (entered === undefined) {
    const sites = region.sites.map(site => ({ site, isSelected: site.key === place.site }))
    const alt = `${view.regionName}: ${region.sites.map((site, at) => `${at + 1} ${siteLabel(site)}`).join(', ')}`

    return (
      <Box flexDirection="column" gap={1}>
        {header}
        {tabs}
        {Svg === undefined ? (
          <Box flexDirection="column">{lines(overworldGrid(view.regionId, sites), 'land')}</Box>
        ) : (
          <Svg source={overworldSvg(view.regionId, view.regionName, sites)} alt={alt} />
        )}
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {region.sites.map((site, at) => (
            <Button
              key={`site:${site.key === WILDS_KEY ? 'wilds' : site.key}`}
              {...hotkeyProps(hotkeyOf(at))}
              onPress={() => actions.enter(site.key)}
            >
              {`${at + 1} ${siteLabel(site)}`}
            </Button>
          ))}
        </Box>
      </Box>
    )
  }

  const floors = floorCount(entered)
  const floor = Math.min(Math.max(place.floor, 0), floors - 1)
  const rooms = floorRooms(entered, floor)
  const selected = place.selected !== null && place.selected < rooms.length ? place.selected : null
  const room = selected === null ? undefined : rooms[selected]
  const floorView = { site: entered, floor, selected }
  const alt = `${entered.name}, Floor ${floor + 1} of ${floors}: ${rooms
    .map((one, at) => `${floor * ROOMS_PER_FLOOR + at + 1} ${one.quest?.ticket ?? 'Room'} ${one.isCleared ? 'cleared' : 'open'}`)
    .join(', ')}`

  return (
    <Box flexDirection="column" gap={1}>
      {header}
      {tabs}
      {Svg === undefined ? (
        <Box flexDirection="column">{lines(floorGrid(floorView), 'floor')}</Box>
      ) : (
        <Svg source={floorSvg(floorView)} alt={alt} />
      )}
      {isLive && rooms.length > 0 && (
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {rooms.map((one, at) => (
            <Button
              key={`room:${one.quest?.ticket ?? at}`}
              {...hotkeyProps(hotkeyOf(at))}
              {...(one.isCleared ? { dimColor: true } : {})}
              onPress={() => actions.select(at)}
            >
              {`${floor * ROOMS_PER_FLOOR + at + 1} ${one.quest?.ticket ?? ''}${one.isCleared ? ' ✓' : ''}`}
            </Button>
          ))}
        </Box>
      )}
      {!isLive && <Text dimColor>{`${clearedOf(entered)} of ${entered.rooms.length} Rooms cleared`}</Text>}
      {room?.quest != null && (
        <Box flexDirection="row" gap={1}>
          <Text>{`${room.quest.ticket} ${room.quest.title} · ${room.quest.difficulty} · ${room.isCleared ? 'cleared' : 'open'}`}</Text>
          {isLive && !room.isCleared && (
            <Button key="take-quest" variant="primary" hotkey="t" onPress={() => room.quest !== null && actions.take(room.quest)}>
              {`Take Quest ${room.quest.ticket}`}
            </Button>
          )}
        </Box>
      )}
      <Box flexDirection="row" gap={1}>
        {floor > 0 && (
          <Button key="floor-prev" hotkey="p" onPress={() => actions.floor(floor - 1)}>
            ◂ Floor
          </Button>
        )}
        {floors > 1 && <Text dimColor>{`Floor ${floor + 1} of ${floors}`}</Text>}
        {floor < floors - 1 && (
          <Button key="floor-next" hotkey="n" onPress={() => actions.floor(floor + 1)}>
            Floor ▸
          </Button>
        )}
        <Button key="map-back" hotkey="b" onPress={() => actions.show('overworld')}>
          Back
        </Button>
      </Box>
    </Box>
  )
}

/** The day an ISO 8601 timestamp falls on: `2026-10-24`. */
const dayOf = (timestamp: string): string => timestamp.slice(0, 10)

/**
 * The view for the pane state: the current project from what it read (and
 * the Modules discovered, as the game holds them), or another Region from
 * its Snapshot.
 */
export const regionMapView = (state: RegionMapState, discovered: readonly string[]): RegionMapView => {
  const place = { view: state.view, site: state.site, floor: state.floor, selected: state.selected }
  if (state.target.kind === 'snapshot') {
    const { entry } = state.target
    const snapshot = entry.snapshot

    return {
      regionId: entry.id,
      regionName: entry.id,
      region: snapshot === undefined ? null : snapshotRegion(snapshot),
      problem:
        snapshot === undefined
          ? { kind: 'none', message: `No Snapshot of ${entry.id} yet: it is taken when its map is drawn in its project.` }
          : null,
      asOf: dayOf(snapshot?.takenAt ?? entry.lastPlayedAt),
      note: null,
      place,
    }
  }

  const { project, open } = state
  const closed = project === null ? undefined : state.closed[project.root]
  const regionId = project?.id ?? 'Region'
  const base = { regionId, regionName: regionId, asOf: null, place }
  if (open.state === 'unavailable') {
    return { ...base, region: null, problem: open.problem, note: null }
  }
  if (project === null || open.state === 'loading') {
    return { ...base, region: null, problem: null, note: null }
  }

  return {
    ...base,
    region: liveRegion({
      open: open.quests,
      closed: closed?.state === 'listed' ? closed.quests : [],
      history: project.history,
      folders: project.folders,
      discovered,
    }),
    problem: null,
    note:
      closed?.state === 'unavailable'
        ? `Closed tickets could not be listed (${closed.problem.message}): only Quests won here are lit.`
        : closed?.state === 'loading'
          ? 'Reading the closed tickets…'
          : null,
  }
}

/**
 * Draws the Region map pane from its state; drawing the overworld of the
 * current Region, once its closed tickets are read, keeps its Snapshot in
 * the registry (just after the drawing, which may not write; an overworld
 * drawn again unchanged writes nothing).
 */
export async function renderRegionMap(
  $: EngineInterface,
  e: RenderInput<'Pane'>,
  discovered: readonly string[],
  charted: readonly string[] = [],
) {
  const state = await read($, regionMap)
  const view = { ...regionMapView(state, discovered), charted }
  const { project } = state
  const closed = project === null ? undefined : state.closed[project.root]
  if (
    state.target.kind === 'live' &&
    view.place.view === 'overworld' &&
    view.region !== null &&
    project !== null &&
    closed !== undefined &&
    closed.state !== 'loading'
  ) {
    const region = view.region
    const key = JSON.stringify([project.root, snapshotOf(region, '')])
    if (key !== lastSnapshot) {
      lastSnapshot = key
      $.clock.after(0, () => {
        void (async () => {
          const takenAt = new Date(await $.clock.now()).toISOString()
          await writeSnapshot($, project.root, snapshotOf(region, takenAt), { id: project.id, remote: project.remote })
        })().catch(() => undefined)
      })
    }
  }

  return drawRegionMap($, e, view, actionsOf($))
}
