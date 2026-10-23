// Persistence: the Player in `$.store`, shared by every session and project.
// (The session's game is in `$.state`, held in hooks/register.tsx: Claude Code's
// mod loader wants every state reference written in the file that uses it.)

import type { EngineInterface } from 'claude-code'

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
