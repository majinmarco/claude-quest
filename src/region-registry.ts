// The registry of Regions: every project the Player has played, kept in
// `$.store` under `regions` by the project's root, each with the Snapshot the
// World draws its Island from. A session start creates or touches its
// Region; a Quest closing touches it again and lights what it cleared; the
// Region map replaces the Snapshot whenever it draws (writeSnapshot). Players
// who played before the registry are seeded once, from the Modules they
// discovered per project (`discovered:<root>`) and the Regions of their
// tally. A Snapshot holds names and counts only, never tickets, and the
// registry stays a small share of the store's 4 MiB.

import type { EngineInterface } from 'claude-code'

import type { RegionEntry, RegionSnapshot, Tally } from '../types'
import { discoveredKey } from './persistence'

// The registry's types are the contract's (types/index.d.ts): a Snapshot
// (`takenAt`, `dungeons` by key and name with their counts, `wilds`,
// `modules`) and an entry (`id`, `root`, `remote`, `firstPlayedAt`,
// `lastPlayedAt`, `snapshot?`).
export type { RegionEntry, RegionSnapshot } from '../types'

/** The `$.store` key of the registry: `Record<rootPath, RegionEntry>`. */
export const REGIONS_KEY = 'regions'

/** The most Dungeons a Snapshot keeps. */
export const MAX_DUNGEONS = 64

/** The most characters a Dungeon's name or key keeps. */
export const MAX_NAME_CHARS = 80

/** The most JSON text the registry takes in the store: an eighth of its 4 MiB. */
export const MAX_REGISTRY_CHARS = 512 * 1024

/** The key prefix of a Region seeded by name alone, its root not known. */
const NAME_ONLY = 'name:'

/** The store key prefix of the Modules discovered per project. */
const DISCOVERED = 'discovered:'

/** A Region's id: its root's folder name. */
export const regionIdOf = (root: string): string => root.split(/[\\/]/).filter(Boolean).pop() ?? root

/** The registry's key for `root`: as the discovered Modules key it, slashes forward, no trailing one. */
export const rootKeyOf = (root: string): string => discoveredKey(root).slice(DISCOVERED.length)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isEntry = (value: unknown): value is RegionEntry =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.root === 'string' &&
  (value.remote === null || typeof value.remote === 'string') &&
  typeof value.firstPlayedAt === 'string' &&
  typeof value.lastPlayedAt === 'string'

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0

/** A pair of counts, `cleared` never past `total`. */
const share = (total: unknown, cleared: unknown): { total: number; cleared: number } => {
  const all = count(total)

  return { total: all, cleared: Math.min(count(cleared), all) }
}

/** A Snapshot as the registry keeps it: names cut, Dungeons bounded, counts whole, nothing else. */
const cleanSnapshot = (snapshot: RegionSnapshot): RegionSnapshot => {
  const dungeons = Array.isArray(snapshot.dungeons) ? snapshot.dungeons : []
  const modules: Record<string, unknown> = isRecord(snapshot.modules) ? snapshot.modules : {}
  const wilds: Record<string, unknown> = isRecord(snapshot.wilds) ? snapshot.wilds : {}
  const counted = share(modules.total, modules.discovered)

  return {
    takenAt: String(snapshot.takenAt),
    dungeons: dungeons.slice(0, MAX_DUNGEONS).map(dungeon => ({
      key: String(dungeon.key).slice(0, MAX_NAME_CHARS),
      name: String(dungeon.name).slice(0, MAX_NAME_CHARS),
      ...share(dungeon.total, dungeon.cleared),
    })),
    wilds: share(wilds.total, wilds.cleared),
    modules: { discovered: counted.cleared, total: counted.total },
  }
}

/** `regions` with the entry under `from` moved to `to`, in its place, so the order of the rest holds. */
const rekeyed = (
  regions: Record<string, RegionEntry>,
  from: string,
  to: string,
  entry: RegionEntry,
): Record<string, RegionEntry> =>
  Object.fromEntries(Object.entries(regions).map(([key, kept]) => (key === from ? [to, entry] : [key, kept])))

/**
 * The registry once a session started at `root`: its Region touched (last
 * played now, the remote read now kept when there is one), or created, first
 * and last played now. A Region seeded by name alone with the same id takes
 * this root, in its place.
 */
