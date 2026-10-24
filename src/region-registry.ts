// The registry of Regions: every project the Player has played, kept in the
// Player's store (`$.store` key `regions`) by its project root, each with a
// Snapshot of its map, so the World can draw a Region whose project is not
// open. This is the Region map's minimal version (issue #15); the Overview's
// (issue #16) owns the file and replaces it with its fuller one.

import type { EngineInterface } from 'claude-code'

/** What the World remembers of a Region: its Dungeons, the Wilds and its Modules, by count, and when. */
export type RegionSnapshot = {
  /** When it was taken, as an ISO 8601 timestamp. */
  takenAt: string
  dungeons: { key: string; name: string; total: number; cleared: number }[]
  wilds: { total: number; cleared: number }
  modules: { discovered: number; total: number }
}

/** One Region in the registry: its id (the project's folder name), root, git remote, and when played. */
export type RegionEntry = {
  id: string
  root: string
  remote: string | null
  firstPlayedAt: string
  lastPlayedAt: string
  snapshot?: RegionSnapshot
}

/** The `$.store` key of the registry: a record of RegionEntry by project root. */
export const REGIONS_KEY = 'regions'

const isRecord = (value: unknown): value is Record<string, RegionEntry> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** The registry as kept; empty when there is none. */
export async function readRegions($: EngineInterface): Promise<Record<string, RegionEntry>> {
  const kept = await $.store.get(REGIONS_KEY)

  return isRecord(kept) ? kept : {}
}

/**
 * Keeps `snapshot` as the Region at `root`'s: a Region not yet in the
 * registry joins it, first and last played now; one already there has its
 * Snapshot replaced, and nothing else.
 */
export async function writeSnapshot(
  $: EngineInterface,
  root: string,
  snapshot: RegionSnapshot,
  meta: { id: string; remote: string | null },
): Promise<void> {
  const regions = await readRegions($)
  const kept = regions[root]
  const now = new Date(await $.clock.now()).toISOString()
  const entry: RegionEntry =
    kept === undefined
      ? { id: meta.id, root, remote: meta.remote, firstPlayedAt: now, lastPlayedAt: now, snapshot }
      : { ...kept, snapshot }

  await $.store.set(REGIONS_KEY, { ...regions, [root]: entry })
}
