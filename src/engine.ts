// The Game Engine: every game rule, as one pure step from (state, event) to
// (state, effects). It knows nothing of Claude Code.

import type { Encounter, GameState, Player } from '../types'

export type { Encounter, GameState, Player } from '../types'

export type GameEvent = { type: 'FILE_READ'; path: string }

export type Effect =
  | { type: 'ENCOUNTER_STARTED'; encounter: Encounter }
  | { type: 'XP_GAINED'; amount: number }
  | { type: 'LEVEL_UP'; level: number }

const EXPLORATION_XP = 5

/** XP needed to clear a level: 100 at level 1, 200 at level 2, and so on. */
export const xpToClear = (level: number): number => 100 * level

export const newPlayer = (): Player => ({
  level: 1,
  xp: 0,
  hp: 100,
  maxHp: 100,
  stats: {
    intelligence: 0,
    wisdom: 0,
    dexterity: 0,
    strength: 0,
    charisma: 0,
    constitution: 0,
  },
})

export const newGame = (player: Player = newPlayer()): GameState => ({
  player,
  encounter: null,
})

export const step = (
  state: GameState,
  event: GameEvent,
): { state: GameState; effects: Effect[] } => {
  const encounter: Encounter = { kind: 'Exploration', target: event.path }
  const gained = gainXp(state.player, EXPLORATION_XP)

  return {
    state: { player: gained.player, encounter },
    effects: [
      { type: 'ENCOUNTER_STARTED', encounter },
      { type: 'XP_GAINED', amount: EXPLORATION_XP },
      ...gained.effects,
    ],
  }
}

const gainXp = (
  player: Player,
  amount: number,
): { player: Player; effects: Effect[] } => {
  let { level, xp } = player
  const effects: Effect[] = []
  xp += amount

  while (xp >= xpToClear(level)) {
    xp -= xpToClear(level)
    level += 1
    effects.push({ type: 'LEVEL_UP', level })
  }

  return { player: { ...player, level, xp }, effects }
}
