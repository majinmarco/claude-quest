// Persistence: the Player in `$.store`, shared by every session and project,
// and the Region in the project's `.claude/claude-quest.json`.
// (The session's game is in `$.state`, held in hooks/register.tsx: Claude Code's
// mod loader wants every state reference written in the file that uses it.)

import type { EngineInterface } from 'claude-code'

import type { QuestRecord, Region } from '../types'
import { newPlayer } from './engine'
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

/** The kept Player, or a new one, kept, on the first load. */
export async function loadPlayer($: EngineInterface): Promise<Player> {
  const kept = await $.store.get(PLAYER)

  if (isPlayer(kept)) {
    return kept
  }

  const player = newPlayer()
  await $.store.set(PLAYER, player)

  return player
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
