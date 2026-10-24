// Sample registries of Regions for the World's tests and its snapshot
// (scripts/render-art.mjs --snapshot): two Regions, then a third joining.

import type { RegionEntry, RegionSnapshot } from '../../src/region-registry'

/** The session's root in the samples. */
export const HERE = '/home/player/claude-quest'

/** A Snapshot of `dungeons` (total, cleared) and the Wilds. */
export const snapshotOf = (dungeons: [number, number][], wilds: [number, number] = [0, 0], takenAt = '2026-10-20T09:30:00.000Z'): RegionSnapshot => ({
  takenAt,
  dungeons: dungeons.map(([total, cleared], at) => ({ key: `m${at + 1}`, name: `Milestone ${at + 1}`, total, cleared })),
  wilds: { total: wilds[0], cleared: wilds[1] },
  modules: { discovered: 4, total: 12 },
})

/** claude-quest, played first: 12 Quests (medium), 5 cleared. */
const CLAUDE_QUEST: RegionEntry = {
  id: 'claude-quest',
  root: HERE,
  remote: 'git@github.com:majinmarco/claude-quest.git',
  firstPlayedAt: '2026-10-01T10:00:00.000Z',
  lastPlayedAt: '2026-10-24T10:00:00.000Z',
  snapshot: snapshotOf([[8, 3]], [4, 2]),
}

/** vault, played second: 6 Quests (small), all cleared. */
const VAULT: RegionEntry = {
  id: 'vault',
  root: '/home/player/vault',
  remote: 'git@github.com:majinmarco/vault.git',
  firstPlayedAt: '2026-10-05T10:00:00.000Z',
  lastPlayedAt: '2026-10-06T10:00:00.000Z',
  snapshot: snapshotOf([], [6, 6]),
}

/** Another vault, a client's, played third: never mapped. */
const CLIENT_VAULT: RegionEntry = {
  id: 'vault',
  root: '/home/player/clients/vault',
  remote: 'https://github.com/acme/vault.git',
  firstPlayedAt: '2026-10-10T10:00:00.000Z',
  lastPlayedAt: '2026-10-10T10:00:00.000Z',
}

/** A big one, played fourth: 64 Quests (large), 16 cleared. */
const MONOREPO: RegionEntry = {
  id: 'monorepo',
  root: '/home/player/monorepo',
  remote: null,
  firstPlayedAt: '2026-10-12T10:00:00.000Z',
  lastPlayedAt: '2026-10-12T10:00:00.000Z',
  snapshot: snapshotOf([[30, 10], [20, 6]], [14, 0]),
}

export const TWO_REGIONS: Record<string, RegionEntry> = { [HERE]: CLAUDE_QUEST, [VAULT.root]: VAULT }

export const THREE_REGIONS: Record<string, RegionEntry> = { ...TWO_REGIONS, [CLIENT_VAULT.root]: CLIENT_VAULT }

export const FOUR_REGIONS: Record<string, RegionEntry> = { ...THREE_REGIONS, [MONOREPO.root]: MONOREPO }

/** The two Regions themed (issue #17): claude-quest a snowy hold, vault a desert vault. */
export const THEMED_REGIONS: Record<string, RegionEntry> = {
  [HERE]: { ...CLAUDE_QUEST, theme: { name: 'Frosthold', biome: 'snow', themedAt: '2026-10-24T10:00:00.000Z' } },
  [VAULT.root]: { ...VAULT, theme: { name: 'Sunscorch Vault', biome: 'desert', themedAt: '2026-10-24T10:00:00.000Z' } },
}