export const touched = (
  regions: Record<string, RegionEntry>,
  root: string,
  remote: string | null,
  now: string,
): Record<string, RegionEntry> => {
  const key = rootKeyOf(root)
  const kept = regions[key]
  if (kept !== undefined) {
    return { ...regions, [key]: { ...kept, remote: remote ?? kept.remote, lastPlayedAt: now } }
  }

  const id = regionIdOf(key)
  const named = regions[`${NAME_ONLY}${id}`]
  if (named !== undefined) {
    return rekeyed(regions, `${NAME_ONLY}${id}`, key, { ...named, root: key, remote: remote ?? named.remote, lastPlayedAt: now })
  }

  return { ...regions, [key]: { id, root: key, remote, firstPlayedAt: now, lastPlayedAt: now } }
}

/**
 * The registry with `root`'s Snapshot replaced by `snapshot` (names and
 * counts only), nothing else of its entry changed; a Region not known yet is
 * created with it, first and last played now.
 */
export const withSnapshot = (
  regions: Record<string, RegionEntry>,
  root: string,
  snapshot: RegionSnapshot,
  meta: { id: string; remote: string | null },
  now: string,
): Record<string, RegionEntry> => {
  const key = rootKeyOf(root)
  const kept = regions[key] ?? { id: meta.id, root: key, remote: meta.remote, firstPlayedAt: now, lastPlayedAt: now }

  return { ...regions, [key]: { ...kept, snapshot: cleanSnapshot(snapshot) } }
}

/** What a Quest closing cleared: its ticket's Dungeon by key, or the Wilds (null). */
export type Cleared = { dungeon: string | null }

/** Counts with one more cleared, never past the total. */
const oneMore = <T extends { total: number; cleared: number }>(counts: T): T => ({
  ...counts,
  cleared: Math.min(counts.cleared + 1, counts.total),
})

/**
 * The registry once a Quest closed at `root`: its Region touched; when the
 * Quest cleared its ticket, its Dungeon (or the Wilds) one more cleared in the
 * Snapshot, never past its total. `cleared` null (lost, unfought, or its
 * Dungeon not known) leaves the counts; the next Snapshot settles them.
 */
export const closedIn = (
  regions: Record<string, RegionEntry>,
  root: string,
  cleared: Cleared | null,
  now: string,
): Record<string, RegionEntry> => {
  const after = touched(regions, root, null, now)
  const key = rootKeyOf(root)
  const entry = after[key]
  const snapshot = entry?.snapshot
  if (entry === undefined || snapshot === undefined || cleared === null) {
    return after
  }

  const lit: RegionSnapshot =
    cleared.dungeon === null
      ? { ...snapshot, wilds: oneMore(snapshot.wilds) }
      : { ...snapshot, dungeons: snapshot.dungeons.map(dungeon => (dungeon.key === cleared.dungeon ? oneMore(dungeon) : dungeon)) }

  return { ...after, [key]: { ...entry, snapshot: lit } }
}

/**
 * The registry an older Player starts with, seeded once: a Region per root
 * they discovered Modules in (oldest first, as the store keeps them), then
 * each Region of their tally not among those, by name alone. None has a
 * Snapshot: their Islands are not mapped yet.
 */
export const seedRegions = (
  player: { tally?: Partial<Tally> } | null | undefined,
  roots: readonly string[],
  now: string,
): Record<string, RegionEntry> => {
  const regions: Record<string, RegionEntry> = {}
  for (const root of roots) {
    const key = rootKeyOf(root)
    regions[key] ??= { id: regionIdOf(key), root: key, remote: null, firstPlayedAt: now, lastPlayedAt: now }
  }

  const ids = new Set(Object.values(regions).map(entry => entry.id))
  const tallied: unknown = player?.tally?.regions
  const named = Array.isArray(tallied) ? tallied.filter((id): id is string => typeof id === 'string') : []
  for (const id of named) {
    if (!ids.has(id)) {
      ids.add(id)
      regions[`${NAME_ONLY}${id}`] = { id, root: '', remote: null, firstPlayedAt: now, lastPlayedAt: now }
    }
  }

  return regions
}

/**
 * The registry within `maxChars` of JSON: the Regions played longest ago
 * lose their Snapshots first (their Islands then say not mapped yet); every
 * Region stays, in its place.
 */
export const fitRegions = (
  regions: Record<string, RegionEntry>,
  maxChars: number = MAX_REGISTRY_CHARS,
): Record<string, RegionEntry> => {
  let fitted = regions
  while (JSON.stringify(fitted).length > maxChars) {
    let oldest: [string, RegionEntry] | undefined
    for (const each of Object.entries(fitted)) {
      if (each[1].snapshot !== undefined && (oldest === undefined || each[1].lastPlayedAt < oldest[1].lastPlayedAt)) {
        oldest = each
      }
    }
    if (oldest === undefined) {
      return fitted
    }
    const { snapshot: _dropped, ...rest } = oldest[1]
    fitted = { ...fitted, [oldest[0]]: rest }
  }

  return fitted
}

