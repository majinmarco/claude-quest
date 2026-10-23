// Claude Quest's contract: the game's data types, and the values the mod keeps
// in `$.state` for the session.

export type Stats = {
  intelligence: number
  wisdom: number
  dexterity: number
  strength: number
  charisma: number
  constitution: number
}

export type Player = {
  level: number
  /** XP earned towards the next level. */
  xp: number
  hp: number
  maxHp: number
  stats: Stats
}

export type Encounter = { kind: 'Exploration'; target: string }

/** The session's vitals, as the engine last measured them; null until then. */
export type Vitals = {
  /** Mana: the share of the context window used, a whole percentage. */
  mana: number | null
  /** The main loop's model, as `/model` shows it. */
  model: string | null
  /** What the session has cost so far, in US dollars. */
  spendUsd: number | null
}

export type GameState = {
  player: Player
  encounter: Encounter | null
  vitals: Vitals
}

declare module 'claude-code' {
  interface PluginState {
    'quest-mod': { game: GameState | null }
  }
}
