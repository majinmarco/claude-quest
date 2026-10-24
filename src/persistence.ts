// Persistence: the Player in `$.store`, shared by every session and project,
// with the Modules they discovered in each project (`discovered:<root>`), and
// the Region in the project's `.claude/claude-quest.json`.
// (The session's game is in `$.state`, held in hooks/register.tsx: Claude Code's
// mod loader wants every state reference written in the file that uses it.)

import type { EngineInterface } from 'claude-code'

import type { Badge, QuestOutcome, QuestRecord, Region, Stats, Tally, Trophy } from '../types'
import { BADGES, emptyTally, levelOf, MAX_HP, newPlayer, trophyNameOf } from './engine'
import type { Player } from './engine'
import { moduleOfFolder } from './translate'

const PLAYER = 'player'

const isPlayer = (value: unknown): value is Player => {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const { level, xp, hp, stats } = value as Partial<Player>

  return (
    typeof level === 'number' &&
    typeof xp === 'number' &&
    typeof hp === 'number' &&
    typeof stats === 'object'
  )
}

/** A level change a migration made: the old curve's level, and the new one's. */
export type LevelChange = { from: number; to: number }

const numberOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

/** A badge an older mod kept: one per Boss Fight won, named after its Quest. */
type OldBadge = { name?: unknown; ticket?: unknown; earnedAt?: unknown }

/**
 * A Player kept by any version of the mod, as this one plays it. One kept
 * before ADR 0002 has no lifetime XP: it is the old curve's (100·L per level)
 * sum to its level plus its XP, and its level is derived again on the new
 * curve, so it may drop a few levels (`levelChange` says so). Max HP is
 * MAX_HP; the tally and every other new field are filled with defaults; the
 * old per-ticket badges become trophies, their Region unknown.
 */
export const migratePlayer = (kept: Player): { player: Player; levelChange: LevelChange | null } => {
  const fresh = newPlayer()
  const raw = kept as Partial<Player> & { totalXp?: unknown; tally?: Partial<Tally> }
  const level = Math.max(1, Math.floor(numberOr(raw.level, 1)))
  const totalXp =
    typeof raw.totalXp === 'number'
      ? raw.totalXp
      : 50 * level * (level - 1) + Math.max(0, numberOr(raw.xp, 0))
  const derived = levelOf(totalXp)
  const tally: Tally = { ...emptyTally(), ...(typeof raw.tally === 'object' && raw.tally !== null ? raw.tally : {}) }
  const stats: Stats = { ...fresh.stats, ...raw.stats }
  const keptBadges = Array.isArray(raw.badges) ? (raw.badges as (Badge | OldBadge)[]) : []
  const badges = keptBadges.filter(
    (badge): badge is Badge => 'id' in badge && typeof badge.id === 'string' && badge.id in BADGES,
  )
  const formerTrophies: Trophy[] = keptBadges
    .filter((badge): badge is OldBadge => !('id' in badge) && typeof badge.ticket === 'string')
    .map(badge => ({
      name: trophyNameOf(null, badge.ticket as string),
      region: null,
      ticket: badge.ticket as string,
      earnedAt: numberOr(badge.earnedAt, 0),
    }))
  const trophies = [...(Array.isArray(raw.trophies) ? raw.trophies : []), ...formerTrophies]

  const player: Player = {
    ...kept,
    level: derived.level,
    xp: derived.xp,
    totalXp,
    hp: Math.max(0, Math.min(MAX_HP, numberOr(raw.hp, MAX_HP))),
    maxHp: MAX_HP,
    stats,
    tally,
    ...(raw.badges === undefined ? {} : { badges }),
    ...(trophies.length === 0 ? {} : { trophies }),
  }

  return {
    player,
    levelChange: derived.level === level ? null : { from: level, to: derived.level },
  }
}

/**
 * The kept Player, migrated to this mod's shape (and kept so), or a new one,
 * kept, on the first load; with the level change a migration made, if any.
 */
export async function loadPlayerMigrated(
  $: EngineInterface,
): Promise<{ player: Player; levelChange: LevelChange | null }> {
  const kept = await $.store.get(PLAYER)

  if (isPlayer(kept)) {
    const migrated = migratePlayer(kept)
    if (JSON.stringify(migrated.player) !== JSON.stringify(kept)) {
      await $.store.set(PLAYER, migrated.player)
    }

    return migrated
  }

  const player = newPlayer()
  await $.store.set(PLAYER, player)

  return { player, levelChange: null }
}

