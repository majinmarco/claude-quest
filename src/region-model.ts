// The Region as its map draws it: its Dungeons and the Wilds, each a run of
// Rooms (one per Quest, lit when cleared) cut into Floors, and its Modules,
// lit when discovered. Built from what the game knows of the current project
// (the Quest Source's open and closed tickets, the Region file's history,
// the folders on disk, the Modules discovered), or from a Snapshot of another
// Region, which knows only counts. Pure: no Quest Source, no files.

import type { RegionSnapshot } from './region-registry'
import type { Difficulty, QuestCard, QuestRecord } from '../types'

/** How many Rooms a Floor holds: five across, four down. */
export const ROOMS_PER_FLOOR = 20

/** The key the Wilds go by among a Region's sites, beside its Dungeons' keys. */
export const WILDS_KEY = ''

/** One Room: its Quest (none when drawn from a Snapshot), and whether it is cleared. */
export type Room = {
  /** The ticket's card; null in a Region drawn from its Snapshot. */
  quest: QuestCard | null
  isCleared: boolean
  difficulty: Difficulty
}

/** A Dungeon, or the Wilds (key WILDS_KEY): its Rooms in ticket order. */
export type Site = {
  key: string
  name: string
  kind: 'dungeon' | 'wilds'
  rooms: Room[]
}

/** A Module of the project, and whether the Player has discovered it. */
export type ModuleTile = { name: string; isDiscovered: boolean }

/**
 * The Region as the map draws it: the Wilds first (when it has Quests of no
 * Dungeon, or no Dungeon at all), then its Dungeons by key; its Modules by
 * name, or null when only their counts are known (a Snapshot).
 */
export type RegionModel = {
  sites: Site[]
  modules: ModuleTile[] | null
  moduleCounts: { discovered: number; total: number }
}

/** What the map is drawn from for the current project. */
export type LiveRegion = {
  /** The open tickets, as the Quest Board lists them. */
  open: readonly QuestCard[]
  /** The closed tickets; none when they could not be listed. */
  closed: readonly QuestCard[]
  /** The Region file's history, oldest first. */
  history: readonly QuestRecord[]
  /** The project's Modules on disk (its top two folder levels). */
  folders: readonly string[]
  /** The Modules the Player has discovered here. */
  discovered: readonly string[]
}

const collator = new Intl.Collator('en', { numeric: true })

/** Tickets and keys in their natural order: `#5` before `#12`, `ABC-2` before `ABC-10`. */
export const naturalOrder = (a: string, b: string): number => collator.compare(a, b)

/** The tickets whose latest run in the Region file is `won`. */
export const wonTickets = (history: readonly QuestRecord[]): Set<string> => {
  const latest = new Map<string, QuestRecord['status']>()
  for (const record of history) {
    latest.set(record.ticket, record.status)
  }

  return new Set([...latest].filter(([, status]) => status === 'won').map(([ticket]) => ticket))
}

/**
 * The current Region: each ticket a Room of its Dungeon (the Wilds when it
 * has none), cleared when closed in the Quest Source or won here. A ticket
 * listed both open and closed (it closed between the two listings) is
 * closed.
 */
export const liveRegion = (live: LiveRegion): RegionModel => {
  const won = wonTickets(live.history)
  const closed = new Set(live.closed.map(quest => quest.ticket))
  const cards = new Map<string, QuestCard>()
  for (const quest of [...live.open, ...live.closed]) {
    cards.set(quest.ticket, quest)
  }

  const dungeons = new Map<string, Site>()
  const wilds: Site = { key: WILDS_KEY, name: 'The Wilds', kind: 'wilds', rooms: [] }
  for (const quest of [...cards.values()].sort((a, b) => naturalOrder(a.ticket, b.ticket))) {
    const room: Room = {
      quest,
      isCleared: closed.has(quest.ticket) || won.has(quest.ticket),
      difficulty: quest.difficulty,
    }
    if (quest.dungeon === undefined) {
      wilds.rooms.push(room)
      continue
    }
    const site = dungeons.get(quest.dungeon.key) ?? {
      key: quest.dungeon.key,
      name: quest.dungeon.name,
      kind: 'dungeon' as const,
      rooms: [],
    }
    site.rooms.push(room)
    dungeons.set(quest.dungeon.key, site)
  }

  const modules = modulesOf(live.folders, live.discovered)

  return {
    sites: sitesInOrder(wilds, [...dungeons.values()]),
    modules,
    moduleCounts: { discovered: modules.filter(module => module.isDiscovered).length, total: modules.length },
  }
}

