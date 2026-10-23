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

/** One of the six Stats, by its key in `Stats`. */
export type StatName = keyof Stats

/**
 * How hard a Quest is, read only from its ticket (story points, a size
 * label), never from the Player. `Unrated` when the ticket names neither.
 */
export type Difficulty = 'Trivial' | 'Easy' | 'Medium' | 'Hard' | 'Epic' | 'Unrated'

/** One Quest on the Quest Board, as its Quest Source lists it. */
export type QuestCard = {
  /** The ticket's reference as its Quest Source writes it: `#4`, `ABC-123`. */
  ticket: string
  title: string
  /** The ticket's status, as its Quest Source names it (`ready-for-agent`, `open`). */
  status: string
  difficulty: Difficulty
  /** The Stats the Quest calls on, as guidance; never empty. */
  recommendedStats: StatName[]
  /** Where the ticket lives, for the Player to open; absent when unknown. */
  url?: string
}

/** Why a Quest Source could not list its Quests. */
export type QuestSourceProblem = {
  /**
   * `missing`: the tool it calls is not installed; `unauthenticated`: it is
   * not signed in; `unreachable`: any other failure, told in `message`.
   */
  kind: 'missing' | 'unauthenticated' | 'unreachable'
  message: string
}

/** What the Quest Board shows: its Quests as last listed, and its filters. */
export type QuestBoard = {
  listing:
    | { state: 'loading' }
    | { state: 'listed'; quests: QuestCard[] }
    | { state: 'unavailable'; problem: QuestSourceProblem }
  /** null shows every status, or every difficulty. */
  filters: { status: string | null; difficulty: Difficulty | null }
}

declare module 'claude-code' {
  interface PluginState {
    'quest-mod': { game: GameState | null; board: QuestBoard }
  }
}