/**
 * A remote's `owner/repo`, the last two segments of its path, when it can be
 * read from the URL (`git@host:owner/repo.git`, `https://host/owner/repo`);
 * null for a local path, a file URL or none.
 */
export const remoteNameOf = (remote: string | null): string | null => {
  if (remote === null) {
    return null
  }

  const url = /^([a-z][a-z0-9+.-]*):\/\/[^/]*\/(.*)$/i.exec(remote)
  const scp = /^[^/:]+@[^/:]+:(.*)$/.exec(remote)
  const path = url !== null ? (url[1]?.toLowerCase() === 'file' ? undefined : url[2]) : scp?.[1]
  if (path === undefined) {
    return null
  }

  const segments = path.replace(/\/+$/, '').replace(/\.git$/, '').split('/').filter(Boolean)

  return segments.length < 2 ? null : segments.slice(-2).join('/')
}

/**
 * What a Quest cleared, from its Quest card as the board listed it: its
 * Dungeon's key (`card.dungeon`, a key or `{ key }`), or the Wilds when the
 * card says it has none (null); null when the card says nothing of Dungeons.
 */
export const clearedOf = (card: unknown): Cleared | null => {
  if (!isRecord(card) || !('dungeon' in card)) {
    return null
  }

  const { dungeon } = card
  if (dungeon === null || dungeon === undefined) {
    return { dungeon: null }
  }
  if (typeof dungeon === 'string') {
    return { dungeon }
  }

  return isRecord(dungeon) && typeof dungeon.key === 'string' ? { dungeon: dungeon.key } : null
}

/** The registry as kept: its entries that are entries; empty when there is none. */
const regionsOf = (kept: unknown): Record<string, RegionEntry> =>
  isRecord(kept)
    ? Object.fromEntries(Object.entries(kept).filter((pair): pair is [string, RegionEntry] => isEntry(pair[1])))
    : {}

/** The registry, as kept; empty when there is none yet. */
export async function readRegions($: EngineInterface): Promise<Record<string, RegionEntry>> {
  return regionsOf(await $.store.get(REGIONS_KEY))
}

/** The registry's changes, one after another, so none undoes another. */
let registryChanges: Promise<unknown> = Promise.resolve()

/**
 * Changes the registry, seeding it first when it was never kept (from the
 * `discovered:<root>` keys and the kept Player's tally), and keeps it within
 * MAX_REGISTRY_CHARS. Changes run one at a time, each reading what the last
 * wrote; resolves to the registry kept.
 */
function changeRegions(
  $: EngineInterface,
  change: (regions: Record<string, RegionEntry>, now: string) => Record<string, RegionEntry>,
): Promise<Record<string, RegionEntry>> {
  const changed = registryChanges.then(async () => {
    const now = new Date(await $.clock.now()).toISOString()
    const kept = await $.store.get(REGIONS_KEY)
    let regions = regionsOf(kept)
    if (kept === undefined) {
      const keys = await $.store.keys().catch((): string[] => [])
      const roots = keys.filter(key => key.startsWith(DISCOVERED)).map(key => key.slice(DISCOVERED.length))
      const player = await $.store.get('player').catch(() => undefined)
      regions = seedRegions(isRecord(player) ? (player as { tally?: Partial<Tally> }) : null, roots, now)
    }

    const next = fitRegions(change(regions, now))
    await $.store.set(REGIONS_KEY, next)

    return next
  })
  registryChanges = changed.catch(() => undefined)

  return changed
}

/** Creates or touches the Region of the session at `root` (seeding the registry once); resolves to the registry. */
export function touchRegion(
  $: EngineInterface,
  root: string,
  remote: string | null,
): Promise<Record<string, RegionEntry>> {
  return changeRegions($, (regions, now) => touched(regions, root, remote, now))
}

/**
 * Replaces the Snapshot of the Region at `root`, as the Region map took it;
 * creates its entry, first and last played now, when it has none.
 */
export async function writeSnapshot(
  $: EngineInterface,
  root: string,
  snapshot: RegionSnapshot,
  meta: { id: string; remote: string | null },
): Promise<void> {
  await changeRegions($, (regions, now) => withSnapshot(regions, root, snapshot, meta, now))
}

/** Touches the Region at `root` as a Quest closes there, lighting what it cleared; resolves to the registry. */
export function recordRegionQuestClosed(
  $: EngineInterface,
  root: string,
  cleared: Cleared | null,
): Promise<Record<string, RegionEntry>> {
  return changeRegions($, (regions, now) => closedIn(regions, root, cleared, now))
}