/** The kept Player, migrated, or a new one, kept, on the first load. */
export async function loadPlayer($: EngineInterface): Promise<Player> {
  return (await loadPlayerMigrated($)).player
}

export function savePlayer($: EngineInterface, player: Player): Promise<void> {
  return $.store.set(PLAYER, player)
}

/** The Region file, under the project's root. */
export const REGION_FILE = '.claude/claude-quest.json'

const isRegion = (value: unknown): value is Region =>
  typeof value === 'object' &&
  value !== null &&
  Array.isArray((value as Partial<Region>).quests)

/** The Region file's changes, one after another, so none undoes another. */
let regionChanges: Promise<void> = Promise.resolve()

/**
 * Changes the Region file, creating it on first use. A file that is not a
 * Region (hand-edited into invalid JSON, say) is left as it is rather than
 * overwritten: the game still plays, unrecorded. Changes run one at a time,
 * each reading what the last wrote.
 */
function changeRegion(
  $: EngineInterface,
  change: (region: Region) => Region,
): Promise<void> {
  const changed = regionChanges.then(async () => {
    const path = `${await $.session.root()}/${REGION_FILE}`
    let region: Region = { quests: [] }

    if (await $.fs.exists(path)) {
      let kept: unknown
      try {
        kept = JSON.parse(await $.fs.read(path))
      } catch {
        return
      }
      if (!isRegion(kept)) {
        return
      }
      region = kept
    }

    // Keys the mod does not know yet are kept as they are.
    await $.fs.write(path, `${JSON.stringify(change(region), null, 2)}\n`)
  })
  regionChanges = changed.catch(() => undefined)

  return changed
}

function changeQuests(
  $: EngineInterface,
  change: (quests: QuestRecord[]) => QuestRecord[],
): Promise<void> {
  return changeRegion($, region => ({ ...region, quests: change(region.quests) }))
}

/** The `$.store` key the Player keeps a project's discovered Modules under. */
export const discoveredKey = (root: string): string =>
  `discovered:${root.replace(/\\/g, '/').replace(/(.)\/+$/, '$1')}`

const isModuleList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(module => typeof module === 'string')

/**
 * The Modules the Player has discovered in the project at `root`, kept in
 * `$.store` per project. On the first load for a project they are seeded,
 * once, from the Region file an older mod kept them in (as the Modules they
 * are in now), and kept; the Region file is left as it is.
 */
export async function loadDiscovered($: EngineInterface, root: string): Promise<string[]> {
  const kept = await $.store.get(discoveredKey(root))
  if (isModuleList(kept)) {
    return kept
  }

  // A Region file that could not be read now is tried again next session.
  const region = await readRegionFile($).catch(() => null)
  if (region === null) {
    return []
  }
  const seeded = region.ok ? discoveredModulesOf(region.value) : []
  const modules = [...new Set(seeded.map(moduleOfFolder).filter(module => module !== null))]
  await $.store.set(discoveredKey(root), modules)

  return modules
}

/**
 * Adds the modules the session has discovered to the Player's for the
 * project at `root`. The session's whole list goes in, not one module, so a
 * write that failed is made good by the next.
 */
export async function recordModulesDiscovered(
  $: EngineInterface,
  root: string,
  modules: readonly string[],
): Promise<void> {
  // Seeded first when it never was, so a Region file's list is never lost.
  const kept = await loadDiscovered($, root)
  await $.store.set(discoveredKey(root), [...new Set([...kept, ...modules])])
}

/**
 * The `$.store` key the Player keeps a project's charted Modules under: a
 * sibling of its discovered ones, so a mod reading `discovered:<root>` as a
 * list of Modules reads it as before.
 */
export const chartedKey = (root: string): string =>
  `charted:${root.replace(/\\/g, '/').replace(/(.)\/+$/, '$1')}`

/** The Modules the Player has charted in the project at `root`; none until the first. */
export async function loadCharted($: EngineInterface, root: string): Promise<string[]> {
  const kept = await $.store.get(chartedKey(root))

  return isModuleList(kept) ? kept : []
}

/**
 * Adds the Modules the session has charted to the Player's for the project
 * at `root`: the session's whole list, so a write that failed is made good
 * by the next.
 */
export async function recordModulesCharted(
  $: EngineInterface,
  root: string,
  modules: readonly string[],
): Promise<void> {
  const kept = await loadCharted($, root)
  await $.store.set(chartedKey(root), [...new Set([...kept, ...modules])])
}