/** The Wilds first when it holds a Quest or the Region has no Dungeon, then the Dungeons by key. */
const sitesInOrder = (wilds: Site, dungeons: Site[]): Site[] => [
  ...(wilds.rooms.length > 0 || dungeons.length === 0 ? [wilds] : []),
  ...dungeons.sort((a, b) => naturalOrder(a.key, b.key)),
]

/**
 * Every Module on disk and every one discovered (a folder since gone is
 * still on the map), by name, each lit when discovered.
 */
export const modulesOf = (folders: readonly string[], discovered: readonly string[]): ModuleTile[] => {
  const found = new Set(discovered)

  return [...new Set([...folders, ...discovered])]
    .sort(naturalOrder)
    .map(name => ({ name, isDiscovered: found.has(name) }))
}

/** Rooms known only by count: the first `cleared` lit, the rest dark. */
const countedRooms = (total: number, cleared: number): Room[] =>
  Array.from({ length: Math.max(total, 0) }, (_, at) => ({ quest: null, isCleared: at < cleared, difficulty: 'Unrated' }))

/** Another Region, from its Snapshot: its sites and its Modules by count alone. */
export const snapshotRegion = (snapshot: RegionSnapshot): RegionModel => {
  const wilds: Site = {
    key: WILDS_KEY,
    name: 'The Wilds',
    kind: 'wilds',
    rooms: countedRooms(snapshot.wilds.total, snapshot.wilds.cleared),
  }
  const dungeons = snapshot.dungeons.map(
    (dungeon): Site => ({
      key: dungeon.key,
      name: dungeon.name,
      kind: 'dungeon',
      rooms: countedRooms(dungeon.total, dungeon.cleared),
    }),
  )

  return { sites: sitesInOrder(wilds, dungeons), modules: null, moduleCounts: { ...snapshot.modules } }
}

/** What the World remembers of the Region, taken at `takenAt` (an ISO 8601 timestamp). */
export const snapshotOf = (region: RegionModel, takenAt: string): RegionSnapshot => {
  const wilds = region.sites.find(site => site.kind === 'wilds')

  return {
    takenAt,
    dungeons: region.sites
      .filter(site => site.kind === 'dungeon')
      .map(site => ({ key: site.key, name: site.name, total: site.rooms.length, cleared: clearedOf(site) })),
    wilds: { total: wilds?.rooms.length ?? 0, cleared: wilds === undefined ? 0 : clearedOf(wilds) },
    modules: { ...region.moduleCounts },
  }
}

/** How many Rooms of a site are cleared. */
export const clearedOf = (site: Site): number => site.rooms.filter(room => room.isCleared).length

/** Whether a site is cleared: it has Rooms, every one lit. */
export const isSiteCleared = (site: Site): boolean => site.rooms.length > 0 && clearedOf(site) === site.rooms.length

/** How many Floors a site has: one at least, even with no Rooms. */
export const floorCount = (site: Site): number => Math.max(Math.ceil(site.rooms.length / ROOMS_PER_FLOOR), 1)

/** The Rooms of Floor `floor` (from 0), up to twenty. */
export const floorRooms = (site: Site, floor: number): Room[] =>
  site.rooms.slice(floor * ROOMS_PER_FLOOR, (floor + 1) * ROOMS_PER_FLOOR)
