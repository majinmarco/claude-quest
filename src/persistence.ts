// Persistence: the Player in `$.store`, shared by every session and project,
// and the Region in the project's `.claude/claude-quest.json`.
// (The session's game is in `$.state`, held in hooks/register.tsx: Claude Code's
// mod loader wants every state reference written in the file that uses it.)

import type { EngineInterface } from 'claude-code'

import type { Badge, QuestOutcome, QuestRecord, Region, Stats, Tally, Trophy } from '../types'
import { BADGES, emptyTally, levelOf, MAX_HP, newPlayer, trophyNameOf } from './engine'
import type { Player } from './engine'

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

/**
 * Adds the modules the session has discovered to the Region's. The session's
 * whole list goes in, not one module, so a write that failed is made good by
 * the next.
 */
export function recordModulesDiscovered(
  $: EngineInterface,
  modules: readonly string[],
): Promise<void> {
  return changeRegion($, region => ({
    ...region,
    discoveredModules: [...new Set([...discoveredModulesOf(region), ...modules])],
  }))
}

/** The modules a Region file's JSON says were discovered; none when it says none. */
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

/** Adds a Quest, just started, to the Region's history. */
export async function recordQuestStarted(
  $: EngineInterface,
  ticket: string,
): Promise<void> {
  const startedAt = new Date(await $.clock.now()).toISOString()

  await changeQuests($, quests => [
    ...quests,
    { ticket, startedAt, status: 'active' },
  ])
}

/** Marks the Quest's latest active run abandoned in the Region's history. */
export function recordQuestAbandoned(
  $: EngineInterface,
  ticket: string,
): Promise<void> {
  return changeQuests($, quests => {
    const latest = quests.findLastIndex(
      quest => quest.ticket === ticket && quest.status === 'active',
    )

    return quests.map((quest, index) =>
      index === latest ? { ...quest, status: 'abandoned' } : quest,
    )
  })
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

  await changeQuests($, quests => {
    const latest = quests.findLastIndex(
      quest => quest.ticket === ticket && quest.status === 'active',
    )

    return quests.map((quest, index) =>
      index === latest ? { ...quest, status: outcome, endedAt } : quest,
    )
  })
}