/**
 * The modules an older mod's Region file says were discovered; none when it
 * says none. Read once per project, to seed the Player's.
 */
export const discoveredModulesOf = (region: unknown): string[] => {
  const modules =
    typeof region === 'object' && region !== null
      ? (region as Partial<Region>).discoveredModules
      : undefined

  return Array.isArray(modules) ? modules.filter(module => typeof module === 'string') : []
}

/**
 * The Region file's JSON as kept, for reading settings from it: undefined
 * when there is none; not ok, with the reason, when it is not JSON.
 */
export async function readRegionFile(
  $: EngineInterface,
): Promise<{ ok: true; value: unknown } | { ok: false; reason: string }> {
  const path = `${await $.session.root()}/${REGION_FILE}`
  if (!(await $.fs.exists(path))) {
    return { ok: true, value: undefined }
  }

  try {
    return { ok: true, value: JSON.parse(await $.fs.read(path)) as unknown }
  } catch {
    return { ok: false, reason: `${REGION_FILE} is not valid JSON.` }
  }
}

/**
 * Adds a Quest, just started, to the Region's history, named after the
 * session that started it. A ticket whose latest run is still active (left by
 * an earlier session, or the same one reloaded) is taken up again instead:
 * that run now names this session, and when it was resumed.
 */
export async function recordQuestStarted(
  $: EngineInterface,
  ticket: string,
): Promise<void> {
  const now = new Date(await $.clock.now()).toISOString()
  const sessionId = await $.session.id().catch(() => null)
  const session = sessionId === null ? {} : { sessionId }

  await changeQuests($, quests => {
    const latest = quests.findLastIndex(quest => quest.ticket === ticket)
    if (latest !== -1 && quests[latest]?.status === 'active') {
      return quests.map((quest, index) => (index === latest ? { ...quest, ...session, resumedAt: now } : quest))
    }

    return [...quests, { ticket, startedAt: now, status: 'active', ...session }]
  })
}

/** How long a Quest may stay active in the history before a session start calls it abandoned. */
export const STALE_QUEST_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Marks the Quests the history holds active for more than STALE_QUEST_MS
 * (since they started, or were last taken up again) abandoned, ended now:
 * sessions that ended without closing them. Run at session start; a Region
 * file with none stale is left as it is, and none is created.
 */
export async function pruneStaleQuests($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  const isStale = (quest: QuestRecord) =>
    quest.status === 'active' && now - Date.parse(quest.resumedAt ?? quest.startedAt) > STALE_QUEST_MS

  const region = await readRegionFile($)
  const quests = region.ok && isRegion(region.value) ? region.value.quests : []
  if (!quests.some(isStale)) {
    return
  }

  const endedAt = new Date(now).toISOString()
  await changeQuests($, kept =>
    kept.map(quest => (isStale(quest) ? { ...quest, status: 'abandoned', endedAt } : quest)),
  )
}

/**
 * The history with `ticket`'s latest active run ended as `status` at
 * `endedAt` (an ISO 8601 timestamp; kept on an abandoned run only when it is
 * added here). With no active run to end (its start never written, or the
 * file written over since), the run is added, started and ended at
 * `endedAt`, so every Quest that ended is in the history.
 */
const endRun = (
  quests: QuestRecord[],
  ticket: string,
  status: QuestRecord['status'],
  endedAt: string,
): QuestRecord[] => {
  const latest = quests.findLastIndex(quest => quest.ticket === ticket && quest.status === 'active')
  if (latest === -1) {
    return [...quests, { ticket, startedAt: endedAt, status, endedAt }]
  }

  return quests.map((quest, index) =>
    index !== latest ? quest : status === 'abandoned' ? { ...quest, status } : { ...quest, status, endedAt },
  )
}

/** Marks the Quest's latest active run abandoned in the Region's history. */
export async function recordQuestAbandoned(
  $: EngineInterface,
  ticket: string,
): Promise<void> {
  const endedAt = new Date(await $.clock.now()).toISOString()

  await changeQuests($, quests => endRun(quests, ticket, 'abandoned', endedAt))
}

/**
 * Marks the Quest's latest active run closed in the Region's history: how its
 * Boss Fight ended it, and when.
 */
export async function recordQuestClosed(
  $: EngineInterface,
  ticket: string,
  outcome: QuestOutcome,
): Promise<void> {
  const endedAt = new Date(await $.clock.now()).toISOString()

  await changeQuests($, quests => endRun(quests, ticket, outcome, endedAt))
}
