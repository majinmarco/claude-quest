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

/** The Quest the session is playing: one ticket, and its Encounters so far. */
export type Quest = {
  /** The ticket's reference as its Quest Source writes it: `#4`, `ABC-123`. */
  ticket: string
  /** The Encounters played during the Quest, oldest first. */
  encounters: Encounter[]
}

export type GameState = {
  player: Player
  encounter: Encounter | null
  vitals: Vitals
  /** The active Quest; one at a time per session, null between Quests. */
  quest: Quest | null
}

/** One Quest in a Region's history, as the Region file keeps it. */
export type QuestRecord = {
  ticket: string
  /** When the Quest started, as an ISO 8601 timestamp. */
  startedAt: string
  /** `abandoned` once another Quest replaced it before it closed. */
  status: 'active' | 'abandoned'
}

/** The Region file: one project's `.claude/claude-quest.json`. */
export type Region = {
  /** Every Quest started in the project, oldest first. */
  quests: QuestRecord[]
}

declare module 'claude-code' {
  interface PluginState {
    'quest-mod': { game: GameState | null }
  }
}
