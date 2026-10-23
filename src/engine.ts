// The Game Engine: every game rule, as one pure step from (state, event) to
// (state, effects). It knows nothing of Claude Code.

import type { Encounter, GameState, Player, Vitals } from '../types'

export type { Encounter, GameState, Player, Vitals } from '../types'

export type GameEvent =
  | { type: 'FILE_READ'; path: string }
  | {
      type: 'SESSION_MEASURED'
      /** Absent while the context window has no reading yet. */
      mana?: number
      model?: string
      spendUsd?: number
    }

export type Effect =
  | { type: 'ENCOUNTER_STARTED'; encounter: Encounter }
  | { type: 'XP_GAINED'; amount: number }
  | { type: 'LEVEL_UP'; level: number }
  | { type: 'COMPACTION_WARNING'; mana: number }

const EXPLORATION_XP = 5

/** How full Mana is: it turns `filling`, then `warning` before compaction. */
export type ManaLevel = 'calm' | 'filling' | 'warning'

/** Mana's thresholds, as whole percentages of the context window. */
const MANA_FILLING = 50
const MANA_WARNING = 80

export const manaLevel = (mana: number | null): ManaLevel => {
  if (mana === null || mana < MANA_FILLING) {
    return 'calm'
  }

  return mana < MANA_WARNING ? 'filling' : 'warning'
}

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
  vitals: { mana: null, model: null, spendUsd: null },
})

export const step = (
  state: GameState,
  event: GameEvent,
): { state: GameState; effects: Effect[] } => {
  switch (event.type) {
    case 'FILE_READ':
      return explore(state, event.path)
    case 'SESSION_MEASURED':
      return measure(state, event)
  }
}

const explore = (
  state: GameState,
  path: string,
): { state: GameState; effects: Effect[] } => {
  const encounter: Encounter = { kind: 'Exploration', target: path }
  const gained = gainXp(state.player, EXPLORATION_XP)

  return {
    state: { ...state, player: gained.player, encounter },
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

const measure = (
  state: GameState,
  event: Extract<GameEvent, { type: 'SESSION_MEASURED' }>,
): { state: GameState; effects: Effect[] } => {
  // A measurement with no Mana reading clears it; the model and spend keep
  // their last.
  const mana = event.mana ?? null
  const vitals: Vitals = {
    mana,
    model: event.model ?? state.vitals.model,
    spendUsd: event.spendUsd ?? state.vitals.spendUsd,
  }

  // Warn once as Mana crosses into `warning`, not on every measurement there.
  const effects: Effect[] =
    mana !== null &&
    manaLevel(mana) === 'warning' &&
    manaLevel(state.vitals.mana) !== 'warning'
      ? [{ type: 'COMPACTION_WARNING', mana }]
      : []

  return { state: { ...state, vitals }, effects }
}
