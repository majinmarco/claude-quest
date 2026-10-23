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

export type GameState = {
  player: Player
  encounter: Encounter | null
}

declare module 'claude-code' {
  interface PluginState {
    'quest-mod': { game: GameState | null }
  }
}
